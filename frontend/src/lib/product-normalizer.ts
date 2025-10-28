// Нормализатор (drop-in за фронтенд)
export interface UiProduct {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  color?: string;
  searchColor?: string;
  material?: string | null;
  sizes: string[];
  imageUrl: string;
  parent?: string;
  brand?: string;
  similarity?: number | null;
}

export function toUiProduct(p: any): UiProduct {
  // p може да биде Qdrant point со payload во p.payload или директен payload
  const pl = p?.payload ?? p;

  const imgArr = pl['product.images'];
  let firstImg = Array.isArray(imgArr) && imgArr.length > 0 ? imgArr[0] : '/placeholder-product.svg';

  // Fix Cloudflare R2 domain if needed
  if (firstImg && firstImg.includes('pub-782243dedd784cb60c5cbf53f4cfe.r2.dev')) {
    firstImg = firstImg.replace('pub-782243dedd784cb60c5cbf53f4cfe.r2.dev', 'pub-702243dedd784ac6b0c85c8bf53f461e.r2.dev');
  }

  return {
    sku: pl['product.sku'] ?? '',
    name: pl['product.name'] ?? '',
    description: pl['product.description'] ?? '',
    category: pl['product.category'] ?? '',
    color: pl['product.color'] ?? '',
    searchColor: pl['product.search.color'] ?? '',
    material: pl['product.material'] ?? null,
    sizes: Array.isArray(pl['product.sizes']) ? pl['product.sizes'] : [],
    imageUrl: firstImg,
    parent: pl['product.parent'],
    brand: pl['product.brand'] ?? '',
    similarity: p?.score ?? p?.similarity_score ?? p?.similarity ?? null,
  };
}

// Helper function за нормализирање на array од products
export function normalizeProducts(products: any[]): UiProduct[] {
  return products.map(toUiProduct);
}

// Helper function за валидација на UiProduct
export function isValidUiProduct(product: any): product is UiProduct {
  return (
    typeof product === 'object' &&
    product !== null &&
    typeof product.sku === 'string' &&
    typeof product.name === 'string' &&
    typeof product.imageUrl === 'string' &&
    Array.isArray(product.sizes)
  );
}