// src/lib/ui/useScrollLock.ts
import { useEffect, useMemo } from 'react'
import { lockScroll, unlockScroll, type ScrollLockToken } from './scroll-lock'

export type ScrollLockOptions = {
  enabled: boolean
  token?: string
}

export function useScrollLock(options: ScrollLockOptions): void {
  const { enabled, token } = options

  const stableToken = useMemo<ScrollLockToken>(() => {
    return token && token.trim().length ? token : `hook_${Math.random().toString(16).slice(2)}`
  }, [token])

  useEffect(() => {
    if (!enabled) return
    const t = lockScroll(stableToken)
    return () => unlockScroll(t)
  }, [enabled, stableToken])
}