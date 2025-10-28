# System Architecture

*Last updated: 2025-10-28 14:45*

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   Frontend (Next.js 14)                     │
│                   http://localhost:3000                     │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API calls
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Strapi CMS Backend                        │
│                  http://0.0.0.0:7337                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Middleware (Cache) ─→ Controllers ─→ Services      │   │
│  │  (HTTP Layer)          (Routing)      (Logic)       │   │
│  │                                ↓                     │   │
│  │                        EntityService/DB              │   │
│  │                        (Data Access)                 │   │
│  └─────────────────────────────────────────────────────┘   │
└────┬──────────┬────────────────┬─────────────────────┬─────┘
     │          │                │                     │
     ▼          ▼                ▼                     ▼
┌─────────┐ ┌──────────┐  ┌───────────────┐  ┌────────────────┐
│  Redis  │ │   Neon   │  │  Promidata    │  │  Cloudflare R2 │
│ (Cache) │ │PostgreSQL│  │   Supplier    │  │  Image Storage │
│         │ │ Database │  │      API      │  │                │
└─────────┘ └──────────┘  └───────────────┘  └────────────────┘
```

## Directory Structure

```
backend/
├── config/
│   ├── database.ts              # Neon PostgreSQL config
│   ├── plugins.ts               # R2 upload provider
│   ├── admin.ts                 # Admin panel settings
│   ├── api.ts                   # REST API config
│   ├── middlewares.ts           # HTTP middleware stack
│   └── server.ts                # Server settings
│
├── src/
│   ├── index.ts                 # Bootstrap - Sets public permissions
│   │
│   ├── api/                     # Content Types (7 total)
│   │   ├── category/
│   │   │   ├── content-types/
│   │   │   │   └── category/
│   │   │   │       └── schema.json          # 36 attributes
│   │   │   ├── controllers/category.ts
│   │   │   ├── services/category.ts
│   │   │   └── routes/category.ts
│   │   │
│   │   ├── supplier/                        # 44 attributes
│   │   ├── parent-product/                  # 57 attributes
│   │   ├── product/                         # 185 attributes
│   │   ├── product-variant/                 # 133 attributes
│   │   ├── sync-configuration/              # Sync settings per supplier
│   │   └── promidata-sync/                  # Sync orchestration
│   │       ├── controllers/promidata-sync.ts    # API endpoints
│   │       └── services/promidata-sync.ts       # 2386 lines - core logic
│   │
│   ├── extensions/
│   │   └── promidata-sync/      # Custom admin plugin
│   │       └── strapi-admin.js  # Adds UI to admin panel
│   │
│   ├── middlewares/             # Custom HTTP middlewares
│   │   └── cache.ts             # Redis caching middleware (144 lines)
│   │
│   ├── services/                # Shared services
│   │   └── redis.service.ts     # Redis connection & operations
│   │
│   └── components/              # Reusable schema components
│
└── scripts/                     # Utility scripts
    ├── test-promidata-sync.js
    ├── import-suppliers-from-neon.js
    ├── import-suppliers-json-to-neon.js
    ├── import-malfini.js
    └── enable-public-permissions.js
```

## Content Types & Data Model

### Entity Relationship Diagram

```
┌──────────────┐
│   Supplier   │◄────────┐
│              │         │
│ - code       │         │
│ - name       │         │ Many-to-One
│ - last_sync  │         │
└──────────────┘         │
                         │
                ┌────────┴────────┐
                │ Parent Product  │
                │                 │
                │ - sku (unique)  │◄────────┐
                │ - a_number      │         │
                │ - supplier_name │         │
                │ - brand         │         │
                │ - category      │         │
                └─────────────────┘         │
                         │                  │
                         │ One-to-Many      │
                         │                  │
                ┌────────▼─────────┐        │
                │     Product      │        │
                │                  │        │ Many-to-One
                │ - sku (unique)   │        │
                │ - name (JSON)    │        │
                │ - description    │        │
                │ - supplier ──────┼────────┘
                │ - categories     │
                │ - gallery_images │
                │ - price_tiers    │
                └──────────────────┘
                         │
                         │ One-to-Many
                         │
                ┌────────▼──────────┐
                │ Product Variant   │
                │                   │
                │ - sku (unique)    │
                │ - parent_product  │
                │ - color           │
                │ - size            │
                │ - material        │
                │ - dimensions      │
                │ - images          │
                └───────────────────┘

┌──────────────┐
│  Category    │
│              │
│ - name       │──┐
│ - parent ────┼──┘ Self-referential
│ - children   │    (hierarchical)
└──────────────┘
        │
        │ Many-to-Many
        │
        └──────> Product
```

### Key Attributes by Content Type

**Category** (36 attributes)
- Self-referential hierarchy (parent/children)
- Many-to-many with Products
- Imported from CAT.csv

**Supplier** (44 attributes)
- `code` - Promidata supplier ID (e.g., "A113")
- `name` - Full supplier name
- `base_url` - API endpoint
- `last_sync_date`, `last_sync_status`
- Relations: Products, Parent Products, Sync Configs

**Parent Product** (57 attributes)
- Grouping/hierarchy for products
- `sku` - Unique identifier
- `a_number` - Alternative ID
- `supplier_name` - Text field (not relation)
- `brand`, `category`
- `default_products` - JSON array
- `total_variants_count` - Calculated
- `promidata_hash` - Change detection

**Product** (185 attributes - most complex)
- `sku` - Unique, primary identifier
- **Multilingual JSON fields:**
  - `name: { en: "...", nl: "...", de: "..." }`
  - `description`, `color_name`, `model_name`, `material`
- **Media fields:**
  - `main_image` - Single media
  - `gallery_images` - Multiple media
  - `model_image` - Single media
- **Components:**
  - `dimensions` - Single component
  - `price_tiers` - Repeatable component
- **Relations:**
  - `supplier` - Many-to-One
  - `categories` - Many-to-Many
- **Tracking:**
  - `promidata_hash` - MD5 of product data
  - `last_synced` - Timestamp
  - `is_active` - Boolean flag
- **Numeric:**
  - `weight` - Decimal (10,3)
  - `tax` - Enum ("H"/"L")

**Product Variant** (133 attributes)
- Similar to Product but more detailed
- `parent_product` - Many-to-One to Parent Product
- `is_primary_for_color` - Boolean (featured variant)
- `dimensions` - Detailed (length, width, height, depth, diameter)
- `embroidery_sizes` - JSON field
- `imprint_required`, `tron_logo_enabled` - Booleans
- **SEO fields:**
  - `meta_name`, `meta_description`, `meta_keywords`
- **Flags:**
  - `fragile`, `usb_item`, `is_service_base`

**Sync Configuration**
- Per-supplier sync settings
- Enabled/disabled status
- Custom sync parameters

**Promidata Sync**
- Sync execution records
- History tracking
- Error logging

## API Structure

### REST Endpoints (Auto-Generated)

**Pattern:**
```
GET    /api/{content-type}              # List with pagination
GET    /api/{content-type}/:id          # Get single
POST   /api/{content-type}              # Create (admin only)
PUT    /api/{content-type}/:id          # Update (admin only)
DELETE /api/{content-type}/:id          # Delete (admin only)
```

**Public Endpoints (Enabled at Bootstrap):**
```
GET /api/products
GET /api/products/:id
GET /api/product-variants
GET /api/product-variants/:id
GET /api/categories
GET /api/categories/:id
GET /api/suppliers
GET /api/suppliers/:id
GET /api/parent-products
GET /api/parent-products/:id
```

**Custom Promidata Endpoints:**
```
POST /api/promidata-sync/startSync
POST /api/promidata-sync/testConnection
GET  /api/promidata-sync/getSyncStatus
GET  /api/promidata-sync/getSyncHistory
POST /api/promidata-sync/importCategories
POST /api/promidata-sync/importSuppliers
```

**Query Parameters:**
```bash
# Pagination
?pagination[page]=1&pagination[pageSize]=25

# Population (include relations)
?populate[supplier][fields][0]=name
?populate[categories][fields][0]=name

# Filtering
?filters[color][$eq]=Black
?filters[name][$contains]=Sweater

# Sorting
?sort[0]=createdAt:desc
```

## Promidata Sync Architecture

### Sync Service Flow

```
┌──────────────────────────────────────────────────────────────┐
│                     Trigger Sync                             │
│  (Admin UI / API: POST /api/promidata-sync/startSync)       │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│           fetchSuppliersFromPromidata()                      │
│  1. GET {BASE_URL}/Import/Import.txt                         │
│  2. Extract supplier codes (A23, A113, etc.)                 │
│  3. Return array of supplier codes                           │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              For Each Supplier Code                          │
│  1. Create/Update Supplier in Strapi                         │
│  2. GET {BASE_URL}/{CODE}/{CODE}-100804.json                 │
│  3. Parse JSON → Extract products & variants                 │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              Process Each Product                            │
│  1. Extract multilingual fields (en, nl, de)                 │
│  2. Group variants by color/size                             │
│  3. Calculate promidata_hash (MD5)                           │
│  4. Check if product changed (compare hash)                  │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                  Image Processing                            │
│  1. Download images from Promidata URLs                      │
│  2. Stream to Cloudflare R2 (via Strapi upload)             │
│  3. Store with naming: {sku}-primary.jpg, {sku}-1.jpg        │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│              Create/Update in Strapi                         │
│  - Parent Product (if not exists)                            │
│  - Product (with relations to Supplier, Categories)          │
│  - Product Variants (linked to Parent Product)               │
│  - Update promidata_hash, last_synced timestamp              │
└───────────────────────┬──────────────────────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────────────────────┐
│                Create PromidataSync Record                   │
│  - Status: success/failure                                   │
│  - Products synced count                                     │
│  - Errors (if any)                                           │
│  - Timestamp                                                 │
└──────────────────────────────────────────────────────────────┘
```

### Key Functions in Sync Service

**File:** `backend/src/api/promidata-sync/services/promidata-sync.ts` (2386 lines)

```typescript
// Fetch supplier list from Promidata
fetchSuppliersFromPromidata(): Promise<string[]>

// Extract multilingual fields with priority (en > nl > others)
extractFieldWithLanguagePriority(data, path, defaultValue): object

// Extract color code for grouping variants
extractColorCodeForGrouping(productData): string | null

// Clean HTML from descriptions
cleanHtmlFromDescription(html): string

// Extract first SKU from DefaultProducts array
extractFirstSkuFromDefaultProducts(products): string | null

// Main sync operation
startSync(supplierId?: string): Promise<SyncResult>

// Import categories from CAT.csv
importCategories(): Promise<CategoryImportResult>

// Import suppliers from Import.txt
importSuppliers(): Promise<SupplierImportResult>

// Get sync status across all suppliers
getSyncStatus(): Promise<SyncStatus[]>

// Get sync history with pagination
getSyncHistory(page: number, pageSize: number): Promise<SyncHistory>

// Update missing supplier names on parent products
updateMissingSupplierNames(): Promise<UpdateResult>
```

## Bootstrap & Initialization

**File:** `backend/src/index.ts`

**On Application Startup:**
1. **Set Public API Permissions** - Auto-enables read access:
   - Products (find, findOne)
   - Categories (find, findOne)
   - Suppliers (find, findOne)
   - Promidata sync endpoints

2. **Test Supplier Names** - Check for missing data:
   - Query parent products without supplier_name
   - Run updateMissingSupplierNames() if needed

**Why:** Allows frontend to consume APIs without authentication tokens

## Component Interactions

### Request Flow Example: Get Products

```
Browser
  │
  ├─ GET /api/products?pagination[page]=1&populate=supplier
  │
  ▼
Strapi Middleware Stack
  │
  ├─ Authentication (skipped for public)
  ├─ Authorization (check public permissions)
  │
  ▼
Router (auto-generated)
  │
  ▼
Controller (auto-generated or custom)
  │
  ├─ Parse query params
  ├─ Call service method
  │
  ▼
Service (can be customized)
  │
  ├─ Business logic
  ├─ Call entityService
  │
  ▼
EntityService (Strapi core)
  │
  ├─ Build SQL query
  ├─ Apply filters, pagination
  ├─ Handle population (joins)
  │
  ▼
PostgreSQL (Neon)
  │
  ├─ Execute query
  ├─ Return rows
  │
  ▼
Response Pipeline
  │
  ├─ Serialize data
  ├─ Add pagination metadata
  ├─ Return JSON
  │
  ▼
Browser (receives JSON)
```

## Deployment Architecture

### Docker Compose Setup

```
┌────────────────────────────────────────────┐
│          Nginx Reverse Proxy               │
│        (ports 80, 443)                     │
│  - SSL termination                         │
│  - Load balancing                          │
│  - Static file serving (optional)          │
└──────────────┬─────────────────────────────┘
               │
               ▼
┌────────────────────────────────────────────┐
│         Strapi Backend Container           │
│           (port 7337)                      │
│  - Node.js runtime                         │
│  - Health checks: /_health                 │
│  - Auto-restart on failure                 │
└──────────┬──────────────┬──────────────────┘
           │              │
           ▼              ▼
    ┌──────────┐   ┌──────────────┐
    │   Neon   │   │ Cloudflare R2│
    │PostgreSQL│   │              │
    └──────────┘   └──────────────┘
     (external)      (external)
```

## Performance Considerations

**Neon Connection Pooling:**
- **MAX 1 connection** - Critical limitation
- Use connection pooler endpoint: `-pooler.c-2.eu-central-1.aws.neon.tech`
- No local connection pooling due to Neon serverless nature

**Image Storage:**
- All media in R2 (no local file system)
- Public URLs for fast CDN delivery
- Zero egress fees from Cloudflare

**Sync Performance:**
- Large sync jobs (1000+ products) take 10-30 minutes
- Hash-based change detection prevents re-importing unchanged items
- Images downloaded and streamed (not stored locally)

**API Pagination:**
- Default page size: 25
- Max page size: 100 (recommended)
- Use `pagination[limit]` for custom sizes

## Security Model

**Authentication:**
- Admin panel: JWT-based (username/password)
- API tokens: Generated in admin for programmatic access
- Public endpoints: No auth required (bootstrap sets this)

**Authorization:**
- Role-based: Public, Authenticated, Admin
- Per-endpoint permissions
- Content type-level access control

**Data Protection:**
- Environment variables in `.env` (not committed)
- Database SSL required
- R2 bucket with controlled access keys
