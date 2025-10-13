# Atlas PIM - Product Information Management System

## 🔀 Branch Information

**You are currently on the `test_atlas` branch.**

This branch contains the **production Strapi backend** with basic static frontend build.

## 📌 Looking for the Full-Stack Application?

**👉 Switch to the `n8n_workflow` branch** for the complete system with:

- ✅ Strapi CMS Backend (same as this branch)
- ✅ **Next.js Frontend** with AI Chat Interface
- ✅ **n8n Workflow** Automation
- ✅ **Qdrant** Vector Database Integration
- ✅ **AI-Powered** Product Search with Google Gemini
- ✅ **Semantic Search** with PostgreSQL pgVector
- ✅ **Complete Documentation** and setup guide

### Switch to Full-Stack System

```bash
git checkout n8n_workflow
```

Then read the comprehensive README in that branch for:
- Step-by-step setup for all services
- n8n workflow configurations
- Docker setup for Qdrant and n8n
- Complete AI search implementation

---

## 📦 What's in This Branch (test_atlas)

### 🎯 Purpose
This is the **production backend branch** for Atlas PIM, focused on product data management with Promidata supplier integration.

### 🔧 Components

#### Backend (Strapi CMS)
- **Strapi CMS** v5.17.0
- **PostgreSQL** database (Neon)
- **Cloudflare R2** storage for product images
- **Promidata Integration** - Automated product sync from supplier API
- **Custom Admin Plugin** - Promidata Sync management interface
- **RESTful API** - Auto-generated endpoints for all content types

#### Frontend (Static Build)
- Basic **Vite** build in `frontend/dist/`
- Simple product catalog display
- Connected to Strapi API at `https://atlas-strapi.solsdev.com/api`
- Static HTML/JS/CSS files ready for deployment

> **Note:** For advanced frontend features (AI chat, semantic search, real-time updates), use the `n8n_workflow` branch which has a full Next.js application.

### 📊 Content Types

1. **Category** - Product categories
2. **Supplier** - Supplier information
3. **Parent Product** - Product families/groups
4. **Product** - Individual products
5. **Product Variant** - Product variations (sizes, colors, materials, etc.)
6. **Sync Configuration** - Promidata sync settings
7. **Promidata Sync** - Sync execution tracking and history

### 🔗 Data Relationships

```
Supplier (1) ──< (N) Parent Product
Parent Product (1) ──< (N) Product
Product (1) ──< (N) Product Variant
Category (1) ──< (N) Product
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** database (Neon recommended)
- **Cloudflare R2** bucket account
- **Promidata** API access

### 1. Backend Setup (Strapi)

**Navigate to backend:**
```bash
cd backend
```

**Install dependencies:**
```bash
npm install
```

**Configure environment variables:**

Create `backend/.env` file:

```env
# Server
HOST=0.0.0.0
PORT=1337

# Strapi Keys (auto-generated on first run or use existing)
APP_KEYS=your_app_keys_here
API_TOKEN_SALT=your_api_token_salt
ADMIN_JWT_SECRET=your_admin_jwt_secret
TRANSFER_TOKEN_SALT=your_transfer_token_salt
JWT_SECRET=your_jwt_secret

# Database - Neon PostgreSQL
DATABASE_CLIENT=postgres
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
DATABASE_HOST=your-host.neon.tech
DATABASE_PORT=5432
DATABASE_NAME=neondb
DATABASE_USERNAME=your_username
DATABASE_PASSWORD=your_password
DATABASE_SSL=true
DATABASE_SCHEMA=public

# Cloudflare R2 Storage
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_BUCKET_NAME=texet-images
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
R2_ENDPOINT=https://xxxxx.r2.cloudflarestorage.com

# Promidata API
PROMIDATA_BASE_URL=https://promi-dl.de/Profiles/Live/your-profile-id

# Environment
NODE_ENV=development
PUBLIC_URL=http://localhost:1337

# Admin Encryption
ENCRYPTION_KEY=your_encryption_key
```

**Start Strapi:**
```bash
npm run develop
```

**Access admin panel:**
- Visit http://localhost:1337/admin
- Create your first admin user

### 2. Frontend Setup (Optional - Static Build)

The frontend is already built in `frontend/dist/`. To serve it:

**Option 1: Simple HTTP Server**
```bash
cd frontend/dist
npx serve
```

**Option 2: Update API URL and Rebuild**

If you need to point to a different Strapi instance:

1. Edit `frontend/.env`:
```env
VITE_API_URL=http://localhost:1337/api
API_BASE_URL=http://localhost:1337/api
```

2. Rebuild (requires source files from another branch/backup):
```bash
cd frontend
npm install
npm run build
```

## 🔄 Promidata Integration

### Features

- **Automated Sync**: Fetch products from Promidata XML API
- **Image Management**: Download and upload product images to Cloudflare R2
- **Variant Creation**: Automatically create product variants (sizes, colors)
- **Sync History**: Track all sync operations and their status
- **Error Handling**: Comprehensive logging and error reporting

### Custom Admin Plugin

Access the Promidata Sync plugin in Strapi admin:
1. Log in to http://localhost:1337/admin
2. Click **"Promidata Sync"** in the left sidebar
3. Configure sync settings or trigger manual sync

### Manual Sync Scripts

Located in `backend/scripts/`:

```bash
# Test Promidata connection and sync
node backend/scripts/test-promidata-sync.js

# Import supplier data from Neon database
node backend/scripts/import-suppliers-from-neon.js

# Import suppliers from JSON file
node backend/scripts/import-suppliers-json-to-neon.js

# Import Malfini products specifically
node backend/scripts/import-malfini.js

# Enable public API permissions
node backend/scripts/enable-public-permissions.js
```

## 📁 Backend Structure

```
backend/
├── config/
│   └── plugins.js              # Cloudflare R2 upload configuration
├── src/
│   ├── api/                    # Content types (auto-generated)
│   │   ├── category/
│   │   ├── parent-product/
│   │   ├── product/
│   │   ├── product-variant/
│   │   ├── supplier/
│   │   ├── sync-configuration/
│   │   └── promidata-sync/
│   └── extensions/
│       └── promidata-sync/     # Custom Strapi admin plugin
│           ├── strapi-admin.js # Admin UI integration
│           └── package.json
├── scripts/                    # Utility scripts
│   ├── enable-public-permissions.js
│   ├── import-malfini.js
│   ├── import-suppliers-from-neon.js
│   ├── import-suppliers-json-to-neon.js
│   └── test-promidata-sync.js
└── package.json
```

## 🔍 API Endpoints

### Public Endpoints

```
GET  /api/products              # List all products
GET  /api/products/:id          # Get single product
GET  /api/product-variants      # List all product variants
GET  /api/categories            # List all categories
GET  /api/suppliers             # List all suppliers
GET  /api/parent-products       # List all parent products
```

### Query Parameters

```bash
# Pagination
?pagination[page]=1&pagination[pageSize]=25

# Population (include relations)
?populate[parent_product][fields][0]=sku
?populate[parent_product][fields][1]=brand

# Filtering
?filters[product_color][$eq]=Black
?filters[product_name][$contains]=Sweater

# Sorting
?sort[0]=createdAt:desc
```

### Example Requests

```bash
# Get 100 product variants with parent product data
curl "http://localhost:1337/api/product-variants?pagination[limit]=100&populate[parent_product][fields][0]=sku&populate[parent_product][fields][1]=brand"

# Get black sweaters
curl "http://localhost:1337/api/product-variants?filters[product_color][$eq]=Black&filters[product_name][$contains]=Sweater"
```

## 🎯 Recent Improvements

Based on latest commits:

- ✅ **Comprehensive Promidata sync improvements**
  - Better error handling
  - Improved data extraction logic
  - Enhanced image processing

- ✅ **Supplier name update** for existing parent products
  - Automatic supplier association
  - Bulk update capabilities

- ✅ **Fixed DefaultProducts extraction**
  - Removed double processing
  - Improved SKU extraction from XML
  - Better handling of product variants

## 🛠️ Utility Features

### Enable Public API Access

By default, Strapi APIs require authentication. To enable public read access:

```bash
node backend/scripts/enable-public-permissions.js
```

This script automatically:
- Enables `find` and `findOne` permissions for Public role
- Applies to all content types
- Allows frontend to fetch data without authentication

### Import Existing Data

```bash
# Import suppliers from external database
node backend/scripts/import-suppliers-from-neon.js

# Import from JSON backup
node backend/scripts/import-suppliers-json-to-neon.js
```

## 🐛 Troubleshooting

### Strapi Won't Start

**Check environment variables:**
```bash
# Verify .env file exists
cat backend/.env

# Check database connection
psql $DATABASE_URL -c "SELECT 1"
```

**Clear cache and rebuild:**
```bash
cd backend
rm -rf .cache build
npm run build
npm run develop
```

### Promidata Sync Failing

**Verify API access:**
```bash
curl -I $PROMIDATA_BASE_URL
```

**Check logs in Strapi admin:**
- Go to Settings → Promidata Sync
- View sync history and error messages

**Test connection:**
```bash
node backend/scripts/test-promidata-sync.js
```

### Images Not Loading

**Check R2 configuration:**
- Verify `R2_PUBLIC_URL` is accessible
- Ensure bucket has public read permissions
- Test image URL: `https://pub-xxxxx.r2.dev/{product_sku}-primary.jpg`

**Image naming convention:**
- Primary image: `{product_sku}-primary.jpg`
- Additional images: `{product_sku}-1.jpg`, `{product_sku}-2.jpg`, etc.

### Database Connection Errors

**Neon PostgreSQL specific:**
- Ensure SSL is enabled: `DATABASE_SSL=true`
- Use pooler endpoint for better performance
- Check firewall/network allows connections to Neon

**Connection string format:**
```
postgresql://user:password@host.neon.tech/dbname?sslmode=require&channel_binding=require
```

## 🔗 Important Links

### Local Development
- **Strapi Admin**: http://localhost:1337/admin
- **Strapi API**: http://localhost:1337/api
- **API Documentation**: http://localhost:1337/documentation

### Official Documentation
- **Strapi Docs**: https://docs.strapi.io/
- **Cloudflare R2**: https://developers.cloudflare.com/r2/
- **Neon PostgreSQL**: https://neon.tech/docs
- **Promidata API**: Contact supplier for documentation

---

## 💡 Want AI-Powered Features?

This branch provides a solid **production backend** for product management.

For the complete **modern frontend** with:
- 🤖 AI-powered chat interface
- 🔍 Semantic product search
- 📊 Vector database integration
- 🎨 Beautiful Next.js UI
- ⚡ Real-time updates
- 🔄 n8n workflow automation

**Switch to the full-stack branch:**
```bash
git checkout n8n_workflow
```

---

**Branch**: `test_atlas`
**Focus**: Production Backend + Static Frontend
**Status**: Stable, actively maintained
**Best For**: Backend API development, Promidata integration, product data management
