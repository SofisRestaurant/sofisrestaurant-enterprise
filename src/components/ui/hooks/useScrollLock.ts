// src/components/ui/hooks/useScrollLock.ts
import { useEffect } from 'react'

/**
 * Locks body scroll when `active` is true.
 * Compensates for scrollbar width to prevent layout shift.
 */
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return

    const scrollY        = window.scrollY
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    Object.assign(document.body.style, {
      overflow:     'hidden',
      paddingRight: `${scrollbarWidth}px`,
      position:     'fixed',
      top:          `-${scrollY}px`,
      width:        '100%',
    })

    return () => {
      Object.assign(document.body.style, {
        overflow: '', paddingRight: '', position: '', top: '', width: '',
      })
      window.scrollTo(0, scrollY)
    }
  }, [active])
}