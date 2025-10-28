# Startup & Setup Guide

*Last updated: 2025-10-28 09:30*

## Quick Start

### Prerequisites

- **Node.js** 18.x - 22.x
- **npm** >= 6.0.0
- **PostgreSQL** (Neon cloud - already configured)
- **Cloudflare R2** account (already configured)
- **Promidata API** access (already configured)

### Start Both Servers

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run develop

# Terminal 2 - Frontend
cd frontend/dist
npx serve -p 3000
```

**Backend will be at:** http://0.0.0.0:7337
**Frontend will be at:** http://localhost:3000

## Environment Setup

### Required Environment Variables

Create `backend/.env` (or copy from project root):

```bash
# Server
HOST=0.0.0.0
PORT=7337
NODE_ENV=production

# Strapi Security Keys
APP_KEYS=<comma-separated-keys>
API_TOKEN_SALT=<salt>
ADMIN_JWT_SECRET=<secret>
TRANSFER_TOKEN_SALT=<salt>
JWT_SECRET=<secret>
ENCRYPTION_KEY=<key>

# Database - Neon PostgreSQL
DATABASE_CLIENT=postgres
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
DATABASE_HOST=ep-raspy-recipe-agqru8zy-pooler.c-2.eu-central-1.aws.neon.tech
DATABASE_PORT=5432
DATABASE_NAME=neondb
DATABASE_USERNAME=neondb_owner
DATABASE_PASSWORD=<password>
DATABASE_SSL=true
DATABASE_SCHEMA=public

# Connection Pool (IMPORTANT - Neon limitation)
DATABASE_POOL_MIN=0
DATABASE_POOL_MAX=1

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=<access-key>
R2_SECRET_ACCESS_KEY=<secret-key>
R2_BUCKET_NAME=texet-images
R2_PUBLIC_URL=https://pub-702243dedd784ac6b0c85c8bf53f461e.r2.dev
R2_ENDPOINT=https://22a71523d3dd456931ad531dc510c548.r2.cloudflarestorage.com

# Promidata API
PROMIDATA_BASE_URL=https://promi-dl.de/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23

# Optional
STRAPI_TELEMETRY_DISABLED=true
```

### Generating Strapi Keys (First Time)

If you need to generate new Strapi security keys:

```bash
# Install Strapi CLI globally
npm install -g @strapi/strapi

# Generate keys
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
# Run this 5 times for APP_KEYS (2), API_TOKEN_SALT, ADMIN_JWT_SECRET, TRANSFER_TOKEN_SALT, JWT_SECRET, ENCRYPTION_KEY
```

## First-Time Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

**Expected:** ~1790 packages installed (takes ~30-60 seconds)

### 2. Configure Environment

```bash
# Copy root .env to backend/ if not exists
cp ../.env .env

# Or create new .env with required variables
nano .env
```

### 3. Start Development Server

```bash
npm run develop
```

**Expected output:**
```
✔ Loading Strapi (9-15 seconds)
✔ Generating types (1 second)
✔ Compiling TS (6-8 seconds)

Project information:
- Time: [timestamp]
- Launched in: ~16000 ms
- Environment: production
- Version: 5.17.0
- Database: postgres

Actions available:
To access the server ⚡️, go to:
http://0.0.0.0:7337
```

### 4. Create Admin User

1. Visit http://0.0.0.0:7337/admin
2. Fill in admin user form:
   - First Name, Last Name
   - Email
   - Password (min 8 chars)
3. Click "Let's start"

### 5. Verify API Access

```bash
# Test public endpoint
curl http://0.0.0.0:7337/api/suppliers

# Should return JSON with suppliers array
```

## Development Commands

### Backend (Strapi)

```bash
# Development mode (auto-reload)
npm run develop

# Production mode
npm run build
npm start

# Strapi CLI
npm run strapi

# Interactive console
npm run console

# Upgrade Strapi
npm run upgrade         # Live upgrade
npm run upgrade:dry     # Test first
```

### Utility Scripts

```bash
# Test Promidata connection
node backend/scripts/test-promidata-sync.js

# Enable public API permissions
node backend/scripts/enable-public-permissions.js

# Import suppliers from Neon
node backend/scripts/import-suppliers-from-neon.js

# Import from JSON file
node backend/scripts/import-suppliers-json-to-neon.js

# Import Malfini products (specific supplier)
node backend/scripts/import-malfini.js
```

### Frontend (Static Build)

```bash
# Serve static files
cd frontend/dist
npx serve -p 3000

# Or with Python
python3 -m http.server 3000

# Or with Node http-server
npx http-server -p 3000
```

## Docker Deployment

### Using Docker Compose

```bash
# Start all services
docker-compose -f docker-compose-promovere-pim.yml up -d

# Or with helper script
./dc.sh up

# View logs
docker-compose -f docker-compose-promovere-pim.yml logs -f

# Stop services
docker-compose -f docker-compose-promovere-pim.yml down
```

**Services:**
- **Backend**: Port 7337 (internal)
- **Nginx**: Ports 80, 443 (external)
- **Network**: `promoatlas-network`

### Health Checks

Backend health endpoint: http://0.0.0.0:7337/_health

**Expected:** HTTP 204 No Content

## Troubleshooting

### Backend Won't Start

**Error:** `strapi: command not found`

**Fix:**
```bash
cd backend
rm -rf node_modules
npm install
```

---

**Error:** `App keys are required`

**Fix:** Ensure `APP_KEYS` is set in `.env`
```bash
# Generate new keys
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

---

**Error:** `Database connection failed`

**Fix:**
1. Check DATABASE_URL is correct
2. Verify DATABASE_SSL=true for Neon
3. Test connection:
```bash
psql "$DATABASE_URL" -c "SELECT 1"
```

---

**Error:** `Port 7337 already in use`

**Fix:**
```bash
# Find process
lsof -i :7337

# Kill process
kill -9 <PID>

# Or change port in .env
PORT=7338
```

### Cloudflare R2 Issues

**Error:** `Upload failed` or `provider config requires cloudflarePublicAccessUrl`

**Fix:**
1. Verify R2 credentials in `.env`
2. Test R2 access:
```bash
curl -I https://pub-702243dedd784ac6b0c85c8bf53f461e.r2.dev/test.jpg
```
3. Check bucket permissions in Cloudflare dashboard

### Promidata Sync Failing

**Error:** `Failed to fetch suppliers`

**Fix:**
1. Test API connection:
```bash
curl -I https://promi-dl.de/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23/Import/Import.txt
```
2. Verify PROMIDATA_BASE_URL in `.env`
3. Check sync logs in Strapi admin:
   - Settings → Promidata Sync → View History

**Error:** `Image download timeout`

**Fix:**
- Increase timeout in sync service
- Check network connectivity
- Verify image URLs are accessible

### Database Issues

**Error:** `Pool exhausted` or `Too many connections`

**Fix:**
- This is expected with Neon (max 1 connection)
- Ensure DATABASE_POOL_MAX=1 in `.env`
- Use pooler endpoint: `-pooler.c-2.eu-central-1.aws.neon.tech`

---

**Error:** `SSL connection required`

**Fix:**
```bash
# In .env
DATABASE_SSL=true

# In DATABASE_URL
?sslmode=require&channel_binding=require
```

### Frontend Issues

**Error:** `API calls failing` or `CORS errors`

**Fix:**
1. Verify backend is running: http://0.0.0.0:7337
2. Check public permissions enabled:
```bash
node backend/scripts/enable-public-permissions.js
```
3. Test API manually:
```bash
curl http://0.0.0.0:7337/api/products
```

---

**Error:** `Blank page` or `404 Not Found`

**Fix:**
1. Verify `frontend/dist/index.html` exists
2. Check API_BASE_URL in `frontend/.env`:
```bash
VITE_API_URL=http://0.0.0.0:7337/api
```
3. Rebuild frontend (if source available in `n8n_workflow` branch):
```bash
git checkout n8n_workflow
cd frontend
npm install
npm run build
git checkout test_atlas
```

## Performance Tips

### Backend Optimization

1. **Use Production Build:**
```bash
npm run build
NODE_ENV=production npm start
```

2. **Optimize Database Queries:**
- Use selective population: `populate[field]=true`
- Limit page size: `pagination[pageSize]=25`
- Use filtering over client-side filtering

3. **Enable Caching (if needed):**
- Consider Redis for session/cache
- Not currently implemented

### Frontend Optimization

1. **Use CDN for Static Files:**
- Deploy `frontend/dist/` to Vercel/Netlify
- Configure R2 public URL for images

2. **Optimize API Calls:**
- Pagination: `?pagination[limit]=100`
- Select specific fields: `fields[0]=sku&fields[1]=name`
- Cache responses client-side

## Useful Queries

### Check Database Schema

```bash
psql "$DATABASE_URL" -c "\dt"  # List tables
psql "$DATABASE_URL" -c "\d products"  # Describe products table
```

### Check Content Counts

```bash
# Via Strapi console
npm run console

# Then in console:
const count = await strapi.entityService.count('api::product.product');
console.log('Total products:', count);
```

### Check Sync Status

```bash
# Via API
curl http://0.0.0.0:7337/api/promidata-sync/getSyncStatus

# Via Admin UI
# Visit: http://0.0.0.0:7337/admin
# Navigate: Settings → Promidata Sync → Sync Status
```

## Ports Used

- **7337** - Backend (Strapi)
- **3000** - Frontend (static serve)
- **80** - Nginx HTTP (Docker)
- **443** - Nginx HTTPS (Docker)
- **5432** - PostgreSQL (Neon - external)

## File Locations

**Backend:**
- Config: `backend/config/`
- Content Types: `backend/src/api/`
- Scripts: `backend/scripts/`
- Environment: `backend/.env`

**Frontend:**
- Build: `frontend/dist/`
- Environment: `frontend/.env`
- Source: Available in `n8n_workflow` branch

**Docker:**
- Compose: `docker-compose-promovere-pim.yml`
- Helper: `dc.sh`

## Environment-Specific Settings

### Development
```bash
NODE_ENV=development
HOST=localhost
PORT=1337  # Default Strapi port
```

### Production (Current)
```bash
NODE_ENV=production
HOST=0.0.0.0
PORT=7337
```

## Next Steps After Setup

1. **Import Suppliers:**
```bash
node backend/scripts/import-suppliers-from-neon.js
```

2. **Run Initial Sync:**
- Visit http://0.0.0.0:7337/admin
- Navigate to Promidata Sync
- Click "Start Sync" for a test supplier (e.g., A113)

3. **Verify Products:**
```bash
curl "http://0.0.0.0:7337/api/products?pagination[limit]=10"
```

4. **Access Frontend:**
- Open http://localhost:3000
- Should display product catalog
