'use client'

import { useRef } from 'react'
import { Button } from './button'
import { Upload } from 'lucide-react'

interface UploadButtonProps {
  onFileSelect: (file: File) => void
  accept?: string
  className?: string
  children?: React.ReactNode
}

export function UploadButton({
  onFileSelect,
  accept = "image/*",
  className = "",
  children
}: UploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onFileSelect(file)
    }
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        onClick={handleClick}
        variant="outline"
        size="sm"
        className={`gap-2 ${className}`}
      >
        <Upload className="size-4" />
        {children || "Upload Image"}
      </Button>
    </>
  )
}