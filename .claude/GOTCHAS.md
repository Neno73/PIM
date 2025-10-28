# Known Issues & Gotchas

*Last updated: 2025-10-28 14:45*

## Database (Neon PostgreSQL)

### Connection Pool Limit

**Issue:** Neon serverless PostgreSQL limits connections to 1 per database

**Symptoms:**
- `Pool exhausted` errors
- `Too many connections` warnings
- Slow query performance

**Solution:**
```bash
# In .env - ALWAYS set these
DATABASE_POOL_MIN=0
DATABASE_POOL_MAX=1

# Use pooler endpoint (not direct)
DATABASE_HOST=ep-raspy-recipe-agqru8zy-pooler.c-2.eu-central-1.aws.neon.tech
```

**Why:** Neon uses connection pooling at the infrastructure level. Local pooling conflicts with this.

---

### SSL Required

**Issue:** Neon requires SSL connections

**Symptoms:**
- `Connection terminated unexpectedly`
- `SSL required` error

**Solution:**
```bash
# In .env
DATABASE_SSL=true

# In DATABASE_URL
postgresql://user:pass@host/db?sslmode=require&channel_binding=require
```

**Config in database.ts:**
```typescript
ssl: env.bool('DATABASE_SSL', false)
  ? { rejectUnauthorized: false }
  : false
```

---

### Schema Migration Issues

**Issue:** Strapi auto-migrations can fail on Neon

**Symptoms:**
- `Schema public already exists`
- `Relation already exists`

**Solution:**
```bash
# Clear Strapi cache
cd backend
rm -rf .cache build

# Rebuild
npm run build
npm run develop
```

**Prevention:** Test schema changes on a Neon branch first

## Cloudflare R2 Storage

### Public URL Required for Large Files

**Issue:** Provider requires `cloudflarePublicAccessUrl` for files > 5MB

**Symptoms:**
- Warning on startup: `provider config requires cloudflarePublicAccessUrl`
- Large image uploads fail

**Solution:**
```typescript
// In backend/config/plugins.ts
export default ({ env }) => ({
  upload: {
    config: {
      provider: 'strapi-provider-cloudflare-r2',
      providerOptions: {
        // ... other config
        cloudflarePublicAccessUrl: env('R2_PUBLIC_URL'), // REQUIRED
      },
    },
  },
});
```

---

### Image Naming Conflicts

**Issue:** Images with same SKU overwrite each other

**Symptoms:**
- Wrong images displayed
- Missing product images after sync

**Solution:**
- Follow strict naming: `{sku}-primary.jpg`, `{sku}-1.jpg`
- Never reuse SKUs across different products
- Add versioning if needed: `{sku}-v2-primary.jpg`

**Example:**
```typescript
// Good
ABC123-primary.jpg
ABC123-1.jpg
ABC123-2.jpg

// Bad (will overwrite)
ABC123.jpg
ABC123.jpg (different product!)
```

## Promidata Sync

### Supplier Name Hardcoded

**Issue:** Supplier code-to-name mapping is hardcoded in service

**Location:** `backend/src/api/promidata-sync/services/promidata-sync.ts`

**Impact:**
- New suppliers require code update
- Can't add suppliers via admin UI

**Workaround:**
```typescript
// Add new supplier to mapping
const supplierNameMapping = {
  A23: 'XD Connects (Xindao)',
  A113: 'New Supplier Name',  // Add here
  // ... existing suppliers
};
```

**Future Improvement:** Move to database table

---

### Multilingual Data Extraction Priority

**Issue:** Language priority is hardcoded (en > nl > others)

**Location:** `extractFieldWithLanguagePriority()` method

**Impact:**
- Always uses English if available
- Can't prefer other languages

**Workaround:**
```typescript
// Modify priority in method
const languages = ['nl', 'en', 'de'];  // Dutch first
```

---

### Large Sync Jobs Take Time

**Issue:** Syncing 1000+ products takes 10-30 minutes

**Symptoms:**
- API timeout warnings
- Admin UI appears frozen
- "Sync still running" status

**Solution:**
- Run sync jobs during off-hours
- Sync specific suppliers: `startSync({ supplierId: 'A113' })`
- Monitor via getSyncHistory endpoint

**Prevention:**
- Use `promidata_hash` change detection (already implemented)
- Only syncs changed products

---

### Image Download Timeouts

**Issue:** External image downloads can timeout

**Symptoms:**
- Sync completes but images missing
- `Image download failed` in logs

**Solution:**
```typescript
// Increase fetch timeout
const response = await fetch(imageUrl, {
  timeout: 30000  // 30 seconds
});
```

**Workaround:**
- Re-run sync for failed suppliers
- Images are retried on next sync

## Strapi Specific

### Bootstrap Runs on Every Start

**Issue:** `backend/src/index.ts` bootstrap runs on every server start

**Impact:**
- Permission checks on every restart
- Slight startup delay (1-2 seconds)

**Why:** Ensures public permissions always enabled

**Note:** This is intentional, not a bug

---

### Content Type Changes Require Restart

**Issue:** Schema changes in admin UI need server restart

**Symptoms:**
- Changes not reflected in API
- `Schema mismatch` errors

**Solution:**
```bash
# Restart dev server
# Ctrl+C
npm run develop

# Or in production
npm run build
npm start
```

---

### Admin JWT Expires

**Issue:** Admin session expires after inactivity

**Symptoms:**
- Logged out randomly
- "Unauthorized" errors in admin

**Solution:**
```typescript
// In backend/config/admin.ts
export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    options: {
      expiresIn: '30d',  // Extend to 30 days
    },
  },
});
```

---

### Missing .env in backend/

**Issue:** Strapi looks for `.env` in `backend/` directory, not project root

**Symptoms:**
- `App keys are required` error
- Environment variables not loaded

**Solution:**
```bash
# Copy from root
cp .env backend/.env

# Or create symlink
ln -s ../.env backend/.env
```

**Why:** Strapi's working directory is `backend/`

## Frontend (Static Build)

### No Source Files

**Issue:** `frontend/` only contains built files (`dist/`), no source

**Impact:**
- Can't modify frontend without switching branches
- Must use `n8n_workflow` branch for source

**Solution:**
```bash
# Switch to branch with source
git checkout n8n_workflow

# Make changes in frontend/src/

# Build
cd frontend
npm run build

# Copy dist/ back to test_atlas
git checkout test_atlas
cp -r ../n8n_workflow/frontend/dist/* frontend/dist/
```

---

### API URL Hardcoded

**Issue:** Production API URL baked into build

**Current:** `https://atlas-strapi.solsdev.com/api`

**To Change:**
1. Get source from `n8n_workflow` branch
2. Edit `frontend/.env`:
```bash
VITE_API_URL=http://localhost:7337/api
```
3. Rebuild:
```bash
npm run build
```

## Docker

### Health Check Interval

**Issue:** Health checks every 30s can spam logs

**Config in docker-compose:**
```yaml
healthcheck:
  interval: 30s  # Could be longer for production
  timeout: 10s
  retries: 3
```

**Workaround:**
- Increase interval to 60s or 120s
- Or disable: `disable: true`

---

### Nginx Config Not Included

**Issue:** `nginx-backend-proxy.conf` referenced but may not exist

**Symptoms:**
- Nginx container fails to start
- `Config file not found` error

**Solution:**
Create `nginx-backend-proxy.conf`:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://promovere-pim:7337;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## TypeScript

### Strapi Type Definitions

**Issue:** Strapi types not always accurate

**Symptoms:**
- Type errors on valid code
- `Property does not exist` warnings

**Workaround:**
```typescript
// Use type assertions when needed
const service = strapi.service('api::product.product') as any;

// Or define custom interface
interface ProductService {
  findMany(params: any): Promise<Product[]>;
}
const service = strapi.service('api::product.product') as ProductService;
```

---

### JSON Field Types

**Issue:** Multilingual fields stored as JSON, no type safety

**Example:**
```typescript
// Runtime structure
product.name = {
  en: "Product",
  nl: "Product",
  de: "Produkt"
}

// But TypeScript sees: any
```

**Solution:**
Define custom types:
```typescript
interface MultilingualField {
  en?: string;
  nl?: string;
  de?: string;
  [key: string]: string | undefined;
}

interface Product {
  name: MultilingualField;
  description: MultilingualField;
}
```

## Security

### Secrets in .env

**Issue:** Production secrets committed in early commits

**Location:** `.env` in project root (contains real credentials)

**Risk:**
- Database credentials exposed
- R2 access keys in git history
- API secrets visible

**Solution:**
```bash
# Rotate all secrets ASAP:
# 1. Database password (Neon dashboard)
# 2. R2 keys (Cloudflare dashboard)
# 3. Strapi keys (regenerate):
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"

# 4. Remove from git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch .env' \
  --prune-empty --tag-name-filter cat -- --all
```

**Prevention:**
- `.env` already in `.gitignore`
- Use `.env.example` with dummy values
- Store real secrets in password manager

## Performance

### Sync Service Size

**Issue:** `promidata-sync.ts` is 2386 lines - hard to maintain

**Location:** `backend/src/api/promidata-sync/services/promidata-sync.ts`

**Impact:**
- Difficult to debug
- Complex to modify
- Long test cycles

**Suggestion:**
Break into modules:
- `suppliers.service.ts` - Supplier operations
- `products.service.ts` - Product sync logic
- `images.service.ts` - Image download/upload
- `utils.service.ts` - Helper functions

---

### Redis Caching (IMPLEMENTED - 2025-10-28)

**Status:** ✅ Redis caching now active

**New Issues to Watch:**

1. **Redis Connection Required**
   - Backend won't start if Redis is unavailable (default: localhost:6379)
   - Middleware skips caching silently if Redis disconnects
   - Check logs for: `Redis connected successfully` or `Redis connection failed`

2. **Pagination Cache Key Serialization**
   - **FIXED (2025-10-28):** Object parameters were converting to `[object Object]`
   - Now properly serialized with `JSON.stringify()`
   - Cache keys include full pagination: `api:/api/parent-products?pagination={"page":2,"pageSize":20}`

3. **Cache Invalidation Required**
   - Product updates don't auto-invalidate cache
   - Must manually invalidate: `invalidateEntityCache('parent-products')`
   - Or wait for TTL expiration (default: 5 minutes)

4. **X-Cache Headers in Responses**
   - All GET responses include: `X-Cache: HIT` or `X-Cache: MISS`
   - Also includes: `X-Cache-Key` showing the cache key used
   - Useful for debugging caching behavior

**Configuration:**
```bash
# backend/config/middlewares.ts
{
  ttl: 300,              # 5 minutes
  prefix: 'api',
  exclude: [
    '/api/promidata-sync/*',
    '/admin/*',
    '/auth/*'
  ]
}
```

**Workarounds:**
- If cache seems stale, restart Redis or flush with `redis-cli FLUSHDB`
- Check middleware order in `config/middlewares.ts` - cache should be early
- Verify Redis connection: `redis-cli ping` should return `PONG`

---

### No Query Optimization

**Issue:** Default Strapi queries may over-fetch

**Example:**
```bash
# Bad - fetches all relations
GET /api/products?populate=*

# Good - selective population
GET /api/products?populate[supplier][fields][0]=name
```

**Prevention:**
- Always specify fields needed
- Use pagination
- Avoid `populate=*`

## Miscellaneous

### Port 7337 Not Standard

**Issue:** Using port 7337 instead of default 1337

**Why:** Avoid conflicts with other Strapi projects

**Impact:**
- Must remember non-standard port
- Firewall rules need updating

**Note:** This is intentional configuration

---

### No Tests

**Issue:** No automated tests visible in codebase

**Impact:**
- Manual testing required
- Risk of regressions
- Slow verification

**Future Improvement:**
```bash
# Add Jest/Mocha tests
npm install --save-dev jest @types/jest

# Test structure
backend/tests/
  ├── unit/
  │   └── promidata-sync.test.ts
  └── integration/
      └── api.test.ts
```

---

### Static Frontend in Production

**Issue:** Using static files instead of proper frontend framework

**Limitation:**
- No SSR/SSG benefits
- SEO challenges
- Limited dynamic features

**Alternative:** Switch to `n8n_workflow` branch for full Next.js app

## When Things Go Wrong

### Nuclear Option (Reset Everything)

```bash
# Stop all
docker-compose -f docker-compose-promovere-pim.yml down
pkill -f strapi

# Clean Strapi
cd backend
rm -rf .cache build node_modules
npm install
npm run build

# Restart
npm run develop
```

### Database Reset (DANGEROUS)

```bash
# ONLY IN DEVELOPMENT
# This drops all data!

psql "$DATABASE_URL" -c "DROP SCHEMA public CASCADE;"
psql "$DATABASE_URL" -c "CREATE SCHEMA public;"

# Restart Strapi (will recreate tables)
npm run develop
```

**WARNING:** This deletes ALL data permanently!

### Check Logs

```bash
# Strapi console output
npm run develop

# Docker logs
docker-compose -f docker-compose-promovere-pim.yml logs -f

# System logs (if using systemd)
journalctl -u strapi -f
```
