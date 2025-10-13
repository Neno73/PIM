/**
 * supplier controller
 */

import { factories } from '@strapi/strapi'

export default factories.createCoreController('api::supplier.supplier', ({ strapi }) => ({
  
  /**
   * Sync a specific supplier's products
   */
  async syncSupplier(ctx) {
    try {
      const { id } = ctx.params;
      
      // Get supplier
      const supplier = await strapi.entityService.findOne('api::supplier.supplier', id);
      if (!supplier) {
        return ctx.notFound('Supplier not found');
      }

      // Update status to running
      await strapi.entityService.update('api::supplier.supplier', id, {
        data: {
          last_sync_status: 'running',
          last_sync_message: 'Sync in progress...'
        }
      });

      try {
        // Trigger sync
        const result = await strapi.service('api::promidata-sync.promidata-sync').syncSupplier(supplier);
        
        // Update success status
        const totalProcessed = (result.imported || 0) + (result.updated || 0);
        const efficiency = result.efficiency || '0%';
        await strapi.entityService.update('api::supplier.supplier', id, {
          data: {
            last_sync_date: new Date(),
            last_sync_status: 'completed',
            last_sync_message: `Processed ${totalProcessed}, skipped ${result.skipped || 0} (${efficiency} efficiency)`
          }
        });

        ctx.body = {
          success: true,
          message: 'Sync completed successfully',
          supplier: supplier.code,
          ...result
        };
      } catch (syncError) {
        // Update failure status
        await strapi.entityService.update('api::supplier.supplier', id, {
          data: {
            last_sync_date: new Date(),
            last_sync_status: 'failed',
            last_sync_message: syncError.message
          }
        });
        throw syncError;
      }
    } catch (error) {
      strapi.log.error('Supplier sync failed:', error);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Get sync status for a specific supplier
   */
  async getSyncStatus(ctx) {
    try {
      const { id } = ctx.params;
      
      const supplier = await strapi.entityService.findOne('api::supplier.supplier', id, {
        fields: ['id', 'code', 'name', 'last_sync_date', 'last_sync_status', 'last_sync_message', 'auto_import']
      });

      if (!supplier) {
        return ctx.notFound('Supplier not found');
      }

      ctx.body = {
        supplier: {
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          lastSyncAt: supplier.last_sync_date,
          syncStatus: supplier.last_sync_status || 'never',
          syncMessage: supplier.last_sync_message,
          autoImport: supplier.auto_import,
          isRunning: supplier.last_sync_status === 'running'
        }
      };
    } catch (error) {
      strapi.log.error('Get sync status error:', error);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Quick sync for A23 supplier (for testing) - FORCE UPDATE
   */
  async syncA23(ctx) {
    try {
      // Find A23 supplier
      const suppliers = await strapi.entityService.findMany('api::supplier.supplier', {
        filters: { code: 'A23' }
      });
      
      if (!suppliers || suppliers.length === 0) {
        return ctx.notFound('A23 supplier not found');
      }

      const supplier = suppliers[0];
      
      // First, delete one existing A23 product to test image upload
      strapi.log.info('Deleting first A23 product to test fresh import...');
      const existingProducts = await strapi.entityService.findMany('api::product.product', {
        filters: { supplier: { id: supplier.id } },
        fields: ['id'],
        limit: 1
      });
      
      if (existingProducts.length > 0) {
        await strapi.entityService.delete('api::product.product', existingProducts[0].id);
        strapi.log.info(`Deleted product ${existingProducts[0].id} for fresh import test`);
      }
      
      // Trigger sync
      const result = await strapi.service('api::promidata-sync.promidata-sync').syncSupplier(supplier);
      
      ctx.body = {
        message: 'A23 sync completed successfully with enhanced fields (FORCED UPDATE)',
        supplier: supplier.code,
        enhanced_fields: [
          'images (main + gallery)', 
          'multilingual content', 
          'multiple price tiers',
          'brand, country, customs',
          'color information'
        ],
        deleted_for_test: existingProducts.length > 0,
        ...result
      };
    } catch (error) {
      strapi.log.error('A23 sync failed:', error);
      ctx.throw(500, error.message);
    }
  },

  /**
   * Check what fields were actually collected for A23 products
   */
  async checkA23Products(ctx) {
    try {
      // Find A23 supplier
      const suppliers = await strapi.entityService.findMany('api::supplier.supplier', {
        filters: { code: 'A23' }
      });
      
      if (!suppliers || suppliers.length === 0) {
        return ctx.notFound('A23 supplier not found');
      }

      const supplier = suppliers[0];
      
      // Get latest A23 products
      const products = await strapi.entityService.findMany('api::product.product', {
        filters: { 
          supplier: {
            id: supplier.id
          }
        },
        sort: { id: 'desc' },
        limit: 3,
        populate: ['price_tiers']
      });
      
      if (!products || products.length === 0) {
        ctx.body = { message: 'No A23 products found' };
        return;
      }

      // Analyze first product
      const product = products[0];
      
      ctx.body = {
        message: 'A23 Products Field Check',
        total_products: products.length,
        sample_product: {
          sku: product.sku || 'MISSING',
          sku_supplier: product.sku_supplier || 'MISSING', 
          ean: product.ean || 'MISSING',
          brand: product.brand || 'MISSING',
          country_of_origin: product.country_of_origin || 'MISSING',
          customs_tariff_number: product.customs_tariff_number || 'MISSING',
          main_category: product.main_category || 'MISSING',
          search_color: product.search_color || 'MISSING',
          color_code: product.color_code || 'MISSING',
          price_tiers_count: (product as any).price_tiers ? (product as any).price_tiers.length : 0,
          weight: product.weight || 'MISSING',
          dimension: product.dimension || 'MISSING',
          name_languages: product.name ? Object.keys(product.name) : [],
          description_languages: product.description ? Object.keys(product.description) : [],
          material_languages: product.material ? Object.keys(product.material) : [],
          color_name_languages: product.color_name ? Object.keys(product.color_name) : [],
          has_promidata_hash: !!product.promidata_hash,
          last_synced: product.last_synced || 'MISSING'
        },
        all_product_skus: products.map(p => p.sku),
        field_extraction_summary: {
          basic_fields: '✅ Collected',
          multilingual_content: product.name && Object.keys(product.name).length > 0 ? '✅ Collected' : '❌ Missing',
          brand_info: product.brand ? '✅ Collected' : '❌ Missing',
          color_info: product.search_color || product.color_code ? '✅ Collected' : '❌ Missing',
          pricing: (product as any).price_tiers && (product as any).price_tiers.length > 0 ? '✅ Collected' : '❌ Missing',
          geographic: product.country_of_origin ? '✅ Collected' : '❌ Missing'
        }
      };
    } catch (error) {
      strapi.log.error('Product check failed:', error);
      ctx.throw(500, error.message);
    }
  }
}));
