const strapi = require('@strapi/strapi');

async function enablePublicPermissions() {
  const app = await strapi().load();
  
  try {
    // Find the public role
    const publicRole = await strapi.query('plugin::users-permissions.role').findOne({
      where: { type: 'public' }
    });

    if (!publicRole) {
      console.log('❌ Public role not found');
      return;
    }

    console.log('📋 Found public role:', publicRole.id);

    // List of permissions to enable
    const permissionsToEnable = [
      'api::product.product.find',
      'api::product.product.findOne',
      'api::category.category.find', 
      'api::category.category.findOne',
      'api::supplier.supplier.find',
      'api::supplier.supplier.findOne'
    ];

    for (const permission of permissionsToEnable) {
      try {
        // Try to find and update the permission
        const existingPermission = await strapi.query('plugin::users-permissions.permission').findOne({
          where: {
            action: permission,
            role: publicRole.id
          }
        });

        if (existingPermission) {
          await strapi.query('plugin::users-permissions.permission').update({
            where: { id: existingPermission.id },
            data: { enabled: true }
          });
          console.log(`✅ Enabled permission: ${permission}`);
        } else {
          // Create the permission if it doesn't exist
          await strapi.query('plugin::users-permissions.permission').create({
            data: {
              action: permission,
              role: publicRole.id,
              enabled: true
            }
          });
          console.log(`✅ Created and enabled permission: ${permission}`);
        }
      } catch (error) {
        console.log(`❌ Error with permission ${permission}:`, error.message);
      }
    }

    console.log('🎉 All permissions configured successfully!');
    
  } catch (error) {
    console.error('❌ Error configuring permissions:', error);
  }
  
  process.exit(0);
}

enablePublicPermissions();
