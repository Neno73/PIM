# Multi-stage build for production-optimized Strapi 5
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Development stage
FROM base AS dev
WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
EXPOSE 1337
ENV NODE_ENV=development
CMD ["npm", "run", "develop"]

# Build stage
FROM base AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .

# Set production environment for build
ENV NODE_ENV=production
ENV STRAPI_TELEMETRY_DISABLED=true

# Build Strapi
RUN npm run build

# Production stage
FROM base AS production
WORKDIR /app

# Create strapi user
RUN addgroup -g 1001 -S strapi && \
    adduser -S strapi -u 1001

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy built application
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./

# Copy COMPILED configuration files from dist, not source
COPY --from=builder /app/dist/config ./config
COPY --from=builder /app/database ./database

# Create necessary directories and set permissions
RUN mkdir -p /app/.tmp && \
    chown -R strapi:strapi /app/.tmp /app/dist /app/public /app/config /app/database /app/package*.json

# Run as root for now to avoid permission issues
# USER strapi

EXPOSE 1337
ENV NODE_ENV=production
ENV STRAPI_TELEMETRY_DISABLED=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:1337/_health || exit 1

CMD ["npm", "start"]