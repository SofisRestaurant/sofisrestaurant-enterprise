// src/lib/cache/profileCache.ts
import type { Profile } from '@/types/profile'

const KEY = 'sofis.profile.v1'
const TTL_MS = 1000 * 60 * 60 * 24 // 24 hours

type CachedProfile = {
  v: 1
  savedAt: number
  profile: Profile
}

export function loadProfileCache(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CachedProfile

    if (!parsed || parsed.v !== 1) return null
    if (!parsed.profile) return null

    // TTL check
    const age = Date.now() - parsed.savedAt
    if (age > TTL_MS) {
      localStorage.removeItem(KEY)
      return null
    }

    return parsed.profile
  } catch {
    return null
  }
}

export function saveProfileCache(profile: Profile): void {
  try {
    const payload: CachedProfile = {
      v: 1,
      savedAt: Date.now(),
      profile,
    }
    localStorage.setItem(KEY, JSON.stringify(payload))
  } catch {
    // ignore (private mode / storage full / SSR)
  }
}

export function clearProfileCache(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}