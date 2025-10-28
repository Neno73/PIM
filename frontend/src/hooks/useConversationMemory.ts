import { useState, useCallback } from 'react'

export interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  vectorStore?: string
}

export interface ConversationContext {
  messages: ConversationMessage[]
  summary?: string
  userPreferences?: {
    preferredVectorStore: 'pgvector' | 'qdrant'
    searchFilters?: Record<string, any>
  }
}

export function useConversationMemory(maxMessages: number = 5) {
  const [context, setContext] = useState<ConversationContext>({
    messages: [],
    userPreferences: {
      preferredVectorStore: 'pgvector'
    }
  })

  const addMessage = useCallback((message: ConversationMessage) => {
    setContext(prev => ({
      ...prev,
      messages: [...prev.messages, message].slice(-maxMessages) // Keep only last N messages
    }))
  }, [maxMessages])

  const getConversationContext = useCallback(() => {
    const recentMessages = context.messages.slice(-3) // Last 3 for context
    return {
      conversation: recentMessages.map(m => ({
        role: m.role,
        content: m.content
      })),
      preferences: context.userPreferences
    }
  }, [context])

  const updateUserPreferences = useCallback((prefs: Partial<ConversationContext['userPreferences']>) => {
    setContext(prev => ({
      ...prev,
      userPreferences: { ...prev.userPreferences, ...prefs }
    }))
  }, [])

  const clearConversation = useCallback(() => {
    setContext(prev => ({
      ...prev,
      messages: []
    }))
  }, [])

  const generateContextPrompt = useCallback(() => {
    const recent = context.messages.slice(-3)
    if (recent.length === 0) return ''

    return `Previous conversation context:\n${recent.map(m =>
      `${m.role}: ${m.content}`
    ).join('\n')}\n\nCurrent query:`
  }, [context.messages])

  return {
    context,
    addMessage,
    getConversationContext,
    updateUserPreferences,
    clearConversation,
    generateContextPrompt,
    hasContext: context.messages.length > 0
  }
}