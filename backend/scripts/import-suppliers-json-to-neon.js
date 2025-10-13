// import-suppliers-json-to-neon.js
// Usage: node backend/scripts/import-suppliers-json-to-neon.js path/to/suppliers.json
// This script imports suppliers from a JSON file into the Neon Postgres DB suppliers table

const fs = require('fs');
const { Client } = require('pg');

// TODO: Fill in your Neon DB connection details
const neonConfig = {
  user: 'YOUR_NEON_USER',
  host: 'YOUR_NEON_HOST',
  database: 'YOUR_NEON_DB',
  password: 'YOUR_NEON_PASSWORD',
  port: 5432,
  ssl: { rejectUnauthorized: false },
};

async function importSuppliers(jsonPath) {
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  if (!Array.isArray(data)) throw new Error('JSON must be an array of suppliers');
  const client = new Client(neonConfig);
  await client.connect();
  for (const supplier of data) {
    try {
      await client.query(
        'INSERT INTO suppliers (code, name) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name',
        [supplier.code, supplier.name]
      );
      console.log(`Imported: ${supplier.code} - ${supplier.name}`);
    } catch (err) {
      console.error(`Failed to import ${supplier.code}:`, err.message);
    }
  }
  await client.end();
}

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node import-suppliers-json-to-neon.js path/to/suppliers.json');
  process.exit(1);
}

importSuppliers(jsonPath).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
