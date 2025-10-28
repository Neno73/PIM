# Code Patterns & Conventions

*Last updated: 2025-10-28 14:45*

## Strapi Service Pattern

### Creating Custom Services

**Location:** `backend/src/api/{content-type}/services/{content-type}.ts`

```typescript
import { factories } from "@strapi/strapi";

export default factories.createCoreService(
  "api::{content-type}.{content-type}",
  ({ strapi }) => ({
    // Custom service methods
    async customMethod(params) {
      // Access other services
      const otherService = strapi.service('api::other.other');

      // Use entityService for database operations
      const entries = await strapi.entityService.findMany(
        "api::content-type.content-type",
        {
          filters: { field: params.value },
          pagination: { page: 1, pageSize: 25 },
          populate: { relation: true }
        }
      );

      return entries;
    }
  })
);
```

**Example from this project:**
```typescript
// backend/src/api/promidata-sync/services/promidata-sync.ts
export default factories.createCoreService(
  "api::promidata-sync.promidata-sync",
  ({ strapi }) => ({
    async startSync(supplierId?: string) {
      // Fetch suppliers
      const suppliers = await this.fetchSuppliersFromPromidata();

      // Process each supplier
      for (const code of suppliers) {
        await this.syncSupplier(code);
      }

      return { success: true, synced: suppliers.length };
    }
  })
);
```

## Strapi Controller Pattern

### Creating Custom Controllers

**Location:** `backend/src/api/{content-type}/controllers/{content-type}.ts`

```typescript
// Context type definition
interface Context {
  request: {
    body: any;
    query: any;
  };
  query: any;
  body: any;
  badRequest: (message: string, details?: any) => void;
  notFound: (message?: string) => void;
  unauthorized: (message?: string) => void;
}

export default {
  async actionName(ctx: Context) {
    try {
      // Get service
      const service = strapi.service('api::content-type.content-type');

      // Extract params from request
      const { param1, param2 } = ctx.request.body;

      // Call service method
      const result = await service.customMethod({ param1, param2 });

      // Return success response
      ctx.body = {
        success: true,
        data: result
      };
    } catch (error) {
      // Handle errors
      ctx.badRequest('Error message', {
        details: error.message,
        stack: error.stack
      });
    }
  }
};
```

**Example from this project:**
```typescript
// backend/src/api/promidata-sync/controllers/promidata-sync.ts
export default {
  async startSync(ctx: Context) {
    try {
      const service = strapi.service('api::promidata-sync.promidata-sync');
      const { supplierId } = ctx.request.body;

      const result = await service.startSync(supplierId);

      ctx.body = {
        success: true,
        message: 'Sync completed',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Sync failed', { details: error.message });
    }
  }
};
```

## Database Query Patterns

### EntityService (Preferred)

```typescript
// Find many with filtering
const products = await strapi.entityService.findMany(
  "api::product.product",
  {
    filters: {
      color: "Black",
      name: { $contains: "Sweater" }
    },
    populate: {
      supplier: { fields: ['name', 'code'] },
      categories: true
    },
    pagination: {
      page: 1,
      pageSize: 25
    },
    sort: { createdAt: 'desc' }
  }
);

// Find one by ID
const product = await strapi.entityService.findOne(
  "api::product.product",
  productId,
  {
    populate: ['supplier', 'categories', 'gallery_images']
  }
);

// Create entity
const newProduct = await strapi.entityService.create(
  "api::product.product",
  {
    data: {
      sku: "ABC-123",
      name: { en: "Product Name", nl: "Productnaam" },
      supplier: supplierId,
      is_active: true
    }
  }
);

// Update entity
const updated = await strapi.entityService.update(
  "api::product.product",
  productId,
  {
    data: {
      last_synced: new Date(),
      promidata_hash: newHash
    }
  }
);

// Delete entity
await strapi.entityService.delete("api::product.product", productId);
```

### Raw DB Queries (When Needed)

```typescript
// Count queries
const count = await strapi.db.query("api::product.product").count({
  where: {
    supplier: { code: "A113" },
    is_active: true
  }
});

// Find with custom queries
const products = await strapi.db.query("api::product.product").findMany({
  where: { sku: { $in: ["SKU1", "SKU2", "SKU3"] } },
  populate: { supplier: true }
});

// Update where
await strapi.db.query("api::product.product").updateMany({
  where: { supplier: { code: "A113" } },
  data: { is_active: false }
});
```

## Multilingual Field Pattern

### JSON Structure for i18n

```typescript
// Field structure in database
{
  name: {
    en: "Black T-Shirt",
    nl: "Zwart T-shirt",
    de: "Schwarzes T-Shirt"
  },
  description: {
    en: "High quality cotton t-shirt",
    nl: "Hoge kwaliteit katoenen t-shirt",
    de: "Hochwertiges Baumwoll-T-Shirt"
  }
}
```

### Extracting Multilingual Data (from Promidata)

```typescript
// Method from promidata-sync service
extractFieldWithLanguagePriority(
  data: any,
  fieldPath: string,
  defaultValue: string = ""
): object {
  // Priority: en > nl > other languages
  const languages = ['en', 'nl', 'de', 'fr', 'es', 'it'];
  const result = {};

  for (const lang of languages) {
    const value = get(data, `${fieldPath}.${lang}`, null);
    if (value) {
      result[lang] = value;
    }
  }

  // Return with default if empty
  return Object.keys(result).length > 0
    ? result
    : { en: defaultValue };
}
```

**Usage:**
```typescript
const productName = this.extractFieldWithLanguagePriority(
  productData,
  "ProductDetails.Name",
  "Unknown Product"
);
// Returns: { en: "...", nl: "...", de: "..." }
```

## Image Upload Pattern

### Uploading to Cloudflare R2 via Strapi

```typescript
// Download image from external URL
const response = await fetch(imageUrl);
const buffer = await response.buffer();

// Create file object
const file = {
  data: buffer,
  name: `${sku}-primary.jpg`,
  type: 'image/jpeg',
  size: buffer.length
};

// Upload via Strapi upload service
const uploadedFiles = await strapi.plugins.upload.services.upload.upload({
  data: {}, // optional metadata
  files: file
});

// Attach to entity
await strapi.entityService.update('api::product.product', productId, {
  data: {
    main_image: uploadedFiles[0].id
  }
});
```

### Image Naming Convention

```typescript
// Pattern: {sku}-{type}.{ext}
const primaryImage = `${sku}-primary.jpg`;
const galleryImage1 = `${sku}-1.jpg`;
const galleryImage2 = `${sku}-2.jpg`;
const modelImage = `${sku}-model.jpg`;
```

## Error Handling Pattern

### Service-Level Errors

```typescript
async syncSupplier(supplierCode: string): Promise<SyncResult> {
  try {
    // Fetch data
    const data = await this.fetchFromPromidata(supplierCode);

    // Validate
    if (!data || !data.products) {
      throw new Error(`No products found for supplier ${supplierCode}`);
    }

    // Process
    const result = await this.processProducts(data.products);

    return {
      success: true,
      supplierCode,
      productsProcessed: result.length
    };
  } catch (error) {
    // Log error
    strapi.log.error('Sync failed', {
      supplierCode,
      error: error.message,
      stack: error.stack
    });

    // Return error result
    return {
      success: false,
      supplierCode,
      error: error.message
    };
  }
}
```

### Controller-Level Errors

```typescript
async actionName(ctx: Context) {
  try {
    const result = await service.method();
    ctx.body = { success: true, data: result };
  } catch (error) {
    // Use appropriate HTTP status
    if (error.message.includes('not found')) {
      ctx.notFound('Resource not found');
    } else if (error.message.includes('unauthorized')) {
      ctx.unauthorized('Access denied');
    } else {
      ctx.badRequest('Operation failed', {
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}
```

## TypeScript Type Definitions

### Content Type Interfaces

```typescript
// Product interface
interface Product {
  id: number;
  sku: string;
  name: {
    en?: string;
    nl?: string;
    de?: string;
  };
  description: {
    en?: string;
    nl?: string;
  };
  supplier: number | Supplier;
  categories: number[] | Category[];
  main_image?: Media;
  gallery_images?: Media[];
  weight?: number;
  is_active: boolean;
  promidata_hash?: string;
  last_synced?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Supplier interface
interface Supplier {
  id: number;
  code: string;
  name: string;
  base_url?: string;
  last_sync_date?: Date;
  last_sync_status?: string;
  products?: Product[];
}

// Media (uploaded file) interface
interface Media {
  id: number;
  name: string;
  url: string;
  formats?: {
    thumbnail?: { url: string };
    small?: { url: string };
    medium?: { url: string };
    large?: { url: string };
  };
}
```

## Bootstrap Pattern

### Application Initialization

**File:** `backend/src/index.ts`

```typescript
export default {
  register({ strapi }) {
    // Register hook
  },

  async bootstrap({ strapi }) {
    // Run on application startup
    console.log('🚀 Bootstrapping application...');

    // Set public permissions
    await setPublicPermissions(strapi);

    // Run data migrations
    await updateMissingSupplierNames(strapi);

    console.log('✅ Bootstrap finished');
  }
};

async function setPublicPermissions(strapi) {
  const publicRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) return;

  // Define permissions to enable
  const permissionsToEnable = [
    'api::product.product.find',
    'api::product.product.findOne',
    // ... more permissions
  ];

  // Enable each permission
  for (const permission of permissionsToEnable) {
    await enablePermission(publicRole.id, permission);
  }
}
```

## Configuration Patterns

### Database Config

**File:** `backend/config/database.ts`

```typescript
export default ({ env }) => ({
  connection: {
    client: 'postgres',
    connection: {
      host: env('DATABASE_HOST'),
      port: env.int('DATABASE_PORT', 5432),
      database: env('DATABASE_NAME'),
      user: env('DATABASE_USERNAME'),
      password: env('DATABASE_PASSWORD'),
      ssl: env.bool('DATABASE_SSL', false)
        ? { rejectUnauthorized: false }
        : false,
      schema: env('DATABASE_SCHEMA', 'public'),
    },
    pool: {
      min: env.int('DATABASE_POOL_MIN', 0),
      max: env.int('DATABASE_POOL_MAX', 1), // Neon limit
    },
  },
});
```

### Plugin Config

**File:** `backend/config/plugins.ts`

```typescript
export default ({ env }) => ({
  upload: {
    config: {
      provider: 'strapi-provider-cloudflare-r2',
      providerOptions: {
        accessKeyId: env('R2_ACCESS_KEY_ID'),
        secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
        endpoint: env('R2_ENDPOINT'),
        params: {
          Bucket: env('R2_BUCKET_NAME'),
        },
        cloudflarePublicAccessUrl: env('R2_PUBLIC_URL'),
      },
    },
  },
});
```

## Change Detection Pattern

### Using Hash for Sync

```typescript
import crypto from 'crypto';

// Calculate hash from product data
function calculateProductHash(productData: any): string {
  // Serialize important fields
  const dataToHash = {
    sku: productData.sku,
    name: productData.name,
    description: productData.description,
    price: productData.price,
    // ... other fields that indicate changes
  };

  // Create MD5 hash
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(dataToHash))
    .digest('hex');

  return hash;
}

// Check if product changed
async function shouldUpdateProduct(sku: string, newHash: string): Promise<boolean> {
  const existing = await strapi.db.query('api::product.product').findOne({
    where: { sku },
    select: ['promidata_hash']
  });

  if (!existing) return true; // New product

  return existing.promidata_hash !== newHash; // Changed
}
```

## Redis Caching Pattern

### Middleware-Based Caching

**Location:** `backend/src/middlewares/cache.ts`

**Pattern:** Koa middleware that intercepts GET requests, checks Redis, and caches responses

```typescript
// Create cache middleware factory
export function createCacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl = 300,           // Default 5 minutes
    prefix = 'api',
    exclude = [],
  } = options;

  return async (ctx, next) => {
    // Only cache GET requests
    if (ctx.method !== 'GET') {
      return await next();
    }

    // Skip if Redis not connected
    if (!redisService.isReady()) {
      return await next();
    }

    // Check excluded routes
    if (isExcluded(ctx.path, exclude)) {
      return await next();
    }

    // Generate cache key
    const cacheKey = generateCacheKey(ctx.path, ctx.query, prefix);

    // Try cached response
    const cached = await redisService.get(cacheKey);
    if (cached) {
      ctx.set('X-Cache', 'HIT');
      ctx.set('X-Cache-Key', cacheKey);
      ctx.body = cached;
      return;
    }

    // Execute route handler
    await next();

    // Cache successful responses
    if (ctx.status >= 200 && ctx.status < 300 && ctx.body) {
      await redisService.set(cacheKey, ctx.body, ttl);
      ctx.set('X-Cache', 'MISS');
      ctx.set('X-Cache-Key', cacheKey);
    }
  };
}
```

**Usage in `backend/config/middlewares.ts`:**
```typescript
export default [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  {
    name: 'global::cache',
    config: {
      ttl: 300,              // 5 minutes
      prefix: 'api',
      exclude: [
        '/api/promidata-sync/*',
        '/admin/*',
        '/auth/*'
      ]
    }
  },
  'strapi::poweredBy',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];
```

### Cache Key Generation

**Critical:** Properly serialize object parameters to avoid cache key collisions

```typescript
function generateCacheKey(path: string, query: any, prefix: string): string {
  const sortedQuery = Object.keys(query || {})
    .sort()
    .map(key => {
      const value = query[key];
      // IMPORTANT: Serialize objects properly
      if (typeof value === 'object' && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join('&');

  const queryString = sortedQuery ? `?${sortedQuery}` : '';
  return `${prefix}:${path}${queryString}`;
}
```

**Result:**
```
api:/api/parent-products?pagination={"page":2,"pageSize":20}
```

### Cache Invalidation

```typescript
// Invalidate by pattern
export async function invalidateCache(pattern: string): Promise<number> {
  if (!redisService.isReady()) return 0;

  const count = await redisService.delPattern(pattern);
  console.log(`Invalidated ${count} keys matching "${pattern}"`);
  return count;
}

// Invalidate specific entity
export async function invalidateEntityCache(entityType: string): Promise<number> {
  const pattern = `api:/api/${entityType}*`;
  return await invalidateCache(pattern);
}
```

**Usage after entity updates:**
```typescript
// After updating products
await invalidateEntityCache('parent-products');
await invalidateEntityCache('products');
```

### Redis Service Pattern

**Location:** `backend/src/services/redis.service.ts`

```typescript
import Redis from 'ioredis';

class RedisService {
  private client: Redis | null = null;
  private ready: boolean = false;

  async connect() {
    this.client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryStrategy: (times) => {
        return Math.min(times * 50, 2000);
      }
    });

    this.client.on('connect', () => {
      this.ready = true;
      console.log('✅ Redis connected');
    });

    this.client.on('error', (err) => {
      this.ready = false;
      console.error('❌ Redis error:', err);
    });
  }

  isReady(): boolean {
    return this.ready && this.client !== null;
  }

  async get(key: string): Promise<any> {
    if (!this.isReady()) return null;
    const value = await this.client!.get(key);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    if (!this.isReady()) return;
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client!.setex(key, ttl, serialized);
    } else {
      await this.client!.set(key, serialized);
    }
  }

  async delPattern(pattern: string): Promise<number> {
    if (!this.isReady()) return 0;
    const keys = await this.client!.keys(pattern);
    if (keys.length === 0) return 0;
    return await this.client!.del(...keys);
  }
}

export default new RedisService();
```

## File & Directory Naming

### Strapi Conventions

- **Content Types:** `kebab-case` (e.g., `parent-product`, `product-variant`)
- **Files:** `kebab-case.ts` (e.g., `promidata-sync.ts`)
- **Services/Controllers:** Match content type name
- **Config files:** `camelCase.ts` (e.g., `database.ts`, `plugins.ts`)

### Custom Code

- **Functions:** `camelCase` (e.g., `fetchSuppliersFromPromidata`)
- **Classes:** `PascalCase` (if used)
- **Constants:** `UPPER_SNAKE_CASE` (e.g., `MAX_RETRIES`)
- **Interfaces:** `PascalCase` (e.g., `SyncResult`, `ProductData`)

## Import Organization

```typescript
// 1. Node.js built-ins
import crypto from 'crypto';
import path from 'path';

// 2. External packages
import { factories } from '@strapi/strapi';
import fetch from 'node-fetch';

// 3. Internal utilities (if any)
import { calculateHash, validateSku } from '../utils';

// 4. Types
import type { Product, Supplier } from '../types';
```

## Testing Pattern (if implemented)

```typescript
// Test file: {name}.test.ts
import { describe, it, expect } from '@jest/globals';

describe('Promidata Sync Service', () => {
  it('should extract supplier codes from Import.txt', async () => {
    const service = strapi.service('api::promidata-sync.promidata-sync');
    const suppliers = await service.fetchSuppliersFromPromidata();

    expect(suppliers).toBeInstanceOf(Array);
    expect(suppliers.length).toBeGreaterThan(0);
  });
});
```

## Logging Pattern

```typescript
// Use Strapi's built-in logger
strapi.log.info('Sync started', { supplierCode: 'A113' });
strapi.log.error('Sync failed', { error: error.message });
strapi.log.debug('Product processed', { sku: 'ABC-123' });
strapi.log.warn('Image download slow', { url: imageUrl });

// Custom logging with timestamps
console.log(`[${new Date().toISOString()}] Processing supplier: ${code}`);
```

## Best Practices from This Project

1. **Always use `promidata_hash` for change detection** - Prevents unnecessary updates
2. **Stream images, don't store locally** - Direct upload to R2
3. **Respect Neon connection limit** - Max 1 connection, use pooler endpoint
4. **Enable public permissions in bootstrap** - Automatic API access setup
5. **Use multilingual JSON fields** - Flexible i18n without schema changes
6. **Log everything in sync operations** - Critical for debugging supplier issues
7. **Validate SKUs before operations** - Prevent duplicate/invalid entries
8. **Use TypeScript for services** - Type safety in complex logic
