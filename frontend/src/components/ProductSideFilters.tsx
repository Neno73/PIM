'use client'

import { useState, useEffect } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { X, ChevronDown, ChevronRight } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'

interface FilterSection {
  name: string
  isOpen: boolean
}

interface ProductSideFiltersProps {
  selectedColors: string[]
  onColorChange: (colors: string[]) => void
  weightRange: [number, number]
  onWeightChange: (range: [number, number]) => void
  isActive: boolean | null
  onActiveChange: (value: boolean | null) => void
  onClearAll: () => void
}

export function ProductSideFilters({
  selectedColors,
  onColorChange,
  weightRange,
  onWeightChange,
  isActive,
  onActiveChange,
  onClearAll,
}: ProductSideFiltersProps) {
  const { extractText } = useLanguage()
  const [sections, setSections] = useState<Record<string, boolean>>({
    status: true,
    colors: true,
    weight: true,
  })
  const [availableColors, setAvailableColors] = useState<string[]>([])

  // Fetch available colors
  useEffect(() => {
    const fetchColors = async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7337/api'
        const response = await fetch(`${apiUrl}/products?pagination[limit]=1000&fields[0]=color_name`)
        const data = await response.json()

        // Extract unique colors
        const colors = new Set<string>()
        data.data?.forEach((product: any) => {
          const color = extractText(product.color_name)
          if (color) colors.add(color)
        })

        setAvailableColors(Array.from(colors).sort())
      } catch (error) {
        console.error('Error fetching colors:', error)
      }
    }

    fetchColors()
  }, [extractText])

  const toggleSection = (section: string) => {
    setSections(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const handleColorToggle = (color: string) => {
    if (selectedColors.includes(color)) {
      onColorChange(selectedColors.filter(c => c !== color))
    } else {
      onColorChange([...selectedColors, color])
    }
  }

  const hasActiveFilters = selectedColors.length > 0 || isActive !== null ||
    (weightRange[0] > 0 || weightRange[1] < 10000)

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Filters</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearAll}
            className="text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Status Filter */}
      <div className="mb-4 pb-4 border-b">
        <button
          onClick={() => toggleSection('status')}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          <span>Product Status</span>
          {sections.status ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {sections.status && (
          <div className="space-y-2 mt-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="active"
                checked={isActive === true}
                onCheckedChange={() => onActiveChange(isActive === true ? null : true)}
              />
              <Label htmlFor="active" className="text-sm cursor-pointer">
                Active Products
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="inactive"
                checked={isActive === false}
                onCheckedChange={() => onActiveChange(isActive === false ? null : false)}
              />
              <Label htmlFor="inactive" className="text-sm cursor-pointer">
                Inactive Products
              </Label>
            </div>
          </div>
        )}
      </div>

      {/* Colors Filter */}
      <div className="mb-4 pb-4 border-b">
        <button
          onClick={() => toggleSection('colors')}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          <span>Colors {selectedColors.length > 0 && `(${selectedColors.length})`}</span>
          {sections.colors ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {sections.colors && (
          <div className="space-y-2 mt-2 max-h-48 overflow-y-auto">
            {availableColors.slice(0, 20).map((color) => (
              <div key={color} className="flex items-center space-x-2">
                <Checkbox
                  id={`color-${color}`}
                  checked={selectedColors.includes(color)}
                  onCheckedChange={() => handleColorToggle(color)}
                />
                <Label htmlFor={`color-${color}`} className="text-sm cursor-pointer">
                  {color}
                </Label>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Weight Filter */}
      <div className="mb-4">
        <button
          onClick={() => toggleSection('weight')}
          className="flex items-center justify-between w-full text-sm font-medium mb-2"
        >
          <span>Weight (g)</span>
          {sections.weight ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {sections.weight && (
          <div className="mt-4">
            <Slider
              min={0}
              max={10000}
              step={50}
              value={weightRange}
              onValueChange={(value) => onWeightChange(value as [number, number])}
              className="mb-2"
            />
            <div className="flex items-center justify-between text-xs text-gray-600">
              <span>{weightRange[0]}g</span>
              <span>{weightRange[1]}g</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
