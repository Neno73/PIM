# Architectural Decisions

*Last updated: 2025-10-28 14:45*

This log tracks significant architectural decisions made during development.

## Decision Template

When adding a decision, include:
- **Date**: When the decision was made
- **Context**: What problem we're solving
- **Decision**: What we decided to do
- **Consequences**: Trade-offs and implications
- **Status**: Accepted / Superseded / Deprecated

---

## [2025-10-28] Initial Project Documentation Setup

**Status:** Accepted

**Context:** Project initialized without structured documentation. Claude Code needed clear operating instructions for this specific project.

**Decision:**
- Analyzed existing codebase to understand actual architecture, patterns, and stack
- Created CLAUDE.md as root documentation (auto-loaded every session)
- Generated detailed docs in .claude/ directory (imported on-demand)
- Used @import system for progressive documentation disclosure

**Consequences:**
+ Claude has project-specific context at session start
+ Detailed docs available without context pollution
+ Easy to maintain and update documentation
- Requires discipline to keep docs in sync with code

---

## [Unknown Date] Use Strapi v5 as Backend Framework

**Status:** Accepted

**Context:** Needed headless CMS for product management with REST APIs and admin UI.

**Decision:** Strapi CMS v5.17.0 chosen as backend framework.

**Consequences:**
+ Auto-generated REST APIs for all content types
+ Built-in admin panel for content management
+ Plugin ecosystem for extensibility (R2 upload, custom admin plugins)
+ TypeScript support for custom services/controllers
- Upgrade from v4 to v5 had breaking changes
- Limited connection pooling with Neon PostgreSQL
- Custom admin plugins require specific structure

**Rationale:** Mature headless CMS with active community, good documentation, and flexible content type system.

---

## [Unknown Date] Neon PostgreSQL as Database

**Status:** Accepted

**Context:** Needed managed PostgreSQL with auto-scaling and branching capabilities.

**Decision:** Neon serverless PostgreSQL in EU Central 1 (Frankfurt).

**Consequences:**
+ Managed database with auto-scaling
+ Database branching for testing
+ Connection pooling at infrastructure level
+ SSL required by default
- **Max 1 local connection** (DATABASE_POOL_MAX=1)
- Requires pooler endpoint for production
- Cannot use traditional connection pooling

**Rationale:** Serverless PostgreSQL with modern features, perfect for Strapi backend.

---

## [Unknown Date] Cloudflare R2 for Image Storage

**Status:** Accepted

**Context:** Needed object storage for product images (1000s of files).

**Decision:** Cloudflare R2 S3-compatible storage with public CDN access.

**Consequences:**
+ Zero egress fees (major cost savings)
+ S3-compatible API (easy integration)
+ Global CDN for fast image delivery
+ Public URLs for direct access
- Must use `strapi-provider-cloudflare-r2` plugin
- Warning for files > 5MB requires public URL config
- Image naming convention must be consistent

**Rationale:** Cost-effective, performant, S3-compatible storage with CDN.

---

## [Unknown Date] Hash-Based Change Detection for Sync

**Status:** Accepted

**Context:** Promidata sync would re-import all products every time, even unchanged ones.

**Decision:** Calculate MD5 hash of product data, store in `promidata_hash` field, compare before updating.

**Consequences:**
+ Only sync changed products (massive performance gain)
+ Reduced database writes
+ Lower R2 bandwidth usage
+ Faster sync completion
- Requires hash calculation overhead
- Hash collisions possible (extremely rare with MD5)
- Must include all relevant fields in hash

**Rationale:** Sync 1000s of products efficiently, avoid unnecessary updates.

---

## [Unknown Date] Multilingual Fields as JSON

**Status:** Accepted

**Context:** Products need multilingual support (English, Dutch, German, etc.).

**Decision:** Store multilingual fields as JSON objects: `{ en: "...", nl: "...", de: "..." }`

**Consequences:**
+ Flexible - add languages without schema changes
+ No additional tables/relations needed
+ Easy to query specific language
+ Compact storage
- No database-level type safety
- Must validate JSON structure in code
- TypeScript types require custom interfaces
- Cannot use database constraints on individual languages

**Rationale:** Maximum flexibility for i18n without complex schema changes.

---

## [Unknown Date] Public API Access via Bootstrap

**Status:** Accepted

**Context:** Frontend needs to consume APIs without authentication.

**Decision:** Auto-enable public permissions in `backend/src/index.ts` bootstrap.

**Consequences:**
+ Frontend works immediately without auth setup
+ No API token management needed
+ Consistent permissions across deployments
- Public data exposure (intended for public products)
- Bootstrap runs on every restart
- Cannot easily toggle per-environment

**Rationale:** Public product catalog requires no authentication barrier.

---

## [Unknown Date] Hardcoded Supplier Mapping

**Status:** Accepted (Should be reconsidered)

**Context:** Supplier codes (A23, A113, etc.) need human-readable names.

**Decision:** Hardcode supplier code-to-name mapping in sync service.

**Consequences:**
+ Simple to implement
+ No additional database queries
+ Fast lookups
- New suppliers require code changes
- Cannot add suppliers via admin UI
- Maintenance burden for supplier updates
- Not scalable beyond ~50 suppliers

**Future Consideration:** Move to database table with admin UI for management.

---

## [Unknown Date] Monolithic Sync Service

**Status:** Accepted (Needs improvement)

**Context:** Promidata sync logic grew to 2386 lines in single file.

**Decision:** Keep all sync logic in `promidata-sync.ts` service.

**Consequences:**
+ All logic in one place
+ Easy to find sync-related code
- Difficult to maintain
- Hard to test individual functions
- Long file makes debugging challenging
- New developers overwhelmed by size

**Future Improvement:**
- Break into modules (suppliers, products, images, utils)
- Extract helper functions to separate files
- Add unit tests for individual functions

---

## [Unknown Date] Static Frontend Build Only

**Status:** Temporary

**Context:** This branch (`test_atlas`) focuses on backend development.

**Decision:** Include pre-built static frontend in `frontend/dist/`, no source files.

**Consequences:**
+ Lightweight branch focused on backend
+ Easy to serve static files
+ No frontend build step needed
- Cannot modify frontend without switching branches
- No SSR/SSG benefits
- Limited to basic product catalog
- Must use `n8n_workflow` branch for frontend development

**Rationale:** Separation of concerns - backend branch vs. full-stack branch.

---

## [Unknown Date] Port 7337 Instead of Default 1337

**Status:** Accepted

**Context:** Avoid conflicts with other Strapi projects.

**Decision:** Use port 7337 for backend server.

**Consequences:**
+ No port conflicts with default Strapi installations
+ Can run multiple Strapi projects simultaneously
- Non-standard port (must remember/document)
- Firewall rules need updating
- Docker/Nginx config must match

**Rationale:** Developer convenience, avoid localhost port conflicts.

---

## [2025-10-28] Implement Redis Caching

**Status:** Accepted

**Context:** API responses were hitting the database for every request, causing slower response times under load. Neon PostgreSQL connection pool limited to 1 connection made this especially problematic.

**Decision:** Implement Redis-based response caching using ioredis client with custom Koa middleware.

**Consequences:**
+ Significantly reduced database queries for repeated requests
+ Improved API response times (cache hits return immediately)
+ Added `X-Cache` headers for debugging (HIT/MISS)
+ Configurable TTL (default: 5 minutes) and route exclusions
- Requires Redis running (adds infrastructure dependency)
- Cache invalidation needed after content updates
- Stale data possible if TTL too long

**Implementation:**
- Middleware: `backend/src/middlewares/cache.ts`
- Service: `backend/src/services/redis.service.ts`
- Configuration: `backend/config/middlewares.ts`

**Alternatives Considered:**
- No caching (rejected - too slow under load)
- Application-level caching (rejected - doesn't reduce DB queries)
- CDN caching only (rejected - not sufficient for dynamic data)

**Rationale:** Middleware-based Redis caching provides optimal balance of performance, simplicity, and flexibility.

---

## [2025-10-28] Fix Pagination with Button Elements

**Status:** Accepted

**Context:** Product pagination controls were visible but clicking them didn't load new pages. Investigation revealed two issues:
1. shadcn/ui `PaginationLink` used `<a>` tags instead of `<button>`
2. Redis cache keys included `[object Object]` instead of serialized pagination params

**Decision:**
1. Change `PaginationLink` to render `<button>` elements instead of anchors
2. Update cache key generation to properly serialize object parameters with `JSON.stringify()`

**Consequences:**
+ Pagination now fully functional
+ Each page has unique cache key
+ Semantic HTML (buttons for actions, not links)
- Required modifying shadcn/ui component (divergence from upstream)
- Cache keys now longer (include full JSON)

**Files Modified:**
- `frontend/src/components/ui/pagination.tsx:37-59`
- `backend/src/middlewares/cache.ts:86-102`

**Root Cause:** Anchor tags without `href` don't properly handle `onClick` events, and JavaScript's default object toString() converts to "[object Object]".

**Rationale:** Button elements are semantically correct for pagination actions, and proper serialization prevents cache key collisions.

---

## [2025-10-28] Remove Chat Interface from Main Branch

**Status:** Accepted

**Context:** Frontend was copied from `n8n_workflow` branch which included full AI chat interface with semantic search, but the main branch (`test_atlas`) focuses solely on product catalog without AI features.

**Decision:** Remove all chat-related components, API routes, and dependencies to keep this branch focused on product management only.

**Consequences:**
+ Cleaner, more focused codebase
+ Reduced package count (from ~400 to 196 dependencies)
+ Removed ~3,989 accidentally committed node_modules files
+ Smaller bundle size
- AI features not available on this branch (intentional)
- Must switch to `n8n_workflow` branch for chat functionality

**Removed:**
- Components: `ChatInterface`, `AtlasChatInterface`, `ModernChatInterface`, `StreamingChatInterface`, `SemanticSearchInterface`
- API Routes: `/api/chat`, `/api/chat-stream`, `/api/semantic-search`, `/api/cleanup`
- Dependencies: `@ai-sdk/react`, `ai`, `react-markdown`, `pg`, `@types/pg`

**Alternatives Considered:**
- Keep chat interface dormant (rejected - unnecessary code bloat)
- Extract to separate npm package (rejected - overkill for branch separation)

**Rationale:** Branch separation keeps concerns isolated - main branch for product catalog, n8n_workflow for AI features.

---

## [2025-10-28] Security: Remove .env Files from Git

**Status:** Accepted

**Context:** Environment files containing production secrets (database credentials, R2 access keys, Strapi JWT secrets) were tracked in git and exposed in GitHub repository.

**Decision:**
1. Immediately remove `.env` files from git tracking with `git rm --cached`
2. Create `.gitignore` to prevent future tracking
3. Commit removal with security warning
4. Document need for secret rotation in commit message

**Consequences:**
+ Secrets no longer exposed in latest commit
+ Future .env files automatically ignored
- Secrets still in git history (requires rotation)
- Anyone who cloned repo before this commit has access to secrets

**Security Impact:**
- **CRITICAL:** Exposed credentials include:
  - Database password: `npg_SKraxqA13stc`
  - R2 Access Keys
  - Strapi JWT secrets and encryption keys

**Next Steps (Recommended):**
1. Rotate all exposed secrets immediately
2. Use BFG Repo-Cleaner to remove from git history
3. Audit access logs for unauthorized usage

**Alternatives Considered:**
- Leave in git with warning comment (rejected - unacceptable security risk)
- Delete entire repository (rejected - too disruptive)

**Rationale:** Immediate removal from tracking prevents further exposure, though secret rotation still required.

---

## Future Decisions to Make

### 1. Caching Layer
**Status:** ~~Future~~ → **IMPLEMENTED (2025-10-28)**

See decision: [2025-10-28] Implement Redis Caching above.

Original question: Should we add Redis for caching?
**Answer:** Yes - Now implemented with middleware-based caching.

---

### 2. Testing Strategy
**Question:** What testing framework and coverage?
**Considerations:**
- Jest for unit tests
- Supertest for API integration tests
- Coverage targets (70%? 80%?)
- CI/CD integration

### 3. Supplier Data in Database
**Question:** Move supplier mapping from code to database?
**Considerations:**
- Admin UI for managing suppliers
- Scalability beyond 50 suppliers
- Migration effort required
- Backward compatibility

### 4. Frontend Framework Decision
**Question:** Keep static build or adopt Next.js permanently?
**Considerations:**
- SEO requirements
- Dynamic features needed
- Deployment complexity
- Team frontend expertise

### 5. Sync Service Refactoring
**Question:** Break monolithic service into modules?
**Considerations:**
- Maintainability improvement
- Testing ease
- Refactoring effort vs. benefit
- Risk of breaking existing functionality

---

## How to Add Decisions

When making an architectural decision:

1. **Document immediately** - Don't wait until "later"
2. **Include timestamp** - YYYY-MM-DD format
3. **Explain context** - Why was this needed?
4. **State decision clearly** - What exactly did we choose?
5. **List trade-offs** - Both pros (+) and cons (-)
6. **Note alternatives** - What else was considered?
7. **Update status** - Accepted / Superseded / Deprecated

Example:
```markdown
## [2025-10-28] Use TypeScript for Services

**Status:** Accepted

**Context:** Strapi supports both JS and TS, need to choose.

**Decision:** Use TypeScript for all custom services and controllers.

**Consequences:**
+ Type safety prevents runtime errors
+ Better IDE autocomplete
+ Self-documenting code with interfaces
- Slightly slower development
- Need TypeScript knowledge on team

**Alternatives Considered:**
- JavaScript only (simpler but less safe)
- Mix of JS and TS (inconsistent)

**Rationale:** Type safety worth the overhead for complex sync logic.
```
