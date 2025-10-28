export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    console.log('🚀 Bootstrapping application...');

    // Initialize Redis connection
    try {
      const redisService = require('./services/redis.service').default;
      await redisService.connect();
    } catch (error) {
      console.error('⚠️ Failed to connect to Redis (continuing without cache):', error.message);
    }

    console.log('🚀 Setting public permissions...');
    try {
      const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
        where: { type: 'public' },
      });

      if (!publicRole) {
        console.error('❌ Bootstrap Error: Could not find the public role.');
        return;
      }

      console.log(`Found public role with ID: ${publicRole.id}. Proceeding to set permissions.`);

      const permissionsToSet = [
        'api::product.product.find',
        'api::product.product.findOne',
        'api::parent-product.parent-product.find',
        'api::parent-product.parent-product.findOne',
        'api::product-variant.product-variant.find',
        'api::product-variant.product-variant.findOne',
        'api::category.category.find',
        'api::category.category.findOne',
        'api::supplier.supplier.find',
        'api::supplier.supplier.findOne',
        'api::promidata-sync.promidata-sync.startSync',
        'api::promidata-sync.promidata-sync.testConnection',
        'api::promidata-sync.promidata-sync.getSyncStatus',
        'api::promidata-sync.promidata-sync.getSyncHistory',
        'api::promidata-sync.promidata-sync.importCategories',
        'api::promidata-sync.promidata-sync.importSuppliers',
        'api::promidata-sync.promidata-sync.migrateSupplierMapping',
      ];

      for (const action of permissionsToSet) {
        console.log(`- Processing permission: ${action}`);
        try {
          const permission = await strapi.query('plugin::users-permissions.permission').findOne({
            where: { action, role: publicRole.id },
          });

          if (permission) {
            if (!permission.enabled) {
              console.log(`  Permission found, enabling...`);
              await strapi.query('plugin::users-permissions.permission').update({
                where: { id: permission.id },
                data: { enabled: true },
              });
              console.log(`  ✅ Permission enabled.`);
            } else {
              console.log(`  Permission was already enabled.`);
            }
          } else {
            console.log(`  Permission not found, creating...`);
            await strapi.query('plugin::users-permissions.permission').create({
              data: { action, role: publicRole.id, enabled: true },
            });
            console.log(`  ✅ Permission created and enabled.`);
          }
        } catch (err) {
          console.error(`  ❌ Error processing permission ${action}:`, err.message);
        }
      }

      console.log('✅ Bootstrap finished setting public API permissions.');

      // Test supplier name functionality once
      setTimeout(async () => {
        try {
          console.log('🔍 Testing supplier name functionality...');
          const syncService = strapi.service('api::promidata-sync.promidata-sync');

          // Check missing supplier names
          const missingCount = await strapi.db.query("api::parent-product.parent-product").count({
            where: {
              $or: [
                { supplier_name: { $null: true } },
                { supplier_name: '' }
              ]
            }
          });

          console.log(`📊 Found ${missingCount} parent products without supplier names`);

          if (missingCount > 0) {
            console.log('🔧 Running supplier name update...');
            const result = await syncService.updateMissingSupplierNames();
            console.log('✅ Supplier name update result:', result);
          } else {
            console.log('✅ All parent products already have supplier names');
          }
        } catch (error) {
          console.error('❌ Supplier name test failed:', error);
        }
      }, 3000); // Wait 3 seconds after bootstrap

    } catch (error) {
      console.error('❌ An error occurred during the bootstrap process:', error);
    }
  },
};
