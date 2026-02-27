// src/components/ui/hooks/useModalEscape.ts
import { useEffect } from 'react'

/**
 * Calls `onEscape` when the user presses the Escape key.
 * Only attaches the listener when `active` is true.
 */
export function useModalEscape(onEscape: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return

    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onEscape()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onEscape, active])
}