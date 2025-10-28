# Documentation Index

*Last updated: 2025-10-28 09:30*

## Available Documentation

Read these docs when working on specific project areas:

- **STACK.md** - Tech stack: Strapi 5.17, Neon PostgreSQL, Cloudflare R2, Promidata API
  - Read when: Adding dependencies, upgrading packages, configuring external services

- **ARCHITECTURE.md** - System design: Content types, data model, API structure
  - Read when: Creating new content types, modifying schemas, understanding relationships

- **PATTERNS.md** - Code conventions: Strapi factories, service patterns, TypeScript types
  - Read when: Writing new controllers/services, following project conventions

- **STARTUP.md** - Setup guide: Environment variables, database config, running servers
  - Read when: Onboarding new developers, troubleshooting startup issues

- **GOTCHAS.md** - Known issues: Neon connection limits, R2 config, sync edge cases
  - Read when: Debugging errors, dealing with known limitations

- **DECISIONS.md** - Architectural decisions: Why we chose specific patterns/technologies
  - Read when: Understanding past decisions, making new architectural choices

- **IMPROVEMENT_PLAN.md** - Refactoring roadmap: Modularization, caching, security improvements
  - Read when: Planning technical debt reduction, implementing new architecture

## How to Use This Documentation

1. **CLAUDE.md** (root) is auto-loaded every session with essential context
2. **These files** are imported on-demand via `@.claude/FILENAME.md`
3. Update docs as the project evolves using timestamps
4. Keep entries concise and scannable

## Adding New Documentation

When creating new docs:
1. Add entry to this INDEX.md with description
2. Include timestamp in the new file
3. Use code examples over long explanations
4. Link from CLAUDE.md if it's frequently needed
