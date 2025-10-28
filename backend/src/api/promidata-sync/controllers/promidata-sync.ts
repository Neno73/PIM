/**
 * Promidata Sync Controller
 * Handles API endpoints for managing Promidata synchronization
 */

// Define a simple context type
interface Context {
  request: {
    body: any;
  };
  query: any;
  body: any;
  badRequest: (message: string, details?: any) => void;
}

export default {
  /**
   * Start manual sync for all suppliers or a specific supplier
   */
  async startSync(ctx: Context) {
    try {
      const { supplierId } = ctx.request.body;
      
      // Get sync service
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      
      // Start sync
      const result = await syncService.startSync(supplierId);
      
      ctx.body = {
        success: true,
        message: 'Sync started successfully',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Sync failed', { details: error.message });
    }
  },

  /**
   * Get sync status for all suppliers
   */
  async getSyncStatus(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      const status = await syncService.getSyncStatus();
      
      ctx.body = {
        success: true,
        data: status
      };
    } catch (error) {
      ctx.badRequest('Failed to get sync status', { details: error.message });
    }
  },

  /**
   * Get sync history/logs
   */
  async getSyncHistory(ctx: Context) {
    try {
      const { page = 1, pageSize = 25 } = ctx.query;
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      
      const history = await syncService.getSyncHistory({
        page: Number(page),
        pageSize: Number(pageSize)
      });
      
      ctx.body = {
        success: true,
        data: history
      };
    } catch (error) {
      ctx.badRequest('Failed to get sync history', { details: error.message });
    }
  },

  /**
   * Import categories from CAT.csv
   */
  async importCategories(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      const result = await syncService.importCategories();

      ctx.body = {
        success: true,
        message: 'Categories imported successfully',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Category import failed', { details: error.message });
    }
  },

  /**
   * Import suppliers from Import.txt (suppliers section)
   */
  async importSuppliers(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      const result = await syncService.importSuppliers();

      ctx.body = {
        success: true,
        message: 'Suppliers imported successfully',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Supplier import failed', { details: error.message });
    }
  },

  /**
   * Test connection to Promidata API
   */
  async testConnection(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      const result = await syncService.testConnection();

      ctx.body = {
        success: true,
        message: 'Connection test successful',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Connection test failed', { details: error.message });
    }
  },

  /**
   * Update missing supplier names for existing parent products
   */
  async updateSupplierNames(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');
      const result = await syncService.updateMissingSupplierNames();

      ctx.body = {
        success: true,
        message: result.message,
        data: result
      };
    } catch (error) {
      ctx.badRequest('Failed to update supplier names', { details: error.message });
    }
  },

  /**
   * Temporary test endpoint to check parent products without supplier names
   */
  async testSupplierNames(ctx: Context) {
    try {
      // Get parent products without supplier names
      const products = await strapi.db.query("api::parent-product.parent-product").findMany({
        where: {
          $or: [
            { supplier_name: { $null: true } },
            { supplier_name: '' }
          ]
        },
        populate: ['supplier'],
        limit: 5
      });

      ctx.body = {
        success: true,
        count: products.length,
        data: products.map(p => ({
          id: p.id,
          sku: p.sku,
          supplier_name: p.supplier_name,
          supplier_code: p.supplier?.code
        }))
      };
    } catch (error) {
      ctx.badRequest('Failed to check supplier names', { details: error.message });
    }
  },

  /**
   * Migrate hardcoded supplier mapping to database
   * Run once after adding display_name and mapping_source fields
   */
  async migrateSupplierMapping(ctx: Context) {
    try {
      const syncService = strapi.service('api::promidata-sync.promidata-sync');

      // Call the migration method we'll add to the service
      const result = await syncService.migrateSupplierMappingToDatabase();

      ctx.body = {
        success: true,
        message: 'Supplier mapping migration completed',
        data: result
      };
    } catch (error) {
      ctx.badRequest('Migration failed', { details: error.message });
    }
  }
};