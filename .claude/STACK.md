# Tech Stack

*Last updated: 2025-10-28 14:45*

## Backend Framework

### Strapi CMS v5.17.0
**Why:** Headless CMS with auto-generated REST APIs, admin UI, and content type builder

**Key Packages:**
```json
"@strapi/strapi": "5.17.0",
"@strapi/plugin-cloud": "5.17.0",
"@strapi/plugin-users-permissions": "5.17.0",
"@strapi/provider-upload-aws-s3": "5.18.0"
```

**Node Requirements:** >=18.0.0, <=22.x.x

## Database

### Neon PostgreSQL (Cloud)
**Why:** Managed PostgreSQL with auto-scaling, branching, and serverless capabilities

**Configuration:**
- Endpoint: `ep-raspy-recipe-agqru8zy-pooler.c-2.eu-central-1.aws.neon.tech`
- Region: EU Central 1 (Frankfurt)
- Database: `neondb`
- Schema: `public`
- SSL: Required (`rejectUnauthorized: false`)
- **Pool Limit: MAX 1 connection** (Neon limitation - critical!)

**Client:**
```json
"pg": "8.16.3"
```

**Fallback (Development):**
```json
"better-sqlite3": "11.3.0"  // .tmp/data.db for local dev
```

## Caching

### Redis (ioredis)
**Why:** Response caching to reduce database load and improve API performance

**Client:**
```json
"ioredis": "5.8.2"
```

**Features:**
- Middleware-based caching for GET requests
- Configurable TTL (default: 300 seconds / 5 minutes)
- Cache key generation from path + query params
- Pattern-based cache invalidation
- Automatic cache miss/hit headers (`X-Cache: HIT|MISS`)

**Implementation:**
- Middleware: `backend/src/middlewares/cache.ts`
- Service: `backend/src/services/redis.service.ts`
- Integrated in: `backend/config/middlewares.ts`

**Configuration:**
```bash
REDIS_HOST=localhost      # Default: localhost
REDIS_PORT=6379           # Default: 6379
REDIS_PASSWORD=           # Optional
REDIS_DB=0                # Database index
```

**Excluded Routes:**
- `/api/promidata-sync/*` - Sync operations not cached
- `/admin/*` - Admin routes not cached
- `/auth/*` - Authentication not cached

## Storage

### Cloudflare R2 (Object Storage)
**Why:** S3-compatible storage with zero egress fees, perfect for product images

**Configuration:**
- Bucket: `texet-images`
- Public URL: `https://pub-702243dedd784ac6b0c85c8bf53f461e.r2.dev`
- Endpoint: `https://22a71523d3dd456931ad531dc510c548.r2.cloudflarestorage.com`

**Provider:**
```json
"strapi-provider-cloudflare-r2": "0.3.0",
"@aws-sdk/client-s3": "3.844.0",
"aws-sdk": "2.1692.0"
```

**Image Convention:**
- Primary: `{sku}-primary.jpg`
- Gallery: `{sku}-1.jpg`, `{sku}-2.jpg`, etc.

## External APIs

### Promidata Supplier API
**Why:** Automated product data synchronization from multiple suppliers

**Base URL:** `https://promi-dl.de/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23`

**Key Endpoints:**
- Suppliers: `/Import/Import.txt`
- Categories: `/Import/CAT.csv`
- Products: `/{SUPPLIER_CODE}/{SUPPLIER_CODE}-100804.json`

**HTTP Client:**
```json
"node-fetch": "2.7.0"
```

## Frontend

### Next.js 14.0.0 + React
**Why:** Modern React framework with App Router, optimized for production

**Key Packages:**
```json
"next": "14.0.0",
"react": "^18",
"react-dom": "^18"
```

**UI Libraries:**
```json
"@radix-ui/react-checkbox": "^1.3.3",
"@radix-ui/react-label": "^2.1.7",
"@radix-ui/react-select": "^2.2.6",
"@radix-ui/react-slider": "^1.3.6",
"@radix-ui/react-slot": "^1.2.3",
"framer-motion": "^12.23.22",
"lucide-react": "^0.292.0"
```

**Styling:**
```json
"tailwindcss": "^3.3.0",
"tailwindcss-animate": "^1.0.7",
"tailwind-merge": "^3.3.1",
"class-variance-authority": "^0.7.1",
"clsx": "^2.1.1"
```

**Features:**
- App Router (Next.js 14)
- Server Components
- Client Components with state management
- shadcn/ui component library
- Tailwind CSS for styling
- Product catalog with pagination
- Language selector (multilingual support)

## Runtime & Languages

### TypeScript v5
**Why:** Type safety for backend services and controllers

**Config:**
```json
"@types/node": "^20",
"@types/react": "^18",
"@types/react-dom": "^18"
```

**Note:** Strapi uses TypeScript for custom services, controllers, and config files

## Docker & Deployment

### Docker Compose
**Services:**
- Strapi backend (port 7337)
- Nginx reverse proxy (ports 80, 443)

**Base Images:**
- Node.js (for Strapi)
- Nginx Alpine (for proxy)

**Health Checks:**
```yaml
test: ["CMD", "wget", "--spider", "http://localhost:7337/_health"]
interval: 30s
timeout: 10s
retries: 3
```

## Key Dependencies

### Production
```json
{
  "react": "^18.0.0",
  "react-dom": "^18.0.0",
  "react-router-dom": "^6.0.0",
  "styled-components": "^6.0.0",
  "dotenv": "^17.2.0"
}
```

### Strapi Core
- Automatic REST API generation
- Admin panel at `/admin`
- Content type builder
- Role-based permissions
- Media library

## Version Constraints

**Critical:**
- Node.js: 18.x - 22.x (inclusive)
- npm: >= 6.0.0
- PostgreSQL: 12+ (Neon provides latest)
- Strapi: 5.17.0 (major version change from v4)

## Environment Variables

**Required for Backend:**
```bash
# Server
HOST, PORT, NODE_ENV

# Database (Neon)
DATABASE_CLIENT=postgres
DATABASE_URL, DATABASE_HOST, DATABASE_PORT
DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD
DATABASE_SSL=true, DATABASE_SCHEMA=public

# Cloudflare R2
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME, R2_PUBLIC_URL, R2_ENDPOINT

# Strapi Security
APP_KEYS, API_TOKEN_SALT, ADMIN_JWT_SECRET
TRANSFER_TOKEN_SALT, JWT_SECRET, ENCRYPTION_KEY

# Promidata
PROMIDATA_BASE_URL

# Redis (Cache)
REDIS_HOST=localhost      # Default: localhost
REDIS_PORT=6379           # Default: 6379
REDIS_PASSWORD=           # Optional
REDIS_DB=0                # Optional, default: 0
```

## Notable Exclusions

**Not Using:**
- Elasticsearch (no full-text search engine)
- GraphQL (REST only)
- MongoDB (PostgreSQL for relational data)
- Local file storage (all media in R2)

## Upgrade Path

**Strapi Upgrade:**
```bash
npm run upgrade         # Live upgrade
npm run upgrade:dry     # Dry run first
```

**Check Compatibility:**
- Strapi 5.x introduced breaking changes from 4.x
- Custom plugins may need migration
- Database schema migrations automatic
