
export type LoyaltyTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export interface TierConfig {
  // ── Core business logic ─────────────────────────────────────────────────
  /** Display name */
  label:      string
  /** Emoji icon */
  icon:       string
  /** Points multiplier applied to base earn rate */
  multiplier: number
  /** Lifetime points required to enter this tier */
  threshold:  number
  /** Lifetime points required to reach the next tier (null = max tier) */
  nextAt:     number | null

  // ── Tailwind classes (light theme) ──────────────────────────────────────
  colors: {
    /** Text color for and values */
    text:   string
    /** Background color for badges and containers */
    bg:     string
    /** Border color */
    border: string
  }
  /** Card gradient (bg-gradient-to-br) */
  gradient: string
  /** Focus ring for tier card */
  ring:     string
  /** Inline badge classes (text + bg + border combined) */
  badge:    string
  /** Progress bar fill gradient */
  bar:      string
  /** Box shadow glow class */
  glow:     string

  // ── QR code hex colors ───────────────────────────────────────────────────
  qr: {
    /** Foreground / module color */
    fg: string
    /** Background color */
    bg: string
  }

  // ── Dark theme (OrderSuccess, LoyaltyScan) ───────────────────────────────
  dark: {
    /** Text color on dark backgrounds */
    text: string
  }
}

export const LOYALTY_TIERS: Record<LoyaltyTier, TierConfig> = {
  bronze: {
    label:      'Bronze',
    icon:       '🥉',
    multiplier: 1.0,
    threshold:  0,
    nextAt:     500,

    colors: {
      text:   'text-amber-700',
      bg:     'bg-amber-50',
      border: 'border-amber-200',
    },
    gradient: 'from-amber-700 via-amber-600 to-amber-500',
    ring:     'ring-amber-600/40',
    badge:    'bg-amber-50 text-amber-800 border-amber-200',
    bar:      'bg-gradient-to-r from-amber-600 to-amber-400',
    glow:     'shadow-amber-200',

    qr: {
      fg: '#92400E',
      bg: '#FFFBEB',
    },

    dark: {
      text: 'text-amber-500',
    },
  },

  silver: {
    label:      'Silver',
    icon:       '🥈',
    multiplier: 1.25,
    threshold:  500,
    nextAt:     2000,

    colors: {
      text:   'text-slate-600',
      bg:     'bg-slate-50',
      border: 'border-slate-200',
    },
    gradient: 'from-slate-500 via-slate-400 to-slate-300',
    ring:     'ring-slate-400/40',
    badge:    'bg-slate-50 text-slate-700 border-slate-200',
    bar:      'bg-gradient-to-r from-slate-500 to-slate-300',
    glow:     'shadow-slate-200',

    qr: {
      fg: '#374151',
      bg: '#F9FAFB',
    },

    dark: {
      text: 'text-slate-300',
    },
  },

  gold: {
    label:      'Gold',
    icon:       '🥇',
    multiplier: 1.5,
    threshold:  2000,
    nextAt:     5000,

    colors: {
      text:   'text-yellow-700',
      bg:     'bg-yellow-50',
      border: 'border-yellow-200',
    },
    gradient: 'from-yellow-600 via-amber-500 to-yellow-400',
    ring:     'ring-yellow-500/40',
    badge:    'bg-yellow-50 text-yellow-800 border-yellow-200',
    bar:      'bg-gradient-to-r from-yellow-500 to-amber-400',
    glow:     'shadow-yellow-200',

    qr: {
      fg: '#78350F',
      bg: '#FFFDE7',
    },

    dark: {
      text: 'text-yellow-400',
    },
  },

  platinum: {
    label:      'Platinum',
    icon:       '💎',
    multiplier: 2.0,
    threshold:  5000,
    nextAt:     null, // maximum tier

    colors: {
      text:   'text-blue-700',
      bg:     'bg-blue-50',
      border: 'border-blue-200',
    },
    gradient: 'from-blue-900 via-blue-700 to-indigo-500',
    ring:     'ring-blue-500/40',
    badge:    'bg-blue-50 text-blue-800 border-blue-200',
    bar:      'bg-gradient-to-r from-blue-700 to-indigo-500',
    glow:     'shadow-blue-200',

    qr: {
      fg: '#1E3A5F',
      bg: '#EFF6FF',
    },

    dark: {
      text: 'text-blue-400',
    },
  },
}

// ============================================================================
// HELPERS
// ============================================================================

/** Ordered array of tiers from lowest to highest */
export const TIER_ORDER: LoyaltyTier[] = ['bronze', 'silver', 'gold', 'platinum']

/**
 * Returns the next tier above the given one, or null if already platinum.
 */
export function getNextTier(tier: LoyaltyTier): LoyaltyTier | null {
  const idx = TIER_ORDER.indexOf(tier)
  return idx < TIER_ORDER.length - 1 ? TIER_ORDER[idx + 1] : null
}

/**
 * Safely resolves a string from the DB to a LoyaltyTier, falling back to bronze.
 * Use this whenever you have a string from loyalty_transactions.tier_at_time.
 */
export function asTier(value: string | null | undefined): LoyaltyTier {
  if (value && value in LOYALTY_TIERS) return value as LoyaltyTier
  return 'bronze'
}