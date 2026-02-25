// src/types/index.ts

// ============================================================================
// DOMAIN TYPES (truth)
// ============================================================================

// Menu
export type { MenuItem, MenuCategory } from './menu'

// Orders
export type { Order } from './order'

// Stripe
export type { StripeCheckoutSession } from './stripe'

// ============================================================================
// FEATURE TYPES
// ============================================================================

// Cart
export type { CartItem, CartStore } from '@/features/cart/cart.types'

// Checkout
export type {
  CheckoutData,
  CheckoutSession,
  CheckoutError,
  CheckoutItem,
} from '@/features/checkout/checkout.types'

// ============================================================================
// USER / AUTH
// ============================================================================

export type {
  AppUser,
  UserRole,
  UserContextValue,
} from '@/contexts/userTypes'

// compatibility alias
export type { AppUser as User } from '@/contexts/userTypes'

// ============================================================================
// SECURITY
// ============================================================================

export type { Permission } from '@/security/permissions'

// ============================================================================
// COMMON
// ============================================================================

export interface ApiResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginationMeta {
  page: number
  perPage: number
  total: number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field: string
  direction: SortDirection
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'like'
  | 'in'

export interface FilterConfig {
  field: string
  operator: FilterOperator
  value: unknown
}

export interface QueryParams {
  page?: number
  perPage?: number
  sort?: SortConfig
  filters?: FilterConfig[]
  search?: string
}

// ============================================================================
// FORM
// ============================================================================

export interface FieldError {
  field: string
  message: string
}

export interface FormState<T> {
  data: T
  errors: FieldError[]
  isSubmitting: boolean
  isValid: boolean
}

// ============================================================================
// ASYNC
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T = unknown> {
  status: LoadingState
  data: T | null
  error: string | null
}

// ============================================================================

export type DateString = string
export type TimeString = string

// ============================================================================

export interface Address {
  street: string
  city: string
  state: string
  zipCode: string
  country?: string
}

export interface ContactInfo {
  email: string
  phone?: string
  address?: Address
}

export {}