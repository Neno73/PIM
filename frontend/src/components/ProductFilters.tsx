'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface ProductFiltersProps {
  onSearch: (query: string) => void
  onCategoryChange: (category: string) => void
  selectedCategory: string
}

interface Category {
  id: number
  documentId: string
  name: string | { en?: string; nl?: string; de?: string }
}

export function ProductFilters({
  onSearch,
  onCategoryChange,
  selectedCategory,
}: ProductFiltersProps) {
  const [searchInput, setSearchInput] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const { extractText } = useLanguage()

  // Fetch categories
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7337/api'
        const response = await fetch(`${apiUrl}/categories?pagination[limit]=100`)
        const data = await response.json()
        setCategories(data.data || [])
      } catch (error) {
        console.error('Error fetching categories:', error)
      }
    }

    fetchCategories()
  }, [])

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch(searchInput)
    }, 500)

    return () => clearTimeout(timer)
  }, [searchInput, onSearch])

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex flex-col md:flex-row gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            type="text"
            placeholder="Search products by name..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Category Filter */}
        <div className="w-full md:w-64">
          <Select value={selectedCategory} onValueChange={onCategoryChange}>
            <SelectTrigger>
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => {
                const categoryName = extractText(category.name) || 'Unnamed Category'
                return (
                  <SelectItem key={category.id} value={categoryName}>
                    {categoryName}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Active Filters Display */}
      {(searchInput || selectedCategory !== 'all') && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-sm text-gray-500">Active filters:</span>
          {searchInput && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
              Search: "{searchInput}"
            </span>
          )}
          {selectedCategory !== 'all' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
              Category: {selectedCategory}
            </span>
          )}
          <button
            onClick={() => {
              setSearchInput('')
              onCategoryChange('all')
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline ml-2"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  )
}
