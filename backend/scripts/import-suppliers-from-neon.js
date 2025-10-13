// import-suppliers-from-neon.js
// Usage: node backend/scripts/import-suppliers-from-neon.js
// This script fetches suppliers from a Neon Postgres DB and creates them in Strapi

const { Client } = require('pg');
const strapi = require('../src/strapi'); // Adjust if your Strapi bootstrap is elsewhere

// TODO: Fill in your Neon DB connection details
const neonConfig = {
  user: 'YOUR_NEON_USER',
  host: 'YOUR_NEON_HOST',
  database: 'YOUR_NEON_DB',
  password: 'YOUR_NEON_PASSWORD',
  port: 5432,
  ssl: { rejectUnauthorized: false },
};

async function fetchSuppliersFromNeon() {
  const client = new Client(neonConfig);
  await client.connect();
  // Adjust the query to match your suppliers table/fields
  const res = await client.query('SELECT code, name FROM suppliers');
  await client.end();
  return res.rows;
}

async function createSupplierInStrapi(supplier) {
  // Adjust the content-type name if needed
  return strapi.entityService.create('api::supplier.supplier', {
    data: {
      code: supplier.code,
      name: supplier.name,
    },
  });
}

async function main() {
  await strapi().start();
  const suppliers = await fetchSuppliersFromNeon();
  console.log(`Fetched ${suppliers.length} suppliers from Neon.`);
  for (const supplier of suppliers) {
    try {
      await createSupplierInStrapi(supplier);
      console.log(`Created supplier: ${supplier.code} - ${supplier.name}`);
    } catch (err) {
      console.error(`Failed to create supplier ${supplier.code}:`, err.message);
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
