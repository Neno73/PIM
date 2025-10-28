# Improvement Plan - Atlas PIM Refactoring

*Created: 2025-10-28 09:45*

## Overview

This document outlines the refactoring plan for Atlas PIM to address technical debt and improve maintainability.

## Goals

1. **Modularize sync service** - Break 2386-line monolith into focused modules
2. **Move supplier mapping to database** - Replace hardcoded mapping with admin-manageable table
3. **Add Redis caching** - Improve API performance and reduce database load
4. **Rotate secrets** - Address potential security exposure from git history

---

## 1. Modularize Sync Service

### Current State
- Single file: `backend/src/api/promidata-sync/services/promidata-sync.ts` (2386 lines)
- ~32 methods covering 6 distinct concerns
- Difficult to test, maintain, and understand

### Proposed Module Structure

```
backend/src/api/promidata-sync/
├── services/
│   ├── promidata-sync.ts              # Main orchestrator (300-400 lines)
│   │
│   └── modules/
│       ├── data-extractor.service.ts   # Data extraction & parsing
│       ├── api-client.service.ts       # Promidata API communication
│       ├── sync-orchestrator.service.ts # Sync coordination
│       ├── database.service.ts         # Database CRUD operations
│       ├── image.service.ts            # Image upload/processing
│       └── utils.service.ts            # Shared utilities
│
├── types/
│   ├── promidata.types.ts             # API response types
│   ├── product.types.ts               # Product/variant types
│   └── sync.types.ts                  # Sync operation types
│
└── config/
    └── supplier-mapping.ts            # Until DB migration complete
```

### Module Responsibilities

#### 1. data-extractor.service.ts (~400 lines)
**Purpose:** Extract and transform data from Promidata responses

**Methods:**
- `extractFirstSkuFromDefaultProducts()`
- `extractFieldWithLanguagePriority()`
- `getNestedValue()`
- `cleanHtmlFromDescription()`
- `extractColorCodeForGrouping()`
- `extractProductCode()`
- `extractVariantSku()`
- `parseConfigurationFields()`
- `extractSizesForColor()`
- `extractEmbroiderySizes()`
- `isServiceBaseVariant()`

**Dependencies:** None (pure functions)

#### 2. api-client.service.ts (~500 lines)
**Purpose:** Handle all HTTP communication with Promidata API

**Methods:**
- `fetchSuppliersFromPromidata()`
- `fetchSupplierRealName()`
- `fetchCategoriesFromPromidata()`
- `parseProductUrlsWithHashes()`
- `fetchProductData()`
- `fetchProductsFromPromidata()`
- `retry()` - Generic retry wrapper
- `testConnection()`

**Configuration:**
```typescript
{
  baseUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}
```

**Dependencies:** node-fetch, config

#### 3. sync-orchestrator.service.ts (~600 lines)
**Purpose:** Coordinate sync operations and business logic

**Methods:**
- `startSync()` - Main entry point
- `syncSupplier()` - Sync single supplier
- `createOrUpdateParentProduct()` - Complex product creation logic
- `processVariants()` - Variant processing (extract from createOrUpdateParentProduct)

**Dependencies:** api-client, data-extractor, database, image

#### 4. database.service.ts (~300 lines)
**Purpose:** All Strapi database operations

**Methods:**
- `createOrUpdateCategory()`
- `createOrUpdateSupplier()`
- `createOrUpdateProduct()`
- `createOrUpdateVariant()`
- `updateSyncConfiguration()`
- `updateMissingSupplierNames()`
- `findSupplierByCode()`
- `findProductBySku()`

**Dependencies:** Strapi entityService

#### 5. image.service.ts (~200 lines)
**Purpose:** Image download and R2 upload

**Methods:**
- `uploadImageFromUrl()` - Download and upload to R2
- `generateImageName()` - SKU-based naming
- `validateImageUrl()` - Check URL validity
- `resizeImage()` - Optional image optimization

**Dependencies:** node-fetch, Strapi upload service

#### 6. utils.service.ts (~100 lines)
**Purpose:** Shared utilities

**Methods:**
- `generateDeepHash()` - MD5 hashing for change detection
- `validateSku()` - SKU format validation
- `parseSupplierCode()` - Extract supplier code from data

**Dependencies:** crypto

### Migration Strategy

**Phase 1: Extract Utilities (Low Risk)**
1. Create `utils.service.ts`
2. Move `generateDeepHash()` and helper methods
3. Update imports in main service
4. Test sync operation

**Phase 2: Extract Data Extraction (Low Risk)**
1. Create `data-extractor.service.ts`
2. Move all extraction methods
3. These are pure functions - easy to test
4. Update imports

**Phase 3: Extract API Client (Medium Risk)**
1. Create `api-client.service.ts`
2. Move all fetch methods
3. Add retry logic wrapper
4. Test with real Promidata API

**Phase 4: Extract Database Operations (Medium Risk)**
1. Create `database.service.ts`
2. Move CRUD operations
3. Add transaction support
4. Test thoroughly with staging data

**Phase 5: Extract Image Service (Low Risk)**
1. Create `image.service.ts`
2. Move upload logic
3. Test with sample images

**Phase 6: Create Sync Orchestrator (High Risk)**
1. Create `sync-orchestrator.service.ts`
2. Move `startSync()`, `syncSupplier()`, product creation
3. Wire up all dependencies
4. Comprehensive testing

**Phase 7: Slim Down Main Service (Final)**
1. Main service becomes thin controller
2. Delegates to modules
3. ~300 lines max

### Testing Strategy

For each module:
1. **Manual test** after extraction
2. **Integration test** - Run sync for test supplier (e.g., A113)
3. **Verify** - Products created correctly, images uploaded, no errors
4. **Rollback plan** - Keep original file as backup

---

## 2. Move Supplier Mapping to Database

### Current State
Hardcoded in `promidata-sync.ts`:
```typescript
const supplierNameMapping = {
  A23: 'XD Connects (Xindao)',
  A24: 'Clipper',
  A30: 'Senator GmbH',
  // ... ~30 more suppliers
};
```

**Problems:**
- Code changes required for new suppliers
- No admin UI
- Not scalable beyond ~50 suppliers

### Proposed Solution

#### A. Enhance Existing Supplier Content Type

Add fields to existing `supplier` schema:
```json
{
  "attributes": {
    "code": "string",          // Already exists
    "name": "string",          // Already exists
    "display_name": "string",  // NEW - Human-friendly name
    "is_active": "boolean",    // NEW - Enable/disable supplier
    "mapping_source": "enum",  // NEW - "promidata" | "manual"
    "last_sync_date": "datetime",
    "last_sync_status": "string"
  }
}
```

#### B. Create Migration Script

**File:** `backend/scripts/migrate-supplier-mapping-to-db.js`

```javascript
// 1. Read hardcoded mapping from service
const supplierMapping = {
  A23: 'XD Connects (Xindao)',
  A24: 'Clipper',
  // ... all existing mappings
};

// 2. Create/update suppliers in database
for (const [code, displayName] of Object.entries(supplierMapping)) {
  await strapi.entityService.create('api::supplier.supplier', {
    data: {
      code,
      name: displayName,
      display_name: displayName,
      is_active: true,
      mapping_source: 'promidata'
    }
  });
}

// 3. Verify count
console.log(`Migrated ${Object.keys(supplierMapping).length} suppliers`);
```

#### C. Update Sync Service

Replace hardcoded lookup with database query:

**Old:**
```typescript
const supplierName = supplierNameMapping[code] || 'Unknown Supplier';
```

**New:**
```typescript
// In database.service.ts
async getSupplierDisplayName(code: string): Promise<string> {
  const supplier = await strapi.db
    .query('api::supplier.supplier')
    .findOne({
      where: { code, is_active: true },
      select: ['display_name', 'name']
    });

  return supplier?.display_name || supplier?.name || 'Unknown Supplier';
}
```

**With caching (after Redis integration):**
```typescript
async getSupplierDisplayName(code: string): Promise<string> {
  const cacheKey = `supplier:name:${code}`;

  // Check cache first
  const cached = await redis.get(cacheKey);
  if (cached) return cached;

  // Query database
  const supplier = await strapi.db.query('api::supplier.supplier').findOne({
    where: { code, is_active: true }
  });

  const name = supplier?.display_name || 'Unknown Supplier';

  // Cache for 1 hour
  await redis.setex(cacheKey, 3600, name);

  return name;
}
```

#### D. Admin UI Enhancement

Suppliers can now be managed in Strapi admin:
1. Navigate to Content Manager → Supplier
2. Add new supplier: code, name, display_name, is_active
3. Edit existing suppliers
4. Deactivate suppliers (soft delete)

### Migration Timeline

1. **Add fields to supplier schema** (5 min)
2. **Run migration script** (2 min)
3. **Update database.service.ts** (15 min)
4. **Test sync with database lookup** (10 min)
5. **Remove hardcoded mapping** (5 min)
6. **Deploy and verify** (10 min)

**Total: ~45 minutes**

---

## 3. Redis Caching Layer

### Rationale
- Reduce database queries
- Improve API response times
- Cache supplier data, product listings, categories

### Architecture

```
Frontend → Strapi API → Redis Cache → PostgreSQL
                 ↓           ↓
              Cache Miss  Cache Hit
                 ↓           ↓
             Query DB    Return Cached
                 ↓
             Cache Result
```

### Implementation Plan

#### A. Add Redis to Stack

**docker-compose-promovere-pim.yml:**
```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: promoatlas-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - promoatlas-network
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 3

  backend:
    depends_on:
      - redis
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379

volumes:
  redis_data:
```

#### B. Install Redis Client

```bash
cd backend
npm install ioredis
npm install --save-dev @types/ioredis
```

#### C. Create Redis Service

**File:** `backend/src/services/redis.service.ts`

```typescript
import Redis from 'ioredis';

class RedisService {
  private client: Redis;

  constructor() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });

    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.setex(key, ttl, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async flushPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }
}

export default new RedisService();
```

#### D. Cache Strategy

**Cache Keys Pattern:**
```
supplier:{code}              # Individual supplier
suppliers:list               # All suppliers
products:list:{page}:{size}  # Paginated products
product:{sku}                # Individual product
categories:tree              # Category hierarchy
sync:status                  # Sync status
```

**TTL Strategy:**
- Suppliers: 1 hour (rarely change)
- Products: 15 minutes (sync updates)
- Categories: 1 hour (rarely change)
- Sync status: 5 minutes (changes during sync)

#### E. Middleware for API Caching

**File:** `backend/src/middlewares/cache.middleware.ts`

```typescript
export default (config, { strapi }) => {
  return async (ctx, next) => {
    // Only cache GET requests
    if (ctx.method !== 'GET') {
      return await next();
    }

    // Skip admin routes
    if (ctx.url.startsWith('/admin')) {
      return await next();
    }

    // Generate cache key
    const cacheKey = `api:${ctx.url}`;

    // Check cache
    const cached = await redis.get(cacheKey);
    if (cached) {
      ctx.body = JSON.parse(cached);
      ctx.set('X-Cache', 'HIT');
      return;
    }

    // Execute request
    await next();

    // Cache successful responses
    if (ctx.status === 200 && ctx.body) {
      await redis.setex(cacheKey, 900, JSON.stringify(ctx.body)); // 15 min
      ctx.set('X-Cache', 'MISS');
    }
  };
};
```

**Register middleware in `backend/config/middlewares.ts`:**
```typescript
export default [
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  'global::cache',  // Add this
  // ... rest
];
```

#### F. Cache Invalidation Strategy

**On Product Create/Update:**
```typescript
// In sync service after product update
await redis.del(`product:${sku}`);
await redis.flushPattern('products:list:*'); // Clear all product lists
await redis.del('sync:status');
```

**On Supplier Update:**
```typescript
await redis.del(`supplier:${code}`);
await redis.del('suppliers:list');
```

**Manual Cache Clear (Admin):**
Create admin endpoint:
```typescript
// backend/src/api/cache/routes/cache.ts
{
  method: 'POST',
  path: '/cache/clear',
  handler: 'cache.clear',
  config: {
    policies: [],
    middlewares: [],
  }
}
```

### Redis Monitoring

Add health check endpoint:
```typescript
async healthCheck() {
  try {
    await redis.ping();
    return { redis: 'connected' };
  } catch (error) {
    return { redis: 'disconnected', error: error.message };
  }
}
```

---

## 4. Secret Rotation Strategy

### Security Assessment

**Current Risk:**
- Production secrets in `.env` file
- File may exist in early git commits
- Database password, R2 keys, API secrets exposed

**Secrets to Rotate:**
1. Database password (Neon)
2. R2 Access Key + Secret (Cloudflare)
3. Strapi security keys (APP_KEYS, JWT secrets, etc.)
4. Promidata API access (if using auth)

### Rotation Steps

#### A. Immediate Actions (Do This First!)

**1. Check Git History:**
```bash
# Search for .env in all commits
git log --all --full-history -- .env

# If found, consider these options:
# Option 1: Use BFG Repo Cleaner (safest)
git clone --mirror https://github.com/yourrepo/atlas-pim.git
java -jar bfg.jar --delete-files .env atlas-pim.git
cd atlas-pim.git
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push

# Option 2: Filter branch (nuclear option)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all
git push origin --force --all
```

**2. Rotate Database Password:**
```bash
# Neon Dashboard: https://neon.tech
# 1. Go to project settings
# 2. Reset database password
# 3. Update .env immediately:
DATABASE_PASSWORD=<new-password>
DATABASE_URL=postgresql://user:<new-password>@host/db

# 4. Restart Strapi
npm run develop
```

**3. Rotate Cloudflare R2 Keys:**
```bash
# Cloudflare Dashboard: https://dash.cloudflare.com
# 1. Navigate to R2 → Manage R2 API Tokens
# 2. Create new token for bucket
# 3. Delete old token
# 4. Update .env:
R2_ACCESS_KEY_ID=<new-key>
R2_SECRET_ACCESS_KEY=<new-secret>

# 5. Restart Strapi
```

**4. Regenerate Strapi Keys:**
```bash
# Generate new keys
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
# Run 6 times for:
# - APP_KEYS (2 keys, comma-separated)
# - API_TOKEN_SALT
# - ADMIN_JWT_SECRET
# - TRANSFER_TOKEN_SALT
# - JWT_SECRET
# - ENCRYPTION_KEY

# Update .env
APP_KEYS=<new-key-1>,<new-key-2>
API_TOKEN_SALT=<new-salt>
# ... etc

# IMPORTANT: This will invalidate all existing admin sessions
# Users must log in again
```

#### B. Prevent Future Exposure

**1. Verify .gitignore:**
```bash
# Check .gitignore includes:
.env
.env.*
!.env.example
backend/.env
```

**2. Create .env.example:**
```bash
# Copy structure without secrets
cp .env .env.example

# Replace all values with placeholders
# File: .env.example
DATABASE_PASSWORD=your_database_password_here
R2_ACCESS_KEY_ID=your_r2_access_key_here
# ... etc

# Commit .env.example (safe)
git add .env.example
git commit -m "Add .env.example template"
```

**3. Use Environment Management:**

Consider using a secrets manager:
- **Docker Secrets** (if using Docker Compose)
- **AWS Secrets Manager** (if on AWS)
- **HashiCorp Vault** (enterprise)
- **Doppler** (developer-friendly)

**Example with Docker Secrets:**
```yaml
# docker-compose-promovere-pim.yml
services:
  backend:
    secrets:
      - db_password
      - r2_secret_key

secrets:
  db_password:
    file: ./secrets/db_password.txt
  r2_secret_key:
    file: ./secrets/r2_secret.txt
```

#### C. Post-Rotation Verification

**Checklist:**
- [ ] Backend starts successfully
- [ ] Can log into admin panel
- [ ] Database queries work
- [ ] Image upload to R2 works
- [ ] Promidata sync runs successfully
- [ ] API endpoints respond correctly
- [ ] No "unauthorized" or "invalid credentials" errors

**Test Commands:**
```bash
# Test database
psql "$DATABASE_URL" -c "SELECT 1"

# Test R2 (via Strapi upload)
curl -X POST http://localhost:7337/api/upload \
  -H "Authorization: Bearer <admin-token>" \
  -F "files=@test-image.jpg"

# Test Promidata
curl -I "$PROMIDATA_BASE_URL/Import/Import.txt"

# Test sync
curl -X POST http://localhost:7337/api/promidata-sync/testConnection
```

### Ongoing Security Practices

1. **Rotate secrets quarterly** (every 3 months)
2. **Never commit .env** files
3. **Use separate .env for dev/staging/prod**
4. **Audit git history** regularly
5. **Use secrets manager** in production
6. **Enable 2FA** on Neon, Cloudflare, etc.
7. **Monitor access logs** for suspicious activity

---

## Implementation Priority

### Phase 1: Security (IMMEDIATE)
- [ ] Rotate all secrets
- [ ] Clean git history if needed
- [ ] Set up .env.example

**Timeline:** 1-2 hours
**Risk:** High if secrets exposed

### Phase 2: Database Migration (QUICK WIN)
- [ ] Migrate supplier mapping to database
- [ ] Update sync service
- [ ] Test thoroughly

**Timeline:** 1 hour
**Risk:** Low
**Benefit:** Immediate maintainability improvement

### Phase 3: Redis Caching (MODERATE)
- [ ] Add Redis to Docker Compose
- [ ] Create Redis service
- [ ] Implement caching middleware
- [ ] Test performance

**Timeline:** 4-6 hours
**Risk:** Medium
**Benefit:** Significant performance improvement

### Phase 4: Service Modularization (LONG-TERM)
- [ ] Phase 1: Extract utilities
- [ ] Phase 2: Extract data extraction
- [ ] Phase 3: Extract API client
- [ ] Phase 4: Extract database ops
- [ ] Phase 5: Extract image service
- [ ] Phase 6: Create orchestrator
- [ ] Phase 7: Slim main service

**Timeline:** 2-3 days (with testing)
**Risk:** Medium-High
**Benefit:** Long-term maintainability

---

## Success Metrics

### Security
- [ ] No secrets in git history
- [ ] All secrets rotated
- [ ] .env.example in repo

### Supplier Mapping
- [ ] Zero hardcoded suppliers in code
- [ ] Admin can add/edit suppliers
- [ ] Sync uses database lookup

### Caching
- [ ] API response time < 100ms (from ~300ms)
- [ ] Database query reduction > 70%
- [ ] Cache hit rate > 80%

### Modularization
- [ ] No file > 500 lines
- [ ] Each module has single responsibility
- [ ] Services are independently testable
- [ ] Main service < 400 lines

---

## Rollback Plans

### If Redis Causes Issues
```bash
# Disable caching middleware
# Comment out in backend/config/middlewares.ts
# 'global::cache',  // Disabled temporarily

# Stop Redis container
docker-compose stop redis
```

### If Modularization Breaks Sync
```bash
# Keep backup of original file
cp promidata-sync.ts promidata-sync.ts.backup

# Revert if needed
git checkout HEAD -- promidata-sync.ts

# Or restore from backup
cp promidata-sync.ts.backup promidata-sync.ts
```

### If Supplier DB Migration Fails
```sql
-- Rollback: Re-add hardcoded mapping
-- Restore code from git history
git show HEAD~1:backend/src/api/promidata-sync/services/promidata-sync.ts > restored.ts
```

---

## Next Steps

1. **Review this plan** with team
2. **Get approval** for approach
3. **Schedule work** in sprints
4. **Execute Phase 1** (security) immediately
5. **Document progress** in DECISIONS.md

---

## Questions / Decisions Needed

1. **Redis:** Self-hosted vs managed (e.g., Redis Cloud)?
2. **Secrets Manager:** Use external service or Docker secrets?
3. **Modularization:** Do all at once or incremental over weeks?
4. **Testing:** Manual only or add automated tests during refactor?
5. **Deployment:** Downtime acceptable for major changes?

---

*Document will be updated as work progresses*
