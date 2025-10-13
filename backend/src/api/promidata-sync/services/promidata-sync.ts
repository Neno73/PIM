/**
 * Promidata Sync Service
 * Core service for synchronizing products from Promidata API
 */

import { factories } from "@strapi/strapi";
import crypto from "crypto";
import lodash from "lodash"; // Import lodash for deep comparison

// Use node-fetch for API calls
import fetch from "node-fetch";

export default factories.createCoreService(
  "api::promidata-sync.promidata-sync",
  ({ strapi }) => ({
    /**
     * Promidata API configuration
     */
    promidataConfig: {
      baseUrl:
        "https://promi-dl.de/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23",
      endpoints: {
        suppliers: "/Import/Import.txt",
        categories: "/Import/CAT.csv",
        // Products endpoint returns JSON with hash in URL format: file.json|hash
        products: (supplierCode: string) =>
          `/${supplierCode}/${supplierCode}-100804.json`,
        // Individual product data with hash will be parsed from the products response
      },
    },

    /**
     * Extract first SKU value from DefaultProducts object
     * Transforms {"EURO": "A113-1000008"} -> "A113-1000008"
     */
    extractFirstSkuFromDefaultProducts(defaultProducts) {
      // If it's already a string, return as is
      if (typeof defaultProducts === 'string') {
        return defaultProducts;
      }

      // If it's an object, extract the first SKU value from any region
      if (typeof defaultProducts === 'object' && defaultProducts !== null) {
        const values = Object.values(defaultProducts);
        if (values.length > 0) {
          return values[0] as string;
        }
      }

      // Return empty string if nothing found
      return '';
    },

    /**
     * Extract field value with language priority (en -> nl -> others)
     * Returns multilingual object with all available languages
     */
    extractFieldWithLanguagePriority(productData, fieldPath, fallbackValue = '') {
      if (!productData) return { en: fallbackValue };

      const languagePriority = ['en', 'nl'];
      const result = {};
      let primaryValue = fallbackValue;

      // Try to get from UnstructuredInformation first (usually language-independent)
      if (productData.UnstructuredInformation) {
        const unstructuredValue = this.getNestedValue(productData.UnstructuredInformation, fieldPath);
        if (unstructuredValue) {
          primaryValue = unstructuredValue;
        }
      }

      // Try to get from NonLanguageDependedProductDetails
      if (!primaryValue && productData.NonLanguageDependedProductDetails) {
        const nonLangValue = this.getNestedValue(productData.NonLanguageDependedProductDetails, fieldPath);
        if (nonLangValue) {
          primaryValue = nonLangValue;
        }
      }

      // Try language-specific data with priority
      if (productData.ProductDetails) {
        // First try priority languages in order
        for (const lang of languagePriority) {
          if (productData.ProductDetails[lang]) {
            const langValue = this.getNestedValue(productData.ProductDetails[lang], fieldPath);
            if (langValue) {
              result[lang] = langValue;
              if (!primaryValue) primaryValue = langValue;
            }
          }
        }

        // Then try all other available languages
        const remainingLangs = Object.keys(productData.ProductDetails).filter(lang => !languagePriority.includes(lang));
        for (const lang of remainingLangs) {
          if (productData.ProductDetails[lang]) {
            const langValue = this.getNestedValue(productData.ProductDetails[lang], fieldPath);
            if (langValue) {
              result[lang] = langValue;
              if (!primaryValue) primaryValue = langValue;
            }
          }
        }
      }

      // If we have language-specific data, return it; otherwise return primary value in English
      if (Object.keys(result).length > 0) {
        return result;
      } else {
        return { en: primaryValue || fallbackValue };
      }
    },

    /**
     * Helper to get nested value from object using dot notation
     */
    getNestedValue(obj, path) {
      if (!obj || !path) return null;
      return path.split('.').reduce((current, key) => current?.[key], obj);
    },

    /**
     * Clean HTML from description text while preserving structure
     * Converts HTML breaks and formatting to clean text with proper line breaks
     */
    cleanHtmlFromDescription(htmlText: string): string {
      if (!htmlText || typeof htmlText !== 'string') {
        return '';
      }

      return htmlText
        // Replace <br />, <br/>, <br> with newlines
        .replace(/<br\s*\/?>/gi, '\n')
        // Replace double line breaks with double newlines (paragraph breaks)
        .replace(/\n\s*\n/g, '\n\n')
        // Remove any other HTML tags but keep the content
        .replace(/<[^>]*>/g, '')
        // Decode HTML entities
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        // Clean up extra whitespace but preserve intentional formatting
        .replace(/[ \t]+/g, ' ') // Multiple spaces/tabs to single space
        .replace(/\n[ \t]+/g, '\n') // Remove spaces after newlines
        .replace(/[ \t]+\n/g, '\n') // Remove spaces before newlines
        // Clean up multiple consecutive newlines (max 2)
        .replace(/\n{3,}/g, '\n\n')
        // Trim overall text
        .trim();
    },

    /**
     * Extract color code for grouping variants by color
     * Handles different SKU patterns for different suppliers
     */
    extractColorCodeForGrouping(childProd, parentProductSku) {
      // First try to get from SupplierColorCode (works for A113)
      const supplierColorCode = childProd.UnstructuredInformation?.SupplierColorCode ||
                                childProd.ProductDetails?.en?.UnstructuredInformation?.SupplierColorCode;

      if (supplierColorCode) {
        return supplierColorCode;
      }

      // For A461 pattern: A461-131562-990-4 → extract "990" as color
      if (parentProductSku && parentProductSku.startsWith('A461')) {
        const sku = childProd.Sku || '';
        // Pattern: A461-XXXXX-CCC-S where CCC is color, S is size
        const match = sku.match(/^A461-\d+-(\d+)-\d+$/);
        if (match && match[1]) {
          return match[1]; // Return the color part (e.g., "990")
        }
      }

      // Fallback: try to extract from ConfigurationFields
      if (childProd.ProductDetails) {
        for (const lang of ['en', 'nl']) {
          const configFields = childProd.ProductDetails[lang]?.ConfigurationFields;
          if (configFields) {
            const colorField = configFields.find(f =>
              /color|kleur|couleur|colour/i.test(f.ConfigurationNameTranslated || f.ConfigurationName || '')
            );
            if (colorField?.ConfigurationValue) {
              return colorField.ConfigurationValue;
            }
          }
        }
      }

      return 'unknown';
    },

    /**
     * Fetch suppliers list from Promidata
     */
    async fetchSuppliersFromPromidata() {
      // Extract unique supplier codes from product URLs in Import.txt
      try {
        const importUrl =
          "https://promidatabase.s3.eu-central-1.amazonaws.com/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23/Import/Import.txt";
        const response = await fetch(importUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch Import.txt: ${response.statusText}`);
        }

        const text = await response.text();
        const lines = text.split("\n").filter((line) => line.trim());
        const supplierCodes = new Set();

        for (const line of lines) {
          // Skip category file lines
          if (line.includes("CAT.csv")) continue;
          // Extract supplier code from URL: .../A23/A23-100804.json|HASH
          const match = line.match(/\/([A-Z0-9]+)\//);
          if (match && match[1]) {
            supplierCodes.add(match[1]);
          }
        }

        // Create suppliers in Strapi if they don't exist
        const suppliers = [];
        for (const code of supplierCodes) {
          const codeStr = code.toString();

          // Check if supplier exists
          const existing = await strapi.entityService.findMany(
            "api::supplier.supplier",
            { filters: { code: codeStr } }
          );

          let supplier;
          if (existing.length > 0) {
            supplier = existing[0];
            // If existing supplier has placeholder name, try to get real name
            if (supplier.name === `Supplier ${codeStr}`) {
              try {
                const realName = await this.fetchSupplierRealName(codeStr);
                if (realName) {
                  supplier = await strapi.entityService.update(
                    "api::supplier.supplier",
                    supplier.id,
                    { data: { name: realName } }
                  );
                  strapi.log.info(`Updated supplier ${codeStr} name to: ${realName}`);
                }
              } catch (error) {
                strapi.log.warn(`Failed to fetch real name for supplier ${codeStr}:`, error.message);
              }
            }
          } else {
            // Try to get real supplier name
            let supplierName = `Supplier ${codeStr}`; // fallback
            try {
              const realName = await this.fetchSupplierRealName(codeStr);
              if (realName) {
                supplierName = realName;
                strapi.log.info(`Found real name for supplier ${codeStr}: ${realName}`);
              }
            } catch (error) {
              strapi.log.warn(`Failed to fetch real name for supplier ${codeStr}, using placeholder:`, error.message);
            }

            // Create supplier with real name or placeholder
            supplier = await strapi.entityService.create(
              "api::supplier.supplier",
              { data: { code: codeStr, name: supplierName, is_active: true, auto_import: true } }
            );
          }
          suppliers.push(supplier);
        }
        strapi.log.info(`Fetched/created ${suppliers.length} suppliers from Promidata product URLs`);
        return suppliers;
      } catch (error) {
        strapi.log.error("Failed to fetch suppliers from Promidata:", error);
        throw error;
      }
    },

    /**
     * Static supplier names as fallback (from original project)
     */
    staticSupplierNames: {
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
    },

    /**
     * Fetch real supplier name from Promidata API with static fallback
     */
    async fetchSupplierRealName(supplierCode: string): Promise<string | null> {
      try {
        // First try to get supplier name from Promidata API
        const productUrlsWithHashes = await this.parseProductUrlsWithHashes(supplierCode);

        if (productUrlsWithHashes.length > 0) {
          // Use the first product to get supplier name
          const firstProductUrl = productUrlsWithHashes[0];
          const response = await fetch(firstProductUrl.url);

          if (response.ok) {
            const productData = await response.json();
            const supplierName = productData.UnstructuredInformation?.SupplierNameToShow;

            if (supplierName && supplierName.trim() !== '') {
              strapi.log.info(`Found supplier name from API for ${supplierCode}: ${supplierName.trim()}`);
              return supplierName.trim();
            }
          }
        }

        // If no name from API, try static fallback
        if (this.staticSupplierNames[supplierCode]) {
          strapi.log.info(`Using static fallback name for ${supplierCode}: ${this.staticSupplierNames[supplierCode]}`);
          return this.staticSupplierNames[supplierCode];
        }

        return null;
      } catch (error) {
        strapi.log.error(`Failed to fetch real name for supplier ${supplierCode}:`, error);

        // On error, still try static fallback
        if (this.staticSupplierNames[supplierCode]) {
          strapi.log.info(`Using static fallback name after error for ${supplierCode}: ${this.staticSupplierNames[supplierCode]}`);
          return this.staticSupplierNames[supplierCode];
        }

        return null;
      }
    },

    /**
     * Fetch categories from CAT.csv
     */
    async fetchCategoriesFromPromidata() {
      try {
        // First, get the categories URL from the first line of Import.txt
        const suppliersResponse = await fetch(
          `${this.promidataConfig.baseUrl}${this.promidataConfig.endpoints.suppliers}`
        );
        if (!suppliersResponse.ok) {
          throw new Error(`Failed to fetch suppliers list: ${suppliersResponse.statusText}`);
        }

        const suppliersText = await suppliersResponse.text();
        const supplierLines = suppliersText.split('\n').filter(line => line.trim());

        if (supplierLines.length === 0) {
          throw new Error('No lines found in suppliers file');
        }

        // First line contains the categories URL
        const categoriesUrl = supplierLines[0].trim();

        // Now fetch the categories from the discovered URL
        const response = await fetch(categoriesUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch categories: ${response.statusText}`);
        }

        const text = await response.text();
        const csvLines = text.split("\n").filter((line) => line.trim());
        const categories = [];

        for (let i = 1; i < csvLines.length; i++) {
          // Skip header
          const [code, name, parentCode] = csvLines[i].split(";");
          if (code && name) {
            categories.push({
              code: code.trim(),
              name: { en: name.trim() }, // Wrap name in JSON for multilingual support
              parent_code: parentCode?.trim() || null,
            });
          }
        }

        strapi.log.info(
          `Fetched ${categories.length} categories from Promidata`
        );
        return categories;
      } catch (error) {
        strapi.log.error("Failed to fetch categories from Promidata:", error);
        throw error;
      }
    },

    /**
     * Parse product URLs with hashes from Promidata Import.txt for a specific supplier
     * Expected format in Import.txt: URLs like "https://promi-dl.de/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23/A23/A23-100804.json|751159B8B70A7230BA6701227C1C5C63F9F2D108"
     */
    async parseProductUrlsWithHashes(
      supplierCode: string
    ): Promise<Array<{ url: string; hash: string }>> {
      try {
        // Get the complete Import.txt file that contains all product URLs with hashes
        const importUrl =
          "https://promidatabase.s3.eu-central-1.amazonaws.com/Profiles/Live/849c892e-b443-4f49-be3a-61a351cbdd23/Import/Import.txt";
        const response = await fetch(importUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch Import.txt: ${response.statusText}`);
        }

        const text = await response.text();
        const productUrlsWithHashes = [];

        // Parse the response and filter for the specific supplier
        const productLines = text.split("\n").filter((line) => line.trim());

        for (const line of productLines) {
          // Skip the CAT.csv line and only process product lines
          if (line.includes("CAT.csv")) {
            continue;
          }

          if (line.includes("|") && line.includes(`/${supplierCode}/`)) {
            const [fullUrlPart, hash] = line.split("|");
            if (fullUrlPart && hash) {
              // The fullUrlPart already contains the complete URL, just clean it
              const cleanUrl = fullUrlPart.trim();
              productUrlsWithHashes.push({
                url: cleanUrl,
                hash: hash.trim(),
              });
            }
          }
        }

        strapi.log.info(
          `Found ${productUrlsWithHashes.length} product URLs with hashes for supplier ${supplierCode}`
        );
        return productUrlsWithHashes;
      } catch (error) {
        strapi.log.error(
          `Failed to parse product URLs for supplier ${supplierCode}:`,
          error
        );
        return [];
      }
    },

    /**
     * Fetch individual product data from clean URL (without hash)
     */
    async fetchProductData(productUrl: string): Promise<any> {
      try {
        const response = await fetch(productUrl);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch product from ${productUrl}: ${response.statusText}`
          );
        }

        return await response.json();
      } catch (error) {
        strapi.log.error(
          `Failed to fetch product data from ${productUrl}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Fetch products for a supplier
     */
    async fetchProductsFromPromidata(supplierCode: string) {
      try {
        const response = await fetch(
          `${this.promidataConfig.baseUrl}${this.promidataConfig.endpoints.products(supplierCode)}`
        );
        if (!response.ok) {
          if (response.status === 404) {
            return []; // No products for this supplier
          }
          throw new Error(
            `Failed to fetch products for ${supplierCode}: ${response.statusText}`
          );
        }

        const jsonData = (await response.json()) as any;

        // Handle different JSON structures
        let products = [];
        if (Array.isArray(jsonData)) {
          products = jsonData;
        } else if (jsonData.products && Array.isArray(jsonData.products)) {
          products = jsonData.products;
        } else if (jsonData.data && Array.isArray(jsonData.data)) {
          products = jsonData.data;
        } else if (typeof jsonData === "object") {
          // If it's an object with product properties, convert to array
          products = Object.values(jsonData).filter(
            (item) => typeof item === "object" && item !== null
          );
        }

        // Log first product structure for debugging
        if (products.length > 0) {
          strapi.log.info(
            `First product keys: ${Object.keys(products[0]).join(", ")}`
          );
        }

        strapi.log.info(
          `Fetched ${products.length} products for supplier ${supplierCode}`
        );
        return products;
      } catch (error) {
        strapi.log.error(
          `Failed to fetch products for supplier ${supplierCode}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Import categories into Strapi
     */
    async importCategories() {
      try {
        const categories = await this.fetchCategoriesFromPromidata();
        const imported = [];
        const errors = [];

        // Create categories in hierarchy order (parents first)
        const categoriesByParent = new Map();
        categories.forEach((cat) => {
          const parentCode = cat.parent_code || "root";
          if (!categoriesByParent.has(parentCode)) {
            categoriesByParent.set(parentCode, []);
          }
          categoriesByParent.get(parentCode).push(cat);
        });

        // Import root categories first
        if (categoriesByParent.has("root")) {
          for (const category of categoriesByParent.get("root")) {
            try {
              await this.createOrUpdateCategory(category);
              imported.push(category.code);
            } catch (error) {
              errors.push({ category: category.code, error: error.message });
            }
          }
        }

        // Then import child categories
        for (const [parentCode, children] of categoriesByParent) {
          if (parentCode === "root") continue;

          for (const category of children) {
            try {
              await this.createOrUpdateCategory(category);
              imported.push(category.code);
            } catch (error) {
              errors.push({ category: category.code, error: error.message });
            }
          }
        }

        return {
          total: categories.length,
          imported: imported.length,
          errors: errors.length,
          errorDetails: errors,
        };
      } catch (error) {
        strapi.log.error("Category import failed:", error);
        throw error;
      }
    },

    /**
     * Import suppliers into Strapi
     */
    async importSuppliers() {
      try {
        // fetchSuppliersFromPromidata already creates/updates suppliers in Strapi
        // So we just need to call it and return the results
        const suppliers = await this.fetchSuppliersFromPromidata();

        strapi.log.info(`Fetched/created ${suppliers.length} suppliers from Promidata`);

        return {
          total: suppliers.length,
          imported: suppliers.length,
          errors: 0,
          errorDetails: [],
          suppliers: suppliers.map(s => ({ code: s.code, name: s.name, id: s.id }))
        };
      } catch (error) {
        strapi.log.error("Supplier import failed:", error);
        throw error;
      }
    },

    /**
     * Create or update a category
     */
    async createOrUpdateCategory(categoryData: any) {
      try {
        // Check if category exists
        const existing = await strapi.entityService.findMany(
          "api::category.category",
          {
            filters: { code: categoryData.code },
          }
        );

        const data: { code: string; name: any; parent?: number | string } = {
          code: categoryData.code,
          name: categoryData.name,
          // Handle parent relation separately
        };

        if (categoryData.parent_code) {
          const parentCategory = await strapi.entityService.findMany(
            "api::category.category",
            {
              filters: { code: categoryData.parent_code },
            }
          );
          if (parentCategory.length > 0) {
            data.parent = parentCategory[0].id; // Link by ID
          }
        }

        if (existing.length > 0) {
          // Update existing
          return await strapi.entityService.update(
            "api::category.category",
            existing[0].id,
            { data }
          );
        } else {
          // Create new
          return await strapi.entityService.create("api::category.category", {
            data,
          });
        }
      } catch (error) {
        strapi.log.error(
          `Failed to create/update category ${categoryData.code}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Create or update a supplier
     */
    async createOrUpdateSupplier(supplierData: any) {
      try {
        // Check if supplier exists
        const existing = await strapi.entityService.findMany(
          "api::supplier.supplier",
          {
            filters: { code: supplierData.code },
          }
        );

        const data = {
          code: supplierData.code,
          name: supplierData.name || supplierData.code,
        };

        if (existing.length > 0) {
          // Update existing
          return await strapi.entityService.update(
            "api::supplier.supplier",
            existing[0].id,
            { data }
          );
        } else {
          // Create new
          return await strapi.entityService.create("api::supplier.supplier", {
            data,
          });
        }
      } catch (error) {
        strapi.log.error(
          `Failed to create/update supplier ${supplierData.code}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Start sync process
     */
    async startSync(supplierId?: string) {
      try {
        const suppliers = supplierId
          ? await strapi.entityService.findMany("api::supplier.supplier", {
              filters: { id: supplierId, is_active: true },
            })
          : await strapi.entityService.findMany("api::supplier.supplier", {
              filters: { is_active: true, auto_import: true },
            });

        const results = [];

        for (const supplier of suppliers) {
          try {
            const result = await this.syncSupplier(supplier);
            results.push({
              supplier: supplier.code,
              success: true,
              ...result,
            });
          } catch (error) {
            results.push({
              supplier: supplier.code,
              success: false,
              error: error.message,
            });
          }
        }

        return {
          suppliersProcessed: suppliers.length,
          results,
        };
      } catch (error) {
        strapi.log.error("Sync process failed:", error);
        throw error;
      }
    },

    /**
     * Create or update a Parent Product with hash tracking
     */
    async createOrUpdateParentProduct(
      parentProductData: any,
      supplier: any,
      hash: string,
      url?: string
    ) {
      try {
        // Log the full parentProductData for debugging
        // strapi.log.info('parentProductData received:', JSON.stringify(parentProductData, null, 2));
        const productCode = this.extractProductCode(parentProductData, supplier, url);
        if (!productCode) {
          throw new Error("No valid parent product code found");
        }

        // Log the raw parentProductData before any processing for debugging CustomsTariffNumber
        // strapi.log.info('Raw parentProductData for CustomsTariffNumber check:', JSON.stringify(parentProductData, null, 2));

        // --- FINAL PRODUCT SCHEMA: 12 fields ---
        // Robust extraction for physical properties
        const nonLang = parentProductData.NonLanguageDependedProductDetails || {};
        const fallback = (a, b, c) => a !== undefined && a !== null ? a : (b !== undefined && b !== null ? b : c);
        // Get supplier name based on a_number lookup
        const getSupplierNameByANumber = async (aNumber: string) => {
          if (!aNumber) return "";
          try {
            const matchingSupplier = await strapi.entityService.findMany(
              "api::supplier.supplier",
              { filters: { code: aNumber } }
            );
            return matchingSupplier.length > 0 ? matchingSupplier[0].name : "";
          } catch (error) {
            strapi.log.warn(`Failed to lookup supplier by a_number ${aNumber}:`, error.message);
            return "";
          }
        };

        const aNumber = parentProductData.ANumber || "";
        const supplierNameFromLookup = await getSupplierNameByANumber(aNumber);

        const parentData = {
          sku: parentProductData.Sku || productCode || "",
          a_number: aNumber,
          supplier_sku: parentProductData.SupplierSku || "",
          supplier_name: supplierNameFromLookup || parentProductData.UnstructuredInformation?.SupplierNameToShow || "",
          brand: nonLang.Brand || "",
          category: nonLang.Category || "",
          default_products: (() => {
            const originalDefaultProducts = parentProductData.DefaultProducts || "";
            strapi.log.info(`[DEBUG] Original DefaultProducts: ${JSON.stringify(originalDefaultProducts)}`);
            const extractedSku = this.extractFirstSkuFromDefaultProducts(originalDefaultProducts);
            strapi.log.info(`[DEBUG] Extracted SKU: ${JSON.stringify(extractedSku)}`);
            return extractedSku;
          })(),
          total_variants_count: Array.isArray(parentProductData.ChildProducts) ? parentProductData.ChildProducts.length : 0,
          promidata_hash: hash || "",
          customs_tariff_number: nonLang.CustomsTariffNumber || "",
          battery_information: (() => {
            const rawValue = parentProductData.BatteryInformation;
            if (typeof rawValue === 'string') {
              // If it's a string like '""' or '"value"', extract the inner value
              const trimmed = rawValue.trim();
              if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) {
                return trimmed.slice(1, -1); // Remove surrounding quotes
              }
              return rawValue;
            }
            if (Array.isArray(rawValue)) {
              // If it's an array like ["FSC"], join the values
              return rawValue.join(', ');
            }
            return rawValue ? JSON.stringify(rawValue) : "";
          })(),
          required_certificates: (() => {
            const rawValue = parentProductData.RequiredCertificates;
            if (typeof rawValue === 'string') {
              // If it's a string like '""' or '"value"', extract the inner value
              const trimmed = rawValue.trim();
              if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) {
                return trimmed.slice(1, -1); // Remove surrounding quotes
              }
              return rawValue;
            }
            if (Array.isArray(rawValue)) {
              // If it's an array like ["FSC"], join the values
              return rawValue.join(', ');
            }
            return rawValue ? JSON.stringify(rawValue) : "";
          })(),
          supplier: supplier.id,
          last_synced: new Date().toISOString(),
          // Physical properties
          weight: fallback(nonLang.Weight, parentProductData.Weight, null),
          dimensions_length: fallback(nonLang.DimensionsLength, parentProductData.DimensionsLength, null),
          dimensions_height: fallback(nonLang.DimensionsHeight, parentProductData.DimensionsHeight, null),
          dimensions_width: fallback(nonLang.DimensionsWidth, parentProductData.DimensionsWidth, null),
          dimensions_depth: fallback(nonLang.DimensionsDepth, parentProductData.DimensionsDepth, null),
          dimensions_diameter: fallback(nonLang.DimensionsDiameter, parentProductData.DimensionsDiameter, null),
        };

        strapi.log.info(`Extracted CustomsTariffNumber: ${parentData.customs_tariff_number}`);

        // Check if parent product exists
        const existingParentProduct = await strapi.entityService.findMany(
          "api::parent-product.parent-product",
          {
            filters: {
              sku: parentData.sku,
            },
          }
        );

        let parentProduct;
        let created = false;

        if (existingParentProduct.length > 0) {
          parentProduct = await strapi.entityService.update(
            "api::parent-product.parent-product",
            existingParentProduct[0].id,
            { data: parentData }
          );
        } else {
          parentProduct = await strapi.entityService.create(
            "api::parent-product.parent-product",
            { data: parentData }
          );
          created = true;
        }

        // --- DUPLICATE TO api::product.product ---
        const existingProduct = await strapi.entityService.findMany(
          "api::product.product",
          {
            filters: {
              sku: parentData.sku,
            },
          }
        );
        // Extract name and description with language priority
        const productName = this.extractFieldWithLanguagePriority(
          parentProductData,
          'SupplierNameToShow',
          parentProductData.NonLanguageDependedProductDetails?.Brand || parentData.sku || "Unnamed Product"
        );

        const productDescription = this.extractFieldWithLanguagePriority(
          parentProductData,
          'Description',
          ''
        );

        const productData: any = {
          sku: parentData.sku,
          name: productName,
          brand: parentData.brand,
          customs_tariff_number: parentData.customs_tariff_number,
          promidata_hash: parentData.promidata_hash,
          last_synced: parentData.last_synced,
          is_active: true, // Assuming active by default
          parent_product_ref: parentProduct.id,
          // Initialize other JSON fields to empty objects if they are required and not directly mapped
          description: productDescription,
          color_name: {},
          model_name: {},
          customization: {},
          refining: {},
          refining_dimensions: {},
          refining_location: {},
          material: {},
          // New fields from Parent Product Schema
          a_number: parentData.a_number,
          supplier_sku: parentData.supplier_sku,
          supplier_name: parentData.supplier_name,
          category: parentData.category,
          default_products: parentData.default_products,
          total_variants_count: parentData.total_variants_count,
          battery_information: parentData.battery_information,
          required_certificates: parentData.required_certificates,
          // Potentially map other fields like article_number, sku_supplier, ean, weight if they exist and are relevant
          article_number: parentData.a_number || null,
          sku_supplier: parentData.supplier_sku || null,
          weight: parentProductData.NonLanguageDependedProductDetails?.Weight || null,
          // For category, it needs to be a relation, not a string. This will require fetching category ID.
          // For now, I'll omit categories to avoid the JSON error, we can add it back with proper relation handling later.
        };

        // Log the productData being sent to api::product.product
        // strapi.log.info(`ProductData for api::product.product: ${JSON.stringify(productData, null, 2)}`);

        if (existingProduct.length > 0) {
          await strapi.entityService.update(
            "api::product.product",
            existingProduct[0].id,
            { data: productData }
          );
        } else {
          await strapi.entityService.create(
            "api::product.product",
            { data: productData }
          );
        }
        // --- END DUPLICATE ---

        return { parentProduct, created };
      } catch (error) {
        console.error(
          `Failed to create/update parent product ${this.extractProductCode(parentProductData, supplier, url)}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Create or update a Product Variant
     */
  /**
   * Create or update a Product Variant
   * For A73 supplier: collect embroidery_sizes from BOR* SKUs and assign to BLSales variant
   */
  async createOrUpdateProductVariant(
      childProductData: any,
      parentProductId: number,
  parentProductSku: string,
      supplier: any,
      parentNonLanguageDependedDetails: any // New parameter for physical properties
    ) {
      let variantSku: string | null = null; // Declare variantSku here
      // --- Service variant logic for A73 embroidery_sizes ---
      let embroiderySizesForColor = [];
      let isA73 = parentProductSku && parentProductSku.startsWith('A73');
      let isBLSales = false;
      let isBOR = false;
      let colorGroupKey = null;
      if (isA73) {
        // Use SupplierColorCode or fallback to color
        colorGroupKey = childProductData.UnstructuredInformation?.SupplierColorCode || childProductData.ProductDetails?.en?.UnstructuredInformation?.SupplierColorCode || childProductData.ProductDetails?.en?.ConfigurationFields?.find(f => /color|kleur|couleur|colour/i.test(f.ConfigurationNameTranslated || f.ConfigurationName || ''))?.ConfigurationValue || null;
        isBLSales = /BLSales$/i.test(variantSku || '');
        isBOR = /BOR/i.test(variantSku || '');
      }
      let countryOfOrigin: string | null = null;
      let productionTime: string | null = null;
      try {
        variantSku = this.extractVariantSku(childProductData, parentProductSku);
        if (!variantSku) {
          strapi.log.error("No valid product variant SKU found for child product:", childProductData);
          throw new Error("No valid product variant SKU found");
        }

        // For A73, collect embroidery sizes for each color group
        if (isA73 && isBOR && colorGroupKey) {
          // Extract embroidery size from SKU (e.g. BOR6X4 → 6X4)
          const match = (variantSku || '').match(/BOR(\w+)/i);
          if (match && match[1]) {
            // Store embroidery size in a global map for this sync run
            if (!this._a73EmbroiderySizes) this._a73EmbroiderySizes = {};
            if (!this._a73EmbroiderySizes[colorGroupKey]) this._a73EmbroiderySizes[colorGroupKey] = [];
            this._a73EmbroiderySizes[colorGroupKey].push(match[1]);
          }
        }

        // Check if product variant exists
        const existingVariant = await strapi.entityService.findMany(
          "api::product-variant.product-variant",
          {
            filters: {
              sku: variantSku,
              parent_product: { id: parentProductId },
            },
          }
        );

        // Extract multilingual and component fields for Product Variant
        const nameJson: any = {};
        const descriptionJson: any = {};
        const shortDescriptionJson: any = {};
        const metaNameJson: any = {};
        const metaDescriptionJson: any = {};
        const metaKeywordsJson: any = {};
        const materialJson: any = {};

        let primaryImageUrl = null;
        let primaryImageFileName = null;
        const galleryImageUrls = [];
        const galleryImageFileNames = [];
        const informationFileUrls = [];

        // Try all languages for webshopInformation and material
        let webshopInformation = null;
        if (childProductData.ProductDetails) {
          for (const langKey of Object.keys(childProductData.ProductDetails)) {
            const langDetails = childProductData.ProductDetails[langKey];
            if (langDetails) {
              if (langDetails.Name) nameJson[langKey] = langDetails.Name;
              if (langDetails.Description) descriptionJson[langKey] = langDetails.Description;
              if (langDetails.ShortDescription) shortDescriptionJson[langKey] = langDetails.ShortDescription;
              if (langDetails.MetaName) metaNameJson[langKey] = langDetails.MetaName;
              if (langDetails.MetaDescription) metaDescriptionJson[langKey] = langDetails.MetaDescription;
              if (langDetails.MetaKeywords) metaKeywordsJson[langKey] = langDetails.MetaKeywords;
              if (langDetails.WebShopInformation?.Material?.InformationValue) {
                materialJson[langKey] = langDetails.WebShopInformation.Material.InformationValue;
              }
              // Correct paths for country_of_origin and production_time
              if (langDetails.WebShopInformation?.CountryOfOrigin?.InformationValue) {
                countryOfOrigin = langDetails.WebShopInformation.CountryOfOrigin.InformationValue;
              }
              if (langDetails.WebShopInformation?.ProductionTimeInformationText?.InformationValue) {
                productionTime = langDetails.WebShopInformation.ProductionTimeInformationText.InformationValue;
              }
              if (!webshopInformation && langDetails.WebShopInformation) {
                webshopInformation = langDetails.WebShopInformation;
              }
              // Image URLs (primary and gallery) - assuming primary image is also language-dependent
              if (langDetails.Image?.Url && !primaryImageUrl) {
                primaryImageUrl = langDetails.Image.Url; // Take the first primary image found
                primaryImageFileName = langDetails.Image?.FileName || null; // Get original filename
              }
              if (langDetails.MediaGalleryImages) {
                langDetails.MediaGalleryImages.forEach((img: any) => {
                  if (img.Url) {
                    galleryImageUrls.push(img.Url);
                    galleryImageFileNames.push(img.FileName || null);
                  }
                });
              }
              if (langDetails.InformationFiles) {
                langDetails.InformationFiles.forEach((file: any) => {
                  if (file.Url) informationFileUrls.push(file.Url);
                });
              }
            }
          }
        }

        // Robust fallback logic for color and size with language priority: en -> nl -> others
        let color = null;
        let size = null;

        // Define language priority order
        const languagePriority = ['en', 'nl'];

        if (childProductData.ProductDetails) {
          // First try priority languages in order
          for (const lang of languagePriority) {
            if (childProductData.ProductDetails[lang]?.ConfigurationFields) {
              const parsed = this.parseConfigurationFields(childProductData.ProductDetails[lang].ConfigurationFields, lang);
              if (parsed.color && !color) color = parsed.color;
              if (parsed.size && !size) size = parsed.size;
              if (color && size) break;
            }
          }

          // If still missing data, try all other available languages
          if (!color || !size) {
            const remainingLangs = Object.keys(childProductData.ProductDetails).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails[lang]?.ConfigurationFields) {
                const parsed = this.parseConfigurationFields(childProductData.ProductDetails[lang].ConfigurationFields, lang);
                if (parsed.color && !color) color = parsed.color;
                if (parsed.size && !size) size = parsed.size;
                if (color && size) break;
              }
            }
          }
        }
        // Fallbacks for color
        color = color
          || childProductData.UnstructuredInformation?.SupplierColorName
          || childProductData.UnstructuredInformation?.SupplierSearchColor
          || childProductData.NonLanguageDependedProductDetails?.SearchColor
          || childProductData.NonLanguageDependedProductDetails?.SupplierColorName
          || childProductData.NonLanguageDependedProductDetails?.Color
          || childProductData.ProductDetails?.en?.UnstructuredInformation?.SupplierColorName
          || childProductData.ProductDetails?.en?.UnstructuredInformation?.SupplierSearchColor
          || null;
        // Fallbacks for size
        size = size
          || childProductData.UnstructuredInformation?.SupplierSize
          || childProductData.NonLanguageDependedProductDetails?.Size
          || childProductData.ProductDetails?.en?.UnstructuredInformation?.SupplierSize
          || null;

        // Robust fallback for supplier_search_color
        let supplierSearchColor =
          childProductData.UnstructuredInformation?.SupplierSearchColor
          || childProductData.NonLanguageDependedProductDetails?.SearchColor
          || childProductData.ProductDetails?.en?.UnstructuredInformation?.SupplierSearchColor
          || color
          || null;

        // Robust fallback for supplier_color_code

        // Robust fallback for hex_color
        let hexColor =
          childProductData.UnstructuredInformation?.HexColor
          || childProductData.NonLanguageDependedProductDetails?.HexColor
          || childProductData.ProductDetails?.en?.UnstructuredInformation?.HexColor
          || null;

        // Debug physical dimensions extraction - using same source as Brand
        strapi.log.info(`[DIMENSIONS DEBUG] Processing variant ${variantSku}:`);
        strapi.log.info(`  Parent Weight (Brand source): ${parentNonLanguageDependedDetails?.Weight}`);
        strapi.log.info(`  Child Weight: ${childProductData.NonLanguageDependedProductDetails?.Weight}`);
        strapi.log.info(`  Parent Length (Brand source): ${parentNonLanguageDependedDetails?.DimensionsLength}`);
        strapi.log.info(`  Child Length: ${childProductData.NonLanguageDependedProductDetails?.DimensionsLength}`);
        strapi.log.info(`  Parent Height (Brand source): ${parentNonLanguageDependedDetails?.DimensionsHeight}`);
        strapi.log.info(`  Child Height: ${childProductData.NonLanguageDependedProductDetails?.DimensionsHeight}`);
        strapi.log.info(`  Parent Diameter (Brand source): ${parentNonLanguageDependedDetails?.DimensionsDiameter}`);
        strapi.log.info(`  Child Diameter: ${childProductData.NonLanguageDependedProductDetails?.DimensionsDiameter}`);
        strapi.log.info(`  Parent Width (Brand source): ${parentNonLanguageDependedDetails?.DimensionsWidth}`);
        strapi.log.info(`  Child Width: ${childProductData.NonLanguageDependedProductDetails?.DimensionsWidth}`);
        strapi.log.info(`  Parent Depth (Brand source): ${parentNonLanguageDependedDetails?.DimensionsDepth}`);
        strapi.log.info(`  Child Depth: ${childProductData.NonLanguageDependedProductDetails?.DimensionsDepth}`);

        // Calculate final dimension values - use same source as Brand (parentNonLanguageDependedDetails)
        // Helper function to handle 0 values correctly (0 should be kept, not converted to null)
        const getValue = (...sources) => {
          for (const source of sources) {
            if (source !== undefined && source !== null) {
              return source;
            }
          }
          return null;
        };

        const parentNonLang = parentNonLanguageDependedDetails || {};
        const finalWeight = getValue(
          childProductData.NonLanguageDependedProductDetails?.Weight,
          childProductData.Weight,
          parentNonLang?.Weight
        );
        const finalDimensionsLength = getValue(
          childProductData.NonLanguageDependedProductDetails?.DimensionsLength,
          childProductData.DimensionsLength,
          parentNonLang?.DimensionsLength
        );
        const finalDimensionsHeight = getValue(
          childProductData.NonLanguageDependedProductDetails?.DimensionsHeight,
          childProductData.DimensionsHeight,
          parentNonLang?.DimensionsHeight
        );
        const finalDimensionsWidth = getValue(
          childProductData.NonLanguageDependedProductDetails?.DimensionsWidth,
          childProductData.DimensionsWidth,
          parentNonLang?.DimensionsWidth
        );
        const finalDimensionsDepth = getValue(
          childProductData.NonLanguageDependedProductDetails?.DimensionsDepth,
          childProductData.DimensionsDepth,
          parentNonLang?.DimensionsDepth
        );
        const finalDimensionsDiameter = getValue(
          childProductData.NonLanguageDependedProductDetails?.DimensionsDiameter,
          childProductData.DimensionsDiameter,
          parentNonLang?.DimensionsDiameter
        );

        strapi.log.info(`  Final values to be saved:`);
        strapi.log.info(`    Weight: ${finalWeight}`);
        strapi.log.info(`    Length: ${finalDimensionsLength}`);
        strapi.log.info(`    Height: ${finalDimensionsHeight}`);
        strapi.log.info(`    Width: ${finalDimensionsWidth}`);
        strapi.log.info(`    Depth: ${finalDimensionsDepth}`);
        strapi.log.info(`    Diameter: ${finalDimensionsDiameter}`);

        // Upload images and files to Strapi media library
        let primaryImageId = null;
        const galleryImageIds = [];
        const informationFileIds = [];

        try {
          if (primaryImageUrl) {
            primaryImageId = await this.uploadImageFromUrl(primaryImageUrl, `${variantSku}-primary`, primaryImageFileName);
          }
          for (let i = 0; i < galleryImageUrls.length; i++) {
            const id = await this.uploadImageFromUrl(galleryImageUrls[i], `${variantSku}-gallery-${i + 1}`, galleryImageFileNames[i]);
            if (id) galleryImageIds.push(id);
          }
          // For information files, assuming uploadImageFromUrl can handle them, or a separate uploadFileFromUrl is needed
          for (let i = 0; i < informationFileUrls.length; i++) {
            const id = await this.uploadImageFromUrl(informationFileUrls[i], `${variantSku}-info-file-${i + 1}`);
            if (id) informationFileIds.push(id);
          }
        } catch (error) {
          strapi.log.warn(`Image/file upload failed for variant ${variantSku}:`, error.message);
        }

        // Default values for sizes and is_primary_for_color - these will be updated after all variants are processed
        let sizesForColor: string[] = [];
        let isPrimaryForColor = false;

        // Extract supplier color code with language priority
        let supplierColorCode = childProductData.UnstructuredInformation?.SupplierColorCode;
        if (!supplierColorCode && childProductData.ProductDetails) {
          // Try priority languages first
          for (const lang of languagePriority) {
            if (childProductData.ProductDetails[lang]?.UnstructuredInformation?.SupplierColorCode) {
              supplierColorCode = childProductData.ProductDetails[lang].UnstructuredInformation.SupplierColorCode;
              break;
            }
          }

          // If still not found, try remaining languages
          if (!supplierColorCode) {
            const remainingLangs = Object.keys(childProductData.ProductDetails).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails[lang]?.UnstructuredInformation?.SupplierColorCode) {
                supplierColorCode = childProductData.ProductDetails[lang].UnstructuredInformation.SupplierColorCode;
                break;
              }
            }
          }
        }

        // For A73, assign embroidery_sizes to BLSales variant after all BOR* are processed
        let embroidery_sizes = null;
        if (isA73 && isBLSales && colorGroupKey && this._a73EmbroiderySizes && this._a73EmbroiderySizes[colorGroupKey]) {
          embroidery_sizes = this._a73EmbroiderySizes[colorGroupKey];
        }

        // Extract name and description with language priority (en -> nl -> others)
        const extractNameWithPriority = () => {
          const languagePriority = ['en', 'nl'];

          // Try priority languages first
          for (const lang of languagePriority) {
            if (nameJson[lang]) {
              return nameJson[lang];
            }
          }

          // Try all other available languages
          const remainingLangs = Object.keys(nameJson).filter(lang => !languagePriority.includes(lang));
          for (const lang of remainingLangs) {
            if (nameJson[lang]) {
              return nameJson[lang];
            }
          }

          return null;
        };

        const extractDescriptionWithPriority = () => {
          const languagePriority = ['en', 'nl'];

          // Try priority languages first
          for (const lang of languagePriority) {
            if (descriptionJson[lang]) {
              return this.cleanHtmlFromDescription(descriptionJson[lang]);
            }
          }

          // Try all other available languages
          const remainingLangs = Object.keys(descriptionJson).filter(lang => !languagePriority.includes(lang));
          for (const lang of remainingLangs) {
            if (descriptionJson[lang]) {
              return this.cleanHtmlFromDescription(descriptionJson[lang]);
            }
          }

          return null;
        };

        const variantData = {
          sku: variantSku,
          parent_product: parentProductId,
          name: extractNameWithPriority(),
          description: extractDescriptionWithPriority(),
          short_description: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (shortDescriptionJson[lang]) return this.cleanHtmlFromDescription(shortDescriptionJson[lang]);
            }
            const remainingLangs = Object.keys(shortDescriptionJson).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (shortDescriptionJson[lang]) return this.cleanHtmlFromDescription(shortDescriptionJson[lang]);
            }
            return null;
          })(),
          meta_name: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (metaNameJson[lang]) return metaNameJson[lang];
            }
            const remainingLangs = Object.keys(metaNameJson).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (metaNameJson[lang]) return metaNameJson[lang];
            }
            return null;
          })(),
          meta_description: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (metaDescriptionJson[lang]) return metaDescriptionJson[lang];
            }
            const remainingLangs = Object.keys(metaDescriptionJson).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (metaDescriptionJson[lang]) return metaDescriptionJson[lang];
            }
            return null;
          })(),
          meta_keywords: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (metaKeywordsJson[lang]) return metaKeywordsJson[lang];
            }
            const remainingLangs = Object.keys(metaKeywordsJson).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (metaKeywordsJson[lang]) return metaKeywordsJson[lang];
            }
            return null;
          })(),
          primary_image: primaryImageId,
          gallery_images: galleryImageIds,
          information_files: informationFileIds,
          is_active: childProductData.IsActive || true,
          configuration_fields: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.ConfigurationFields) {
                return childProductData.ProductDetails[lang].ConfigurationFields;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.ConfigurationFields) {
                return childProductData.ProductDetails[lang].ConfigurationFields;
              }
            }
            return null;
          })(), // Correctly store configuration fields with language priority
          unstructured_information_localized: childProductData.UnstructuredInformation || null, // Assuming this is localized JSON
          color: color,
          size: size,
          supplier_search_color: supplierSearchColor,
          supplier_color_code: supplierColorCode,
          hex_color: hexColor,
          supplier_main_category: childProductData.UnstructuredInformation?.SupplierMainCategory || childProductData.NonLanguageDependedProductDetails?.Category || null,
          material: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (materialJson[lang]) return materialJson[lang];
            }
            const remainingLangs = Object.keys(materialJson).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (materialJson[lang]) return materialJson[lang];
            }
            return null;
          })(),
          country_of_origin: countryOfOrigin || childProductData.NonLanguageDependedProductDetails?.CountryOfOrigin || null, // Use the extracted value or fallback
          production_time: productionTime || null, // Use the extracted value
          compliance: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.WebShopInformation?.Compliance?.InformationValue) {
                return childProductData.ProductDetails[lang].WebShopInformation.Compliance.InformationValue;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.WebShopInformation?.Compliance?.InformationValue) {
                return childProductData.ProductDetails[lang].WebShopInformation.Compliance.InformationValue;
              }
            }
            return null;
          })(),
          ecological_information: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.WebShopInformation?.EcologicalInformation?.InformationValue) {
                return childProductData.ProductDetails[lang].WebShopInformation.EcologicalInformation.InformationValue;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.WebShopInformation?.EcologicalInformation?.InformationValue) {
                return childProductData.ProductDetails[lang].WebShopInformation.EcologicalInformation.InformationValue;
              }
            }
            return null;
          })(),
          imprint_required: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.ImprintRequired !== undefined) {
                return childProductData.ProductDetails[lang].ImportantInformation.ImprintRequired;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.ImprintRequired !== undefined) {
                return childProductData.ProductDetails[lang].ImportantInformation.ImprintRequired;
              }
            }
            return false;
          })(),
          tron_logo_enabled: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.TronLogoEnabled !== undefined) {
                return childProductData.ProductDetails[lang].ImportantInformation.TronLogoEnabled;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.TronLogoEnabled !== undefined) {
                return childProductData.ProductDetails[lang].ImportantInformation.TronLogoEnabled;
              }
            }
            return false;
          })(),
          tron_logo_reference: (() => {
            const languagePriority = ['en', 'nl'];
            for (const lang of languagePriority) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.TronLogoReference) {
                return childProductData.ProductDetails[lang].ImportantInformation.TronLogoReference;
              }
            }
            const remainingLangs = Object.keys(childProductData.ProductDetails || {}).filter(lang => !languagePriority.includes(lang));
            for (const lang of remainingLangs) {
              if (childProductData.ProductDetails?.[lang]?.ImportantInformation?.TronLogoReference) {
                return childProductData.ProductDetails[lang].ImportantInformation.TronLogoReference;
              }
            }
            return null;
          })(),
          fragile: childProductData.NonLanguageDependedProductDetails?.Fragile || false,
          usb_item: childProductData.NonLanguageDependedProductDetails?.USBItem || false,
          new_product: childProductData.NonLanguageDependedProductDetails?.ProductFiltersByGroup?.NewProduct || false,
          eco: childProductData.NonLanguageDependedProductDetails?.ProductFiltersByGroup?.Eco || false,
          weight: finalWeight,
          dimensions_length: finalDimensionsLength,
          dimensions_height: finalDimensionsHeight,
          dimensions_diameter: finalDimensionsDiameter,
          dimensions_width: finalDimensionsWidth,
          dimensions_depth: finalDimensionsDepth,
          // Handle service variants:
          embroidery_sizes: embroidery_sizes || this.extractEmbroiderySizes(variantSku),
          is_service_base: isA73 ? isBLSales : this.isServiceBaseVariant(variantSku),
          sizes: sizesForColor, // Will be populated later for primary variants
          is_primary_for_color: isA73 ? isBLSales : isPrimaryForColor, // For A73, only BLSales is primary
          last_synced: new Date().toISOString(),
        };

        // Log the variantData being sent to Strapi for debugging
        strapi.log.info(`Variant data for SKU ${variantSku}: ${JSON.stringify(variantData, null, 2)}`);

        let productVariant;
        let created = false;
        let updated = false;

        if (existingVariant.length > 0) {
          const existingData = existingVariant[0];
          const { id, createdAt, updatedAt, publishedAt, ...existingCleanData } = existingData;

          // Create a comparable object from variantData, excluding dynamic fields like last_synced
          const comparableVariantData = lodash.omit(variantData, ['last_synced']);

          // Create a comparable object from existingCleanData, ensuring all fields are present and in same order for deep comparison
          // This might require a more robust mapping or field normalization if existingCleanData doesn't exactly match variantData structure
          const comparableExistingData = lodash.omit(existingCleanData, ['last_synced', 'parent_product']); // Exclude parent_product as it's an ID, not directly comparable in deep comparison if populated

          if (lodash.isEqual(comparableVariantData, comparableExistingData)) {
            strapi.log.info(`✓ Skipping variant ${variantSku} - data unchanged.`);
            return { productVariant: existingVariant[0], created: false, updated: false };
          }

          // Update existing variant
          productVariant = await strapi.entityService.update(
            "api::product-variant.product-variant",
            existingVariant[0].id,
            { data: variantData }
          );
          updated = true;
        } else {
          // Create new variant
          productVariant = await strapi.entityService.create(
            "api::product-variant.product-variant",
            { data: variantData }
          );
          created = true;
        }
        return { productVariant, created, updated };
      } catch (error) {
        const errorMessage = error.details?.errors ? JSON.stringify(error.details.errors, null, 2) : error.message;
        strapi.log.error(
          `Failed to create/update product variant ${variantSku}:`,
          errorMessage
        );
        throw error;
      }
    },

    /**
     * Sync a single supplier using product-level hash comparison
     */
    async syncSupplier(supplier: any) {
      try {
        // Log the full supplier data for debugging
        // strapi.log.info('syncSupplier received supplier:', JSON.stringify(supplier, null, 2));
        strapi.log.info(`Starting sync for supplier: ${supplier.code}`);

        // Get product URLs with hashes from Promidata
        const productUrlsWithHashes = await this.parseProductUrlsWithHashes(
          supplier.code
        );
        if (!productUrlsWithHashes || productUrlsWithHashes.length === 0) {
          return { message: "No products available for this supplier" };
        }

        // Get existing parent products for this supplier from database
        const existingParentProducts = await strapi.entityService.findMany(
          "api::parent-product.parent-product",
          {
            filters: { },
            fields: ["id", "sku", "promidata_hash"],
          }
        );

        const existingParentProductsMap = new Map();
        existingParentProducts.forEach((parentProduct) => {
          existingParentProductsMap.set(parentProduct.sku, parentProduct);
        });

        let importedParentProducts = 0;
        let updatedParentProducts = 0;
        let skippedParentProducts = 0;
        let importedVariants = 0;
        let updatedVariants = 0;
        let skippedVariants = 0;
        const errors = [];

        // Process all product URLs
        strapi.log.info(
          `Found ${productUrlsWithHashes.length} products for supplier ${supplier.code}`
        );

        const productsToProcess = productUrlsWithHashes; // Process all products
        strapi.log.info(
          `Processing ${productsToProcess.length} products for ${supplier.code}`
        );
        if (productsToProcess.length === 0) {
          strapi.log.error("No products to process!");
          return { message: "No products found to process" };
        }

        strapi.log.info("About to start parent product processing loop...");
        for (let i = 0; i < productsToProcess.length; i++) {
          const { url, hash } = productsToProcess[i];
          try {
            strapi.log.info(`Processing product ${i + 1} of ${productsToProcess.length} for supplier ${supplier.code}: ${url}`);

            const urlParts = url.split("/");
            const fileName = urlParts[urlParts.length - 1];
            const productCode = fileName.replace(".json", ""); // This is the parent product SKU

            strapi.log.info(`Parent Product SKU: ${productCode}`);

            const existingParentProduct = existingParentProductsMap.get(productCode);
            const newHash = hash.trim();

            if (existingParentProduct && existingParentProduct.promidata_hash) {
              const existingHash = existingParentProduct.promidata_hash.trim();

              if (existingHash === newHash) {
                skippedParentProducts++;
                strapi.log.info(
                  `✓ Skipping parent product ${productCode} - hash unchanged: ${newHash}`
                );
                // Continue to process variants even if parent hash is unchanged, in case variants changed
              } else {
                strapi.log.info(
                  `⚡ Processing parent product ${productCode} - hash changed: ${existingHash} → ${newHash}`
                );
              }
            } else {
              strapi.log.info(
                `🆕 Processing parent product ${productCode} - ${existingParentProduct ? "missing hash" : "new product"}: ${newHash}`
              );
            }

            strapi.log.info(`Fetching product data from: ${url}`);
            const productData = await this.fetchProductData(url);

            // Log the entire productData object for debugging variant processing
            // strapi.log.info(`Full productData received for variants check: ${JSON.stringify(productData, null, 2)}`);
            if (productData.ChildProducts && productData.ChildProducts.length > 0) {
                strapi.log.info(`Full productData received for variants check. Contains ${productData.ChildProducts.length} child products.`);
            } else {
                strapi.log.info(`Full productData received for variants check. No child products found or array is empty.`);
            }

            strapi.log.info(
              `Product data fetched, creating/updating parent product...`
            );

            // Create or update parent product
            const parentProductResult = await this.createOrUpdateParentProduct(
              productData,
              supplier,
              hash,
              url
            );

            if (parentProductResult.created) {
              importedParentProducts++;
              strapi.log.info(
                `✅ Parent Product ${productCode} created with hash: ${hash}`
              );
            } else {
              updatedParentProducts++;
              strapi.log.info(
                `🔄 Parent Product ${productCode} updated with hash: ${hash}`
              );
            }

            const parentProductId = parentProductResult.parentProduct.id;

            // Process ChildProducts (Product Variants)
            if (productData.ChildProducts && productData.ChildProducts.length > 0) {
              strapi.log.info(`Found ${productData.ChildProducts.length} child products for parent product ${productCode}.`);
              // Group variants by color code to determine is_primary_for_color and sizes array
              const variantsByColorCode = lodash.groupBy(productData.ChildProducts, childProd =>
                this.extractColorCodeForGrouping(childProd, productCode)
              );

              for (const colorCode in variantsByColorCode) {
                const colorVariants = variantsByColorCode[colorCode];
                const sizesForColor = this.extractSizesForColor(productData.ChildProducts, colorCode, productCode);

                // Create only the PRIMARY variant for each color (first variant in the group)
                const primaryVariant = colorVariants[0];
                strapi.log.info(`Processing PRIMARY variant for color code ${colorCode} (${colorVariants.length} total variants in this color)`);

                const variantResult = await this.createOrUpdateProductVariant(
                  primaryVariant,
                  parentProductId,
                  productCode, // Pass parent product SKU to extract variant SKU
                  supplier,
                  productData.NonLanguageDependedProductDetails // Pass parent's non-language-depended details
                );

                if (variantResult.created) {
                  importedVariants++;
                  strapi.log.info(
                    `✅ Primary variant ${variantResult.productVariant.sku} created for color ${colorCode}.`
                  );
                } else if (variantResult.updated) {
                  updatedVariants++;
                  strapi.log.info(
                    `🔄 Primary variant ${variantResult.productVariant.sku} updated for color ${colorCode}.`
                  );
                } else {
                  skippedVariants++;
                  strapi.log.info(
                    `✓ Primary variant ${variantResult.productVariant.sku} skipped for color ${colorCode} - data unchanged.`
                  );
                }

                // Update sizes array and set as primary for color
                await strapi.entityService.update(
                  "api::product-variant.product-variant",
                  variantResult.productVariant.id,
                  {
                    data: {
                      sizes: sizesForColor, // All sizes for this color
                      is_primary_for_color: true, // Always true since we only create primary variants
                    },
                  }
                );

                strapi.log.info(`✅ Set sizes array [${sizesForColor.join(', ')}] for primary variant ${variantResult.productVariant.sku}`);
              }

            }

          } catch (error) {
            const urlParts = url.split("/");
            const fileName = urlParts[urlParts.length - 1];
            const productCode = fileName.replace(".json", "");

            errors.push({
              productCode: productCode || "unknown",
              url: url,
              error: error.message,
            });
            strapi.log.error(
              `Error processing parent product ${productCode}:`,
              error.message
            );
          }
        }

        const totalProcessedParents = importedParentProducts + updatedParentProducts;
        const totalAvailableParents = productsToProcess.length;

        strapi.log.info(
          `Sync completed for supplier: ${supplier.code} - Parent Products Imported: ${importedParentProducts}, Updated: ${updatedParentProducts}, Skipped: ${skippedParentProducts}, Variants Imported: ${importedVariants}, Updated: ${updatedVariants}, Skipped: ${skippedVariants}, Errors: ${errors.length}`
        );

        return {
          message: `Sync completed successfully - ${totalProcessedParents} parent products processed, ${importedVariants + updatedVariants} variants processed.`,
          parentProductsProcessed: totalProcessedParents,
          parentProductsAvailable: totalAvailableParents,
          importedParentProducts,
          updatedParentProducts,
          skippedParentProducts,
          importedVariants,
          updatedVariants,
          skippedVariants,
          errors: errors.length,
          errorDetails: errors,
        };
      } catch (error) {
        strapi.log.error(`Sync failed for supplier ${supplier.code}:`, error);
        throw error;
      }
    },

    /**
     * Extract product code from product data
     * For Promidata structure, the product code is typically in the URL filename
     */
    extractProductCode(
      productData: any,
      supplier: any,
      url?: string
    ): string | null {
      // For Promidata, try to extract from root level SKU fields first
      if (productData.Sku) {
        return productData.Sku;
      }
      if (productData.SupplierSku) {
        return productData.SupplierSku;
      }

      // Fallback to URL extraction
      if (url) {
        const urlParts = url.split("/");
        const fileName = urlParts[urlParts.length - 1];
        const productCode = fileName.replace(".json", "");
        if (productCode) {
          return productCode;
        }
      }

      // Last resort: check other possible fields
      return (
        productData.articlenumber ||
        productData.sku_supplier ||
        productData.SKU ||
        productData.Code ||
        productData.code ||
        productData.id ||
        productData.sku ||
        productData.ProductCode ||
        productData.ItemCode ||
        productData.ArtNr ||
        null
      );
    },

    /**
     * Extracts the SKU for a product variant based on the provided data and parent SKU.
     */
    extractVariantSku(childProductData: any, parentSku: string): string | null {
      // Prioritize Sku field from ProductDetails if available
      if (childProductData.ProductDetails) {
        // Try to find Sku in any language-dependent ProductDetails
        for (const langKey of Object.keys(childProductData.ProductDetails)) {
          if (childProductData.ProductDetails[langKey]?.Sku) {
            return childProductData.ProductDetails[langKey].Sku;
          }
        }
      }

      // Fallback: Sku at root
      if (childProductData.Sku) {
        return childProductData.Sku;
      }
      // Fallback: SupplierSku at root
      if (childProductData.SupplierSku) {
        return childProductData.SupplierSku;
      }
      // Fallback: Parse SKU suffix from ConfigurationFields
      if (childProductData.NonLanguageDependedProductDetails?.Sku) {
        return childProductData.NonLanguageDependedProductDetails.Sku;
      }
      // Fallback to A_number if available at child level
      if (childProductData.A_number) {
        return `${parentSku}-${childProductData.A_number}`;
      }


      // If no specific variant SKU found, generate from parentSku, SupplierColorCode, and Size
      let supplierColorCode = childProductData.UnstructuredInformation?.SupplierColorCode;

      // If not found, use language priority logic
      if (!supplierColorCode && childProductData.ProductDetails) {
        const languagePriority = ['en', 'nl'];

        // Try priority languages first
        for (const lang of languagePriority) {
          if (childProductData.ProductDetails[lang]?.UnstructuredInformation?.SupplierColorCode) {
            supplierColorCode = childProductData.ProductDetails[lang].UnstructuredInformation.SupplierColorCode;
            break;
          }
        }

        // If still not found, try remaining languages
        if (!supplierColorCode) {
          const remainingLangs = Object.keys(childProductData.ProductDetails).filter(lang => !languagePriority.includes(lang));
          for (const lang of remainingLangs) {
            if (childProductData.ProductDetails[lang]?.UnstructuredInformation?.SupplierColorCode) {
              supplierColorCode = childProductData.ProductDetails[lang].UnstructuredInformation.SupplierColorCode;
              break;
            }
          }
        }
      }
      let sizeCode = "";
      if (childProductData.ProductDetails?.en?.ConfigurationFields) {
        const parsedConfig = this.parseConfigurationFields(childProductData.ProductDetails.en.ConfigurationFields, 'en');
        if (parsedConfig.size) {
          sizeCode = parsedConfig.size.replace(/[^a-zA-Z0-9]/g, '');
        }
      }

      if (parentSku && supplierColorCode && sizeCode) {
        return `${parentSku}-${supplierColorCode}-${sizeCode}`;
      } else if (parentSku && supplierColorCode) {
        return `${parentSku}-${supplierColorCode}`;
      }

      // Fallback to a generic SKU if no specific variant SKU can be formed from the above logic
      // This might need further refinement based on actual Promidata data patterns for variant SKUs
      // For now, return null or a generic identifier if no distinct variant SKU can be formed
      return null;
    },

    /**
     * Parses configuration fields to extract color and size based on localized names.
     */
    parseConfigurationFields(configurationFields: any[], language: string): { color: string | null; size: string | null } {
      let color: string | null = null;
      let size: string | null = null;

      if (!configurationFields) {
        return { color, size };
      }

      const lowerCaseLanguage = language.toLowerCase();

      for (const field of configurationFields) {
        const configName = field.ConfigurationName?.toLowerCase();
        const configNameTranslated = field.ConfigurationNameTranslated?.[lowerCaseLanguage]?.toLowerCase();
        const configValue = field.ConfigurationValue;

        if (!configValue) continue;

        if (
          (configName && (configName.includes("color") || configName.includes("kleur") || configName.includes("couleur"))) ||
          (configNameTranslated && (configNameTranslated.includes("color") || configNameTranslated.includes("kleur") || configNameTranslated.includes("couleur")))
        ) {
          color = configValue;
        } else if (
          (configName && (configName.includes("size") || configName.includes("afmeting") || configName.includes("taille") || configName.includes("maat"))) ||
          (configNameTranslated && (configNameTranslated.includes("size") || configNameTranslated.includes("afmeting") || configNameTranslated.includes("taille") || configNameTranslated.includes("maat")))
        ) {
          size = configValue;
        }

        if (color && size) break;
      }

      return { color, size };
    },

    /**
     * Extracts unique sizes for a given color group from child products.
     * This is used to populate the 'sizes' JSON array for the primary variant of a color.
     */
    extractSizesForColor(childProducts: any[], supplierColorCode: string, parentProductSku?: string): string[] {
      const sizes: Set<string> = new Set();
      const languagePriority = ['en', 'nl'];

      childProducts.forEach(childProduct => {
        // Use the same color extraction logic as grouping
        const currentVariantColorCode = this.extractColorCodeForGrouping(childProduct, parentProductSku);

        if (currentVariantColorCode === supplierColorCode) {
          // Extract size with language priority: en -> nl -> others
          let extractedSize = null;

          // For A461 and all other products, use ConfigurationFields directly (not SKU pattern)
          // Try ConfigurationFields
          if (childProduct.ProductDetails) {
            // Try priority languages first
            for (const lang of languagePriority) {
              if (extractedSize) break;
              if (childProduct.ProductDetails[lang]?.ConfigurationFields) {
                const parsed = this.parseConfigurationFields(childProduct.ProductDetails[lang].ConfigurationFields, lang);
                if (parsed.size) {
                  extractedSize = parsed.size;
                  break;
                }
              }
            }

            // If no size found, try remaining languages
            if (!extractedSize) {
              const remainingLangs = Object.keys(childProduct.ProductDetails).filter(lang => !languagePriority.includes(lang));
              for (const lang of remainingLangs) {
                if (extractedSize) break;
                if (childProduct.ProductDetails[lang]?.ConfigurationFields) {
                  const parsed = this.parseConfigurationFields(childProduct.ProductDetails[lang].ConfigurationFields, lang);
                  if (parsed.size) {
                    extractedSize = parsed.size;
                    break;
                  }
                }
              }
            }
          }

          // Add the extracted size to our Set (if found)
          if (extractedSize) {
            sizes.add(extractedSize);
          }
        }
      });
      return Array.from(sizes).sort(); // Return sorted unique sizes
    },

    /**
     * Extracts embroidery sizes from a variant SKU.
     * Promidata uses BOR* for embroidery sizes, e.g., BOR1, BOR2, BOR3.
     */
    extractEmbroiderySizes(variantSku: string): string[] | null {
      if (variantSku.startsWith("BOR")) {
        const sizeMatch = variantSku.match(/BOR(\d+)/);
        if (sizeMatch) {
          const sizeNumber = parseInt(sizeMatch[1], 10);
          const sizes: string[] = [];
          for (let i = 1; i <= sizeNumber; i++) {
            sizes.push(`BOR${i}`);
          }
          return sizes;
        }
      }
      return null;
    },

    /**
     * Checks if a variant is a service base variant (e.g., BLSales).
     * This is determined by the SKU prefix.
     */
    isServiceBaseVariant(variantSku: string): boolean {
      return variantSku.startsWith("BLSales");
    },

    /**
     * Generate a deep hash for an object to compare its contents.
     */
    generateDeepHash(obj: any): string {
      const stringified = JSON.stringify(obj);
      return crypto.createHash("md5").update(stringified).digest("hex");
    },

    /**
     * Update sync configuration
     */
    async updateSyncConfiguration(supplier: any, hash: string) {
      try {
        const existing = await strapi.entityService.findMany(
          "api::sync-configuration.sync-configuration",
          {
            filters: { supplier: supplier.id },
          }
        );

        const data = {
          supplier: supplier.id,
          last_hash: hash,
          last_sync: new Date().toISOString(),
          sync_status: "completed" as const,
        };

        if (existing.length > 0) {
          await strapi.entityService.update(
            "api::sync-configuration.sync-configuration",
            existing[0].id,
            { data }
          );
        } else {
          await strapi.entityService.create(
            "api::sync-configuration.sync-configuration",
            { data }
          );
        }
      } catch (error) {
        strapi.log.error(
          `Failed to update sync configuration for supplier ${supplier.code}:`,
          error
        );
        throw error;
      }
    },

    /**
     * Update missing supplier names for existing parent products
     */
    async updateMissingSupplierNames() {
      try {
        strapi.log.info('Starting update of missing supplier names...');

        // Get all parent products with empty or missing supplier_name
        const parentProductsWithoutSupplierName = await strapi.entityService.findMany(
          "api::parent-product.parent-product",
          {
            filters: {
              $or: [
                { supplier_name: { $null: true } },
                { supplier_name: '' }
              ]
            },
            populate: '*',
            pagination: { page: 1, pageSize: 1000 }
          }
        );

        strapi.log.info(`Found ${parentProductsWithoutSupplierName.length} parent products without supplier names`);

        if (parentProductsWithoutSupplierName.length === 0) {
          return { message: 'No parent products found without supplier names', updated: 0 };
        }

        // Group by supplier for efficient processing
        const supplierGroups = parentProductsWithoutSupplierName.reduce((groups: any, product: any) => {
          const supplierCode = product.supplier?.code;
          if (supplierCode) {
            if (!groups[supplierCode]) {
              groups[supplierCode] = [];
            }
            groups[supplierCode].push(product);
          }
          return groups;
        }, {});

        let updatedCount = 0;
        const errors: string[] = [];

        // Process each supplier group
        for (const [supplierCode, products] of Object.entries(supplierGroups)) {
          try {
            strapi.log.info(`Processing ${(products as any[]).length} products for supplier ${supplierCode}`);

            // Get one product data from Promidata to extract supplier name
            const productUrlsWithHashes = await this.parseProductUrlsWithHashes(supplierCode);

            if (productUrlsWithHashes.length > 0) {
              const firstProductUrl = productUrlsWithHashes[0];
              const response = await fetch(firstProductUrl.url);

              if (response.ok) {
                const productData = await response.json();
                const supplierName = productData.UnstructuredInformation?.SupplierNameToShow;

                if (supplierName) {
                  strapi.log.info(`Found supplier name "${supplierName}" for ${supplierCode}`);

                  // Update all products for this supplier
                  for (const product of products as any[]) {
                    try {
                      await strapi.entityService.update(
                        "api::parent-product.parent-product",
                        product.id,
                        { data: { supplier_name: supplierName } }
                      );
                      updatedCount++;
                    } catch (updateError) {
                      errors.push(`Failed to update product ${product.sku}: ${updateError.message}`);
                    }
                  }
                } else {
                  strapi.log.warn(`No supplier name found in Promidata for ${supplierCode}`);
                }
              }
            }
          } catch (supplierError) {
            errors.push(`Failed to process supplier ${supplierCode}: ${supplierError.message}`);
          }
        }

        strapi.log.info(`Update completed: ${updatedCount} products updated, ${errors.length} errors`);

        return {
          message: `Updated ${updatedCount} parent products with supplier names`,
          updated: updatedCount,
          errors: errors.length > 0 ? errors : undefined
        };

      } catch (error) {
        strapi.log.error('Failed to update missing supplier names:', error);
        throw error;
      }
    },

    /**
     * Get sync status for all suppliers
     */
    async getSyncStatus() {
      try {
        const suppliers = await strapi.entityService.findMany(
          "api::supplier.supplier",
          {
            filters: { is_active: true },
            populate: ["sync_config"],
          }
        );

        return suppliers.map((supplier: any) => ({
          id: supplier.id,
          code: supplier.code,
          name: supplier.name,
          auto_import: supplier.auto_import,
          last_sync: supplier.last_sync_date || null,
          last_hash: supplier.last_hash || null,
          sync_status: supplier.last_sync_status || "never",
        }));
      } catch (error) {
        strapi.log.error("Failed to get sync status:", error);
        throw error;
      }
    },

    /**
     * Get sync history
     */
    async getSyncHistory(params: { page: number; pageSize: number }) {
      try {
        // This would require a sync log table in a full implementation
        // For now, return sync configurations as history
        return await strapi.entityService.findMany(
          "api::sync-configuration.sync-configuration",
          {
            sort: { last_sync: "desc" },
            pagination: {
              page: params.page,
              pageSize: params.pageSize,
            },
            populate: ["supplier"],
          }
        );
      } catch (error) {
        strapi.log.error("Failed to get sync history:", error);
        throw error;
      }
    },

    /**
     * Upload image from URL to Strapi media library
     */
    async uploadImageFromUrl(
      imageUrl: string,
      fileName: string,
      originalFileName?: string
    ): Promise<number | null> {
      try {
        strapi.log.debug(`Uploading image from URL: ${imageUrl}`);

        // Download image from URL
        const response = await fetch(imageUrl);
        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }

        // Get image buffer and content type
        const imageBuffer = await response.buffer();
        const contentType =
          response.headers.get("content-type") || "image/jpeg";

        // Extract file extension from content type or URL
        let extension = "jpg";
        if (contentType.includes("png")) extension = "png";
        else if (contentType.includes("gif")) extension = "gif";
        else if (contentType.includes("webp")) extension = "webp";
        else if (imageUrl.includes(".png")) extension = "png";
        else if (imageUrl.includes(".gif")) extension = "gif";
        else if (imageUrl.includes(".webp")) extension = "webp";

        // Use internal filename for storage, keep original for display
        const cleanFileName = `${fileName}.${extension}`;
        const displayName = cleanFileName; // Back to internal name

        // Upload to Cloudflare R2
        const r2 = new (require("@aws-sdk/client-s3").S3Client)({
          region: "auto",
          endpoint: process.env.R2_ENDPOINT,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
          },
        });

        const uploadParams = {
          Bucket: process.env.R2_BUCKET_NAME,
          Key: cleanFileName,
          Body: imageBuffer,
          ContentType: contentType,
        };

        await r2.send(
          new (require("@aws-sdk/client-s3").PutObjectCommand)(uploadParams)
        );

        const fileStat = { size: imageBuffer.length };

        // Use Promidata URL directly with CSP whitelist for preview
        const r2Url = `${process.env.R2_PUBLIC_URL}/${cleanFileName}`;
        const file = {
          name: displayName, // Internal name (A113-1000008-primary.jpg)
          hash: crypto.createHash("md5").update(cleanFileName).digest("hex"),
          ext: `.${extension}`,
          mime: contentType,
          size: fileStat.size / 1024,
          url: imageUrl, // Original Promidata URL as main (now CSP whitelisted)
          provider: "aws-s3",
          provider_metadata: {
            public_id: cleanFileName,
            resource_type: "image",
            original_url: imageUrl, // Original Promidata URL
            r2_backup_url: r2Url, // R2 as backup
            r2_key: cleanFileName,
            original_filename: originalFileName // Store original filename for reference
          },
          folderPath: "/",
          caption: originalFileName ? `${originalFileName} (Promidata: ${imageUrl})` : `Promidata: ${imageUrl}`,
          alternativeText: displayName, // Internal filename for alt text
        };

        const uploadedFile = await this.retry(async () => {
          return await strapi.entityService.create(
            "plugin::upload.file",
            { data: file }
          );
        });

        return Number(uploadedFile.id);
      } catch (error) {
        strapi.log.error(
          `Failed to upload image from ${imageUrl}:`,
          error.message
        );
        return null;
      }
    },

    /**
     * Utility function to retry a promise-based function.
     */
    async retry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
      try {
        return await fn();
      } catch (error) {
        if (retries > 0) {
          strapi.log.warn(`Retrying... attempts left: ${retries}, error: ${error.message}`);
          await new Promise(res => setTimeout(res, delay));
          return this.retry(fn, retries - 1, delay * 2); // Exponential backoff
        } else {
          throw error; // No more retries, re-throw the error
        }
      }
    },

    /**
     * Test connection to Promidata API
     */
    async testConnection() {
      try {
        const suppliers = await this.fetchSuppliersFromPromidata();
        return {
          status: "success",
          suppliersFound: suppliers.length,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        return {
          status: "failed",
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },  })
);
