import type { Schema, Struct } from '@strapi/strapi';

export interface MediaImage extends Struct.ComponentSchema {
  collectionName: 'components_media_images';
  info: {
    description: '';
    displayName: 'Image';
    icon: 'image';
  };
  attributes: {
    alternativeText: Schema.Attribute.String;
    caption: Schema.Attribute.String;
    url: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface ProductDimensions extends Struct.ComponentSchema {
  collectionName: 'components_product_dimensions';
  info: {
    description: 'Product dimensions and weight';
    displayName: 'Dimensions';
  };
  attributes: {
    diameter: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    height: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    length: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    unit: Schema.Attribute.Enumeration<['cm', 'mm', 'm', 'in']> &
      Schema.Attribute.DefaultTo<'cm'>;
    weight: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    weight_unit: Schema.Attribute.Enumeration<['g', 'kg', 'oz', 'lb']> &
      Schema.Attribute.DefaultTo<'g'>;
    width: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
  };
}

export interface ProductPriceTier extends Struct.ComponentSchema {
  collectionName: 'components_product_price_tiers';
  info: {
    description: 'Quantity-based pricing tiers';
    displayName: 'Price Tier';
  };
  attributes: {
    buying_price: Schema.Attribute.Decimal &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    currency: Schema.Attribute.String &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 3;
      }> &
      Schema.Attribute.DefaultTo<'EUR'>;
    price: Schema.Attribute.Decimal &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 0;
        },
        number
      >;
    quantity: Schema.Attribute.Integer &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMax<
        {
          min: 1;
        },
        number
      >;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'media.image': MediaImage;
      'product.dimensions': ProductDimensions;
      'product.price-tier': ProductPriceTier;
    }
  }
}
