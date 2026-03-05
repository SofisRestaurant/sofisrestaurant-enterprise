// src/lib/ui/scroll-lock.ts
export type ScrollLockToken = string

type Snapshot = {
  bodyOverflow: string
  htmlOverflow: string
  bodyPaddingRight: string
}

type LockState = {
  count: number
  snapshot: Snapshot | null
  tokens: Set<string>
}

declare global {
  // eslint-disable-next-line no-var
  var __sofisScrollLock: LockState | undefined
}

function getState(): LockState {
  if (!globalThis.__sofisScrollLock) {
    globalThis.__sofisScrollLock = { count: 0, snapshot: null, tokens: new Set() }
  }
  return globalThis.__sofisScrollLock
}

function measureScrollbarWidth(): number {
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth)
}

export function lockScroll(token: ScrollLockToken): ScrollLockToken {
  const st = getState()
  const t = token?.trim() ? token.trim() : `lock_${Math.random().toString(16).slice(2)}`
  if (st.tokens.has(t)) return t

  st.tokens.add(t)
  st.count += 1

  if (st.count !== 1) return t

  st.snapshot = {
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    bodyPaddingRight: document.body.style.paddingRight,
  }

  const sw = measureScrollbarWidth()
  if (sw > 0) document.body.style.paddingRight = `${sw}px`

  document.documentElement.style.overflow = 'hidden'
  document.body.style.overflow = 'hidden'

  return t
}

export function unlockScroll(token: ScrollLockToken): void {
  const st = getState()
  const t = token?.trim() ? token.trim() : ''
  if (!t) return
  if (!st.tokens.has(t)) return

  st.tokens.delete(t)
  st.count = Math.max(0, st.count - 1)

  if (st.count !== 0) return

  const snap = st.snapshot
  st.snapshot = null

  if (snap) {
    document.body.style.overflow = snap.bodyOverflow
    document.documentElement.style.overflow = snap.htmlOverflow
    document.body.style.paddingRight = snap.bodyPaddingRight
  } else {
    document.body.style.overflow = ''
    document.documentElement.style.overflow = ''
    document.body.style.paddingRight = ''
  }
}

export function forceUnlockScroll(): void {
  const st = getState()
  st.count = 0
  st.tokens.clear()
  st.snapshot = null
  document.body.style.overflow = ''
  document.documentElement.style.overflow = ''
  document.body.style.paddingRight = ''
}

export function getScrollLockDebug() {
  const st = getState()
  return { count: st.count, tokens: Array.from(st.tokens) }
}