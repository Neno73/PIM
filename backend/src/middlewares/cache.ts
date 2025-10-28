/**
 * Cache Middleware
 * Provides response caching for GET requests using Redis
 */

import redisService from '../services/redis.service';

interface CacheOptions {
  ttl?: number; // Time to live in seconds (default: 300 = 5 minutes)
  prefix?: string; // Cache key prefix (default: 'api')
  exclude?: string[]; // Routes to exclude from caching
}

/**
 * Create a cache middleware with custom options
 */
export function createCacheMiddleware(options: CacheOptions = {}) {
  const {
    ttl = 300, // Default 5 minutes
    prefix = 'api',
    exclude = [],
  } = options;

  return async (ctx, next) => {
    // Only cache GET requests
    if (ctx.method !== 'GET') {
      return await next();
    }

    // Skip if Redis is not connected
    if (!redisService.isReady()) {
      return await next();
    }

    // Check if route should be excluded
    const isExcluded = exclude.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(ctx.path);
      }
      return ctx.path.startsWith(pattern);
    });

    if (isExcluded) {
      return await next();
    }

    // Generate cache key from path and query
    const cacheKey = generateCacheKey(ctx.path, ctx.query, prefix);

    // Try to get cached response
    let cached = null;
    try {
      cached = await redisService.get(cacheKey);
    } catch (error) {
      console.error('Cache get error:', error);
    }

    if (cached) {
      // Return cached response
      ctx.set('X-Cache', 'HIT');
      ctx.set('X-Cache-Key', cacheKey);
      ctx.body = cached;
      return;
    }

    // Execute the route handler
    await next();

    // Cache successful responses (200-299 status codes)
    if (ctx.status >= 200 && ctx.status < 300 && ctx.body) {
      try {
        await redisService.set(cacheKey, ctx.body, ttl);
        ctx.set('X-Cache', 'MISS');
        ctx.set('X-Cache-Key', cacheKey);
      } catch (error) {
        console.error('Cache set error:', error);
      }
    }
  };
}

/**
 * Generate a cache key from path and query params
 */
function generateCacheKey(path: string, query: any, prefix: string): string {
  // Sort query params for consistent key generation
  const sortedQuery = Object.keys(query || {})
    .sort()
    .map(key => {
      const value = query[key];
      // Serialize objects and arrays properly
      if (typeof value === 'object' && value !== null) {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join('&');

  const queryString = sortedQuery ? `?${sortedQuery}` : '';
  return `${prefix}:${path}${queryString}`;
}

/**
 * Invalidate cache for a specific pattern
 */
export async function invalidateCache(pattern: string): Promise<number> {
  try {
    if (!redisService.isReady()) {
      return 0;
    }

    const count = await redisService.delPattern(pattern);
    console.log(`Cache invalidated: ${count} keys matching pattern "${pattern}"`);
    return count;
  } catch (error) {
    console.error('Cache invalidation error:', error);
    return 0;
  }
}

/**
 * Invalidate cache for specific entity type
 */
export async function invalidateEntityCache(entityType: string): Promise<number> {
  const pattern = `api:/api/${entityType}*`;
  return await invalidateCache(pattern);
}

/**
 * Strapi middleware factory function
 */
export default (config, { strapi }) => {
  return createCacheMiddleware({
    ttl: config.ttl || 300,
    prefix: config.prefix || 'api',
    exclude: config.exclude || [
      '/api/promidata-sync/*', // Don't cache sync operations
      '/admin/*', // Don't cache admin routes
      '/auth/*', // Don't cache auth routes
    ],
  });
};
