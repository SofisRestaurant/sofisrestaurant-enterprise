// src/types/profile.ts

export type ProfileRole = 'customer' | 'admin'

export type Profile = {
  id:                string
  role:              ProfileRole
  full_name:         string | null
  phone:             string | null
  created_at?:       string
  updated_at?:       string

  // ── Loyalty system ──────────────────────────────────────────────────────
  /** Spendable point balance (decrements on redemption) */
  loyalty_points:    number
  /** All-time earned points — never decrements, drives tier */
  lifetime_points:   number
  /** VIP tier: bronze | silver | gold | platinum */
  loyalty_tier:      'bronze' | 'silver' | 'gold' | 'platinum'
  /** Consecutive order days */
  loyalty_streak:    number
  /** ISO date string of last confirmed order */
  last_order_date:   string | null
  /**
   * Public-facing random UUID for QR codes.
   * NOT the auth user id. Safe to encode in QR codes shown to customers.
   * Generated server-side — never computed client-side.
   */
  loyalty_public_id: string
}