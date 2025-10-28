'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LanguageSelector } from '@/components/LanguageSelector'
import { useLanguage } from '@/contexts/LanguageContext'
import { ArrowLeft, Package, Weight, Tag } from 'lucide-react'

interface ProductVariant {
  id: number
  documentId: string
  sku: string
  name?: string
  description?: string
  short_description?: string
  primary_image?: {
    url: string
    formats?: {
      thumbnail?: { url: string }
      small?: { url: string }
      medium?: { url: string }
      large?: { url: string }
    }
  }
  gallery_images?: Array<{
    url: string
    formats?: {
      thumbnail?: { url: string }
      small?: { url: string }
      medium?: { url: string }
    }
  }>
  weight?: number
  is_active: boolean
  color?: string
  size?: string
  material?: string
  hex_color?: string
}

interface ParentProduct {
  id: number
  documentId: string
  sku: string
  a_number: string
  supplier_name?: string
  brand?: string
  category?: string
  total_variants_count?: number
  variants?: ProductVariant[]
}

export default function ProductDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { extractText } = useLanguage()
  const [parentProduct, setParentProduct] = useState<ParentProduct | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<ProductVariant | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<string>('')

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7337/api'
        const response = await fetch(
          `${apiUrl}/parent-products/${params.documentId}?populate[variants][populate][0]=primary_image&populate[variants][populate][1]=gallery_images`
        )

        if (!response.ok) {
          throw new Error('Product not found')
        }

        const data = await response.json()
        setParentProduct(data.data)

        // Set initial variant (first one)
        if (data.data.variants && data.data.variants.length > 0) {
          const firstVariant = data.data.variants[0]
          setSelectedVariant(firstVariant)

          // Set initial selected image from first variant
          if (firstVariant.primary_image?.url) {
            setSelectedImage(firstVariant.primary_image.url)
          }
        }
      } catch (error) {
        console.error('Error fetching parent product:', error)
      } finally {
        setLoading(false)
      }
    }

    if (params.documentId) {
      fetchProduct()
    }
  }, [params.documentId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-48" />
              <LanguageSelector />
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Skeleton className="h-96 w-full rounded-lg" />
            <div className="space-y-4">
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!parentProduct) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Product not found</h2>
          <p className="text-gray-600 mb-4">The product you're looking for doesn't exist.</p>
          <Button onClick={() => router.push('/products')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
        </div>
      </div>
    )
  }

  // Use brand or first variant name as product name
  const productName = parentProduct.brand || selectedVariant?.name || `Product ${parentProduct.sku}`
  const description = selectedVariant?.description || selectedVariant?.short_description || ''
  const colorName = selectedVariant?.color
  const material = selectedVariant?.material

  // Collect all images from selected variant
  const allImages = []
  if (selectedVariant?.primary_image?.url) {
    allImages.push({
      url: selectedVariant.primary_image.url,
      thumbnail: selectedVariant.primary_image.formats?.thumbnail?.url || selectedVariant.primary_image.url
    })
  }
  if (selectedVariant?.gallery_images && selectedVariant.gallery_images.length > 0) {
    selectedVariant.gallery_images.forEach(img => {
      allImages.push({
        url: img.url,
        thumbnail: img.formats?.thumbnail?.url || img.url
      })
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => router.push('/products')}
              className="flex items-center"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Products
            </Button>
            <LanguageSelector />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Images Section */}
          <div>
            {/* Main Image */}
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden mb-4">
              {selectedImage ? (
                <div className="relative h-96 bg-gray-100">
                  <Image
                    src={selectedImage}
                    alt={productName}
                    fill
                    className="object-contain"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                </div>
              ) : (
                <div className="h-96 bg-gray-100 flex items-center justify-center">
                  <Package className="w-24 h-24 text-gray-400" />
                </div>
              )}
            </div>

            {/* Image Thumbnails */}
            {allImages.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImage(img.url)}
                    className={`relative h-20 bg-white rounded-lg border-2 overflow-hidden transition-all ${
                      selectedImage === img.url
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Image
                      src={img.thumbnail}
                      alt={`${productName} ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="100px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Info Section */}
          <div>
            <div className="bg-white rounded-lg shadow-sm border p-6">
              {/* SKU and A-Number */}
              <div className="text-sm text-gray-500 font-mono mb-2">
                {parentProduct.sku} • {parentProduct.a_number}
              </div>

              {/* Product Name */}
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{productName}</h1>

              {/* Variant Selector */}
              {parentProduct.variants && parentProduct.variants.length > 1 && (
                <div className="mb-4">
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    Select Variant ({parentProduct.variants.length} available)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {parentProduct.variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => {
                          setSelectedVariant(variant)
                          if (variant.primary_image?.url) {
                            setSelectedImage(variant.primary_image.url)
                          }
                        }}
                        className={`px-4 py-2 rounded-lg border-2 transition-all ${
                          selectedVariant?.id === variant.id
                            ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                            : 'border-gray-200 hover:border-gray-300 text-gray-700'
                        }`}
                      >
                        <div className="text-sm">{variant.color || variant.size || variant.sku}</div>
                        {variant.size && variant.color && (
                          <div className="text-xs text-gray-500">{variant.size}</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Status Badge */}
              {selectedVariant && (
                <div className="mb-4">
                  {selectedVariant.is_active ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
              )}

              {/* Description */}
              {description && (
                <div className="prose prose-sm max-w-none mb-6">
                  <div
                    dangerouslySetInnerHTML={{
                      __html: description
                    }}
                  />
                </div>
              )}

              {/* Specifications */}
              {selectedVariant && (
                <div className="border-t pt-6 space-y-4">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Specifications</h2>

                  <div className="flex items-center gap-3">
                    <Tag className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="text-sm text-gray-500">Variant SKU</div>
                      <div className="font-medium font-mono">{selectedVariant.sku}</div>
                    </div>
                  </div>

                  {selectedVariant.weight && (
                    <div className="flex items-center gap-3">
                      <Weight className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-500">Weight</div>
                        <div className="font-medium">{selectedVariant.weight}g</div>
                      </div>
                    </div>
                  )}

                  {colorName && (
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-500">Color</div>
                        <div className="font-medium flex items-center gap-2">
                          {colorName}
                          {selectedVariant.hex_color && (
                            <span
                              className="w-4 h-4 rounded-full border border-gray-300"
                              style={{ backgroundColor: selectedVariant.hex_color }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedVariant.size && (
                    <div className="flex items-center gap-3">
                      <Package className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-500">Size</div>
                        <div className="font-medium">{selectedVariant.size}</div>
                      </div>
                    </div>
                  )}

                  {material && (
                    <div className="flex items-center gap-3">
                      <Tag className="w-5 h-5 text-gray-400" />
                      <div>
                        <div className="text-sm text-gray-500">Material</div>
                        <div className="font-medium">{material}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Category */}
              {parentProduct.category && (
                <div className="border-t pt-6 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Category</h2>
                  <Badge variant="outline">{parentProduct.category}</Badge>
                </div>
              )}

              {/* Supplier */}
              {parentProduct.supplier_name && (
                <div className="border-t pt-6 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">Supplier</h2>
                  <span className="text-sm text-gray-600">{parentProduct.supplier_name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
