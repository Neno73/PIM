'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface ProductCardProps {
  product: {
    id: number
    documentId: string
    sku: string
    a_number: string
    supplier_name?: string
    brand?: string
    category?: string
    total_variants_count?: number
    variants?: Array<{
      id: number
      documentId: string
      sku: string
      name?: string
      description?: string
      primary_image?: {
        url: string
        formats?: {
          thumbnail?: { url: string }
          small?: { url: string }
        }
      }
    }>
  }
}

export function ProductCard({ product }: ProductCardProps) {
  // Get product name from brand or first variant
  const productName = product.brand ||
                     product.variants?.[0]?.name ||
                     `Product ${product.sku}`

  // Get description from first variant
  const description = product.variants?.[0]?.description

  // Get image URL from first variant's primary_image
  const firstVariant = product.variants?.[0]
  const imageUrl = firstVariant?.primary_image?.formats?.small?.url ||
                   firstVariant?.primary_image?.formats?.thumbnail?.url ||
                   firstVariant?.primary_image?.url

  return (
    <Link href={`/products/${product.documentId}`} className="block h-full">
      <Card className="overflow-hidden hover:shadow-lg transition-shadow duration-300 h-full flex flex-col cursor-pointer">
        {/* Product Image */}
        <div className="relative h-48 bg-gray-100 overflow-hidden">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={productName}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <Package className="w-16 h-16 text-gray-400" />
          </div>
        )}

        {/* Variant Count Badge */}
        {product.total_variants_count && product.total_variants_count > 0 && (
          <div className="absolute top-2 right-2">
            <Badge variant="secondary" className="text-xs">
              {product.total_variants_count} {product.total_variants_count === 1 ? 'variant' : 'variants'}
            </Badge>
          </div>
        )}
      </div>

      <CardHeader className="flex-1">
        {/* SKU and A-Number */}
        <div className="text-xs text-gray-500 font-mono mb-1">
          {product.sku} {product.a_number && `• ${product.a_number}`}
        </div>

        {/* Product Name */}
        <CardTitle className="text-lg line-clamp-2">{productName}</CardTitle>

        {/* Description */}
        {description && (
          <CardDescription className="line-clamp-2 mt-2">
            {description.replace(/<[^>]*>/g, '')}
          </CardDescription>
        )}
      </CardHeader>

      <CardContent>
        {/* Supplier and Category */}
        <div className="flex flex-wrap gap-1 mb-2">
          {product.supplier_name && (
            <Badge variant="outline" className="text-xs">
              {product.supplier_name}
            </Badge>
          )}
          {product.category && (
            <Badge variant="outline" className="text-xs">
              {product.category}
            </Badge>
          )}
        </div>
      </CardContent>
      </Card>
    </Link>
  )
}