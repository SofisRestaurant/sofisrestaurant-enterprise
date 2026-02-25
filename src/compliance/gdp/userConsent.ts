// src/compliance/gdp/userConsent.ts
export interface ConsentPreferences {
  necessary: boolean // Always true, can't be disabled
  analytics: boolean
  marketing: boolean
  personalization: boolean
}

export const defaultConsent: ConsentPreferences = {
  necessary: true,
  analytics: false,
  marketing: false,
  personalization: false,
}

export function saveConsent(preferences: ConsentPreferences): void {
  localStorage.setItem('user_consent', JSON.stringify({
    ...preferences,
    timestamp: new Date().toISOString(),
  }))
}

export function getConsent(): ConsentPreferences | null {
  const stored = localStorage.getItem('user_consent')
  if (!stored) return null
  
  try {
    const parsed = JSON.parse(stored)
    return {
      necessary: parsed.necessary ?? true,
      analytics: parsed.analytics ?? false,
      marketing: parsed.marketing ?? false,
      personalization: parsed.personalization ?? false,
    }
  } catch {
    return null
  }
}

export function hasConsent(): boolean {
  return getConsent() !== null
}