'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type Language = 'en' | 'nl' | 'de'

interface LanguageContextType {
  language: Language
  setLanguage: (lang: Language) => void
  extractText: (field: any) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('en')

  const extractText = (field: any): string => {
    if (!field) return ''
    if (typeof field === 'string') return field
    if (typeof field === 'object') {
      // Try selected language first, then fallback to en, nl, de
      return field[language] || field.en || field.nl || field.de || ''
    }
    return ''
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, extractText }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
