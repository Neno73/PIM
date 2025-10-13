/**
 * supplier service
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::supplier.supplier', ({ strapi }) => ({
  async bootstrap() {
    const suppliers = [
      { code: 'A23', name: 'XD Connects (Xindao)' },
      { code: 'A24', name: 'Clipper' },
      { code: 'A30', name: 'Senator GmbH' },
      { code: 'A33', name: 'PF Concept World Source' },
      { code: 'A34', name: 'PF Concept' },
      { code: 'A36', name: 'Midocean' },
      { code: 'A37', name: 'THE PEPPERMINT COMPANY' },
      { code: 'A38', name: 'Inspirion GmbH Germany' },
      { code: 'A42', name: 'Bic Graphic Europe S.A.' },
      { code: 'A53', name: 'Toppoint B.V.' },
      { code: 'A58', name: 'Giving Europe BV' },
      { code: 'A61', name: 'The Gift Groothandel BV' },
      { code: 'A73', name: 'Buttonboss' },
      { code: 'A81', name: 'ANDA Western Europe B.V.' },
      { code: 'A82', name: 'REFLECTS GmbH' },
      { code: 'A86', name: 'Araco International BV' },
      { code: 'A94', name: 'New Wave Sportswear BV' },
      { code: 'A113', name: 'Malfini' },
      { code: 'A121', name: 'MAGNA sweets GmbH' },
      { code: 'A127', name: 'Hypon BV' },
      { code: 'A130', name: 'PREMO bv' },
      { code: 'A145', name: 'Brandcharger BV' },
      { code: 'A190', name: 'elasto GmbH & Co. KG' },
      { code: 'A227', name: 'Troika Germany GmbH' },
      { code: 'A233', name: 'IMPLIVA B.V.' },
      { code: 'A261', name: 'Promotion4u' },
      { code: 'A267', name: 'Care Concepts BV' },
      { code: 'A288', name: 'Paul Stricker, S.A.' },
      { code: 'A301', name: 'Clipfactory' },
      { code: 'A360', name: 'Bosscher International BV' },
      { code: 'A371', name: 'Wisa' },
      { code: 'A373', name: 'PowerCubes' },
      { code: 'A389', name: 'HMZ FASHIONGROUP B.V.' },
      { code: 'A390', name: 'New Wave Sportswear BV Clique' },
      { code: 'A398', name: 'Tricorp BV' },
      { code: 'A403', name: 'Top Tex Group' },
      { code: 'A407', name: 'Commercial Sweets' },
      { code: 'A420', name: 'New Wave - Craft' },
      { code: 'A434', name: 'FARE - Guenter Fassbender GmbH' },
      { code: 'A455', name: 'HMZ Workwear' },
      { code: 'A461', name: 'Texet Promo' },
      { code: 'A467', name: 'Makito Western Europe' },
      { code: 'A477', name: 'HMZ Fashiongroup BV' },
      { code: 'A480', name: 'L-SHOP-TEAM GmbH' },
      { code: 'A510', name: 'Samdam' },
      { code: 'A511', name: 'Linotex GmbH' },
      { code: 'A521', name: 'Headwear Professional' },
      { code: 'A525', name: 'POLYCLEAN International GmbH' },
      { code: 'A529', name: 'MACMA Werbeartikel oHG' },
      { code: 'A556', name: 'LoGolf' },
      { code: 'A558', name: 'Deonet' },
      { code: 'A565', name: 'Premium Square Europe B.V.' },
      { code: 'A572', name: 'Prodir BV' },
      { code: 'A596', name: 'Arvas B.V.' },
      { code: 'A616', name: 'Colorissimo' },
      { code: 'A618', name: 'Premiums4Cars' },
    ];

    // Check if suppliers already exist
    const existingSuppliers = await strapi.entityService.findMany('api::supplier.supplier', {
      fields: ['code'],
    });

    const existingCodes = existingSuppliers.map(s => s.code);

    // Create missing suppliers
    for (const supplier of suppliers) {
      if (!existingCodes.includes(supplier.code)) {
        const newSupplier = await strapi.entityService.create('api::supplier.supplier', {
          data: {
            code: supplier.code,
            name: supplier.name,
            is_active: true,
            auto_import: false,
          },
        });

        // Create sync configuration for each supplier
        await strapi.entityService.create('api::sync-configuration.sync-configuration', {
          data: {
            supplier: newSupplier.id,
            enabled: false,
            sync_status: 'idle',
          },
        });
      }
    }

    strapi.log.info('Suppliers bootstrap completed');
  },
}));
