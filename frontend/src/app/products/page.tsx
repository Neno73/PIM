'use client'

import { useState, useEffect } from 'react'
import { ProductCard } from '@/components/ProductCard'
import { ProductFilters } from '@/components/ProductFilters'
import { ProductSideFilters } from '@/components/ProductSideFilters'
import { LanguageSelector } from '@/components/LanguageSelector'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'

interface ParentProduct {
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

interface PaginationMeta {
  page: number
  pageSize: number
  pageCount: number
  total: number
}

export default function ProductsPage() {
  const [products, setProducts] = useState<ParentProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    pageCount: 1,
    total: 0,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [weightRange, setWeightRange] = useState<[number, number]>([0, 10000])
  const [isActive, setIsActive] = useState<boolean | null>(null)

  const fetchProducts = async (
    page = 1,
    search = '',
    category = 'all',
    colors: string[] = [],
    weight: [number, number] = [0, 10000],
    activeFilter: boolean | null = null
  ) => {
    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7337/api'

      // Build query params for parent-products with variants populated
      let url = `${apiUrl}/parent-products?pagination[page]=${page}&pagination[pageSize]=20&populate[variants][populate][0]=primary_image&fields[0]=sku&fields[1]=a_number&fields[2]=supplier_name&fields[3]=brand&fields[4]=category&fields[5]=total_variants_count`

      if (search) {
        // Search by SKU, brand, or supplier name
        url += `&filters[$or][0][sku][$containsi]=${encodeURIComponent(search)}`
        url += `&filters[$or][1][brand][$containsi]=${encodeURIComponent(search)}`
        url += `&filters[$or][2][supplier_name][$containsi]=${encodeURIComponent(search)}`
      }

      if (category && category !== 'all') {
        url += `&filters[category][$eq]=${encodeURIComponent(category)}`
      }

      // Note: Color and weight filters would need to be applied to variants
      // For now, we'll keep them in the URL structure but they won't work on parent-products
      // TODO: Implement variant-level filtering

      const response = await fetch(url)
      const data = await response.json()

      setProducts(data.data || [])
      setPagination(data.meta?.pagination || {
        page: 1,
        pageSize: 20,
        pageCount: 1,
        total: 0,
      })
    } catch (error) {
      console.error('Error fetching parent products:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProducts(1, searchQuery, selectedCategory, selectedColors, weightRange, isActive)
  }, [searchQuery, selectedCategory, selectedColors, weightRange, isActive])

  const handlePageChange = (newPage: number) => {
    fetchProducts(newPage, searchQuery, selectedCategory, selectedColors, weightRange, isActive)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
  }

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category)
  }

  const handleColorChange = (colors: string[]) => {
    setSelectedColors(colors)
  }

  const handleWeightChange = (range: [number, number]) => {
    setWeightRange(range)
  }

  const handleActiveChange = (value: boolean | null) => {
    setIsActive(value)
  }

  const handleClearAllFilters = () => {
    setSelectedColors([])
    setWeightRange([0, 10000])
    setIsActive(null)
    setSearchQuery('')
    setSelectedCategory('all')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Products</h1>
              <p className="mt-2 text-sm text-gray-600">
                Browse our collection of {pagination.total} products
              </p>
            </div>
            <LanguageSelector />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Top Filters */}
        <ProductFilters
          onSearch={handleSearch}
          onCategoryChange={handleCategoryChange}
          selectedCategory={selectedCategory}
        />

        {/* Main Content Area with Side Filters */}
        <div className="flex gap-6 mt-8">
          {/* Side Filters */}
          <aside className="hidden lg:block w-64 flex-shrink-0">
            <ProductSideFilters
              selectedColors={selectedColors}
              onColorChange={handleColorChange}
              weightRange={weightRange}
              onWeightChange={handleWeightChange}
              isActive={isActive}
              onActiveChange={handleActiveChange}
              onClearAll={handleClearAllFilters}
            />
          </aside>

          {/* Products Content */}
          <div className="flex-1">
            {/* Loading State */}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="space-y-4">
                    <Skeleton className="h-48 w-full rounded-lg" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No products found</p>
                <p className="text-gray-400 text-sm mt-2">
                  Try adjusting your filters or search query
                </p>
              </div>
            ) : (
              <>
                {/* Products Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>

                {/* Pagination */}
                {pagination.pageCount > 1 && (
                  <div className="mt-12 flex justify-center">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                            className={
                              pagination.page === 1
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>

                        {/* First page */}
                        {pagination.page > 2 && (
                          <>
                            <PaginationItem>
                              <PaginationLink
                                onClick={() => handlePageChange(1)}
                                className="cursor-pointer"
                              >
                                1
                              </PaginationLink>
                            </PaginationItem>
                            {pagination.page > 3 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                          </>
                        )}

                        {/* Current and nearby pages */}
                        {[...Array(pagination.pageCount)].map((_, i) => {
                          const pageNum = i + 1
                          if (
                            pageNum === pagination.page ||
                            pageNum === pagination.page - 1 ||
                            pageNum === pagination.page + 1
                          ) {
                            return (
                              <PaginationItem key={pageNum}>
                                <PaginationLink
                                  onClick={() => handlePageChange(pageNum)}
                                  isActive={pageNum === pagination.page}
                                  className="cursor-pointer"
                                >
                                  {pageNum}
                                </PaginationLink>
                              </PaginationItem>
                            )
                          }
                          return null
                        })}

                        {/* Last page */}
                        {pagination.page < pagination.pageCount - 1 && (
                          <>
                            {pagination.page < pagination.pageCount - 2 && (
                              <PaginationItem>
                                <PaginationEllipsis />
                              </PaginationItem>
                            )}
                            <PaginationItem>
                              <PaginationLink
                                onClick={() => handlePageChange(pagination.pageCount)}
                                className="cursor-pointer"
                              >
                                {pagination.pageCount}
                              </PaginationLink>
                            </PaginationItem>
                          </>
                        )}

                        <PaginationItem>
                          <PaginationNext
                            onClick={() =>
                              handlePageChange(Math.min(pagination.pageCount, pagination.page + 1))
                            }
                            className={
                              pagination.page === pagination.pageCount
                                ? 'pointer-events-none opacity-50'
                                : 'cursor-pointer'
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
