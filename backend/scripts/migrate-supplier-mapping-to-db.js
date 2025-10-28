/**
 * Migrate Supplier Mapping to Database
 *
 * This script populates the supplier table with the hardcoded supplier mappings
 * from the promidata-sync service. Run this once after adding display_name and
 * mapping_source fields to the supplier schema.
 *
 * Usage: node backend/scripts/migrate-supplier-mapping-to-db.js
 * Note: Run this while Strapi is running in development mode
 */

const fetch = require('node-fetch');

// Supplier mapping from promidata-sync.ts (lines 286-343)
const supplierMapping = {
  'A23': 'XD Connects (Xindao)',
  'A24': 'Clipper',
  'A30': 'Senator GmbH',
  'A33': 'PF Concept World Source',
  'A34': 'PF Concept',
  'A36': 'Midocean',
  'A37': 'THE PEPPERMINT COMPANY',
  'A38': 'Inspirion GmbH Germany',
  'A42': 'Bic Graphic Europe S.A.',
  'A53': 'Toppoint B.V.',
  'A58': 'Giving Europe BV',
  'A61': 'The Gift Groothandel BV',
  'A73': 'Buttonboss',
  'A81': 'ANDA Western Europe B.V.',
  'A82': 'REFLECTS GmbH',
  'A86': 'Araco International BV',
  'A94': 'New Wave Sportswear BV',
  'A113': 'Malfini',
  'A121': 'MAGNA sweets GmbH',
  'A127': 'Hypon BV',
  'A130': 'PREMO bv',
  'A145': 'Brandcharger BV',
  'A190': 'elasto GmbH & Co. KG',
  'A227': 'Troika Germany GmbH',
  'A233': 'IMPLIVA B.V.',
  'A261': 'Promotion4u',
  'A267': 'Care Concepts BV',
  'A288': 'Paul Stricker, S.A.',
  'A301': 'Clipfactory',
  'A360': 'Bosscher International BV',
  'A371': 'Wisa',
  'A373': 'PowerCubes',
  'A389': 'HMZ FASHIONGROUP B.V.',
  'A390': 'New Wave Sportswear BV Clique',
  'A398': 'Tricorp BV',
  'A403': 'Top Tex Group',
  'A407': 'Commercial Sweets',
  'A420': 'New Wave - Craft',
  'A434': 'FARE - Guenter Fassbender GmbH',
  'A455': 'HMZ Workwear',
  'A461': 'Texet Promo',
  'A467': 'Makito Western Europe',
  'A477': 'HMZ Fashiongroup BV',
  'A480': 'L-SHOP-TEAM GmbH',
  'A510': 'Samdam',
  'A511': 'Linotex GmbH',
  'A521': 'Headwear Professional',
  'A525': 'POLYCLEAN International GmbH',
  'A529': 'MACMA Werbeartikel oHG',
  'A556': 'LoGolf',
  'A558': 'Deonet',
  'A565': 'Premium Square Europe B.V.',
  'A572': 'Prodir BV',
  'A596': 'Arvas B.V.',
  'A616': 'Colorissimo',
  'A618': 'Premiums4Cars',
};

async function main() {
  console.log('🚀 Starting supplier mapping migration...\n');
  console.log('⏳ Connecting to Strapi API at http://localhost:7337...\n');

  const baseUrl = 'http://localhost:7337';

  let created = 0;
  let updated = 0;
  let skipped = 0;

  // First, get all existing suppliers
  try {
    const response = await fetch(`${baseUrl}/api/suppliers?pagination[limit]=200`);
    const result = await response.json();
    const existingSuppliers = result.data || [];
    const existingCodes = new Set(existingSuppliers.map(s => s.code));

    console.log(`📋 Found ${existingSuppliers.length} existing suppliers in database\n`);

    // Process each supplier in the mapping
    for (const [code, displayName] of Object.entries(supplierMapping)) {
      try {
        if (existingCodes.has(code)) {
          // Find the supplier ID
          const supplier = existingSuppliers.find(s => s.code === code);

          // Update via API
          const updateResponse = await fetch(`${baseUrl}/api/suppliers/${supplier.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: {
                display_name: displayName,
                mapping_source: 'promidata',
                name: supplier.name || displayName
              }
            })
          });

          if (updateResponse.ok) {
            console.log(`✅ Updated: ${code} - ${displayName}`);
            updated++;
          } else {
            const error = await updateResponse.text();
            console.error(`❌ Failed to update ${code}: ${error}`);
            skipped++;
          }
        } else {
          // Create new supplier via API
          const createResponse = await fetch(`${baseUrl}/api/suppliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              data: {
                code,
                name: displayName,
                display_name: displayName,
                is_active: true,
                mapping_source: 'promidata'
              }
            })
          });

          if (createResponse.ok) {
            console.log(`✨ Created: ${code} - ${displayName}`);
            created++;
          } else {
            const error = await createResponse.text();
            console.error(`❌ Failed to create ${code}: ${error}`);
            skipped++;
          }
        }
      } catch (error) {
        console.error(`❌ Error processing ${code}:`, error.message);
        skipped++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`  ✨ Created: ${created} suppliers`);
    console.log(`  ✅ Updated: ${updated} suppliers`);
    console.log(`  ❌ Skipped: ${skipped} suppliers`);
    console.log(`  📦 Total: ${Object.keys(supplierMapping).length} suppliers processed\n`);

    // Verify results
    const verifyResponse = await fetch(`${baseUrl}/api/suppliers?filters[mapping_source][$eq]=promidata&pagination[limit]=200`);
    const verifyResult = await verifyResponse.json();
    const promidataCount = verifyResult.meta?.pagination?.total || 0;

    console.log(`🔍 Verification: ${promidataCount} suppliers in database with mapping_source='promidata'\n`);

    console.log('✅ Migration completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('  1. Update promidata-sync service to use database lookup');
    console.log('  2. Remove staticSupplierNames object from service');
    console.log('  3. Test sync operation with database-driven supplier names\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to connect to Strapi API');
    console.error('   Make sure Strapi is running at http://localhost:7337');
    console.error('   Error:', error.message);
    process.exit(1);
  }
}

// Run the migration
main().catch((error) => {
  console.error('❌ Migration failed:', error);
  process.exit(1);
});
