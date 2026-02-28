// src/types/index.ts
// ============================================================================
// CENTRAL TYPE BARREL
// ============================================================================
// Re-exports from the real source-of-truth files.
// Import paths verified against actual file structure (Feb 2026).
// ============================================================================

// ============================================================================
// DOMAIN TYPES
// ============================================================================
export type { CartItem } from '@/features/cart/cart.types'
// Menu — source of truth is src/types/menu.ts
export type { 
  MenuItem, 
  MenuCategory, 
  ModifierGroup, 
  Modifier 
} from '@/domain/menu/menu.types'

// Cart store interface
export type { CartStore, AddToCartPayload } from '@/features/cart/cart.types'

// ============================================================================
// USER / AUTH
// ============================================================================

export type {
  AppUser,
  UserRole,
  UserContextValue,
} from '@/contexts/userTypes'

// Compatibility alias — existing code that imports `User` keeps working
export type { AppUser as User } from '@/contexts/userTypes'

// ============================================================================
// SECURITY
// ============================================================================

export type { Permission } from '@/security/permissions'

// ============================================================================
// COMMON QUERY / PAGINATION
// ============================================================================

export interface ApiResponse<T = unknown> {
  ok:       boolean
  data?:    T
  error?:   string
  message?: string
}

export interface PaginationMeta {
  page:       number
  perPage:    number
  total:      number
  totalPages: number
}

export interface PaginatedResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export type SortDirection = 'asc' | 'desc'

export interface SortConfig {
  field:     string
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
  field:    string
  operator: FilterOperator
  value:    unknown
}

export interface QueryParams {
  page?:     number
  perPage?:  number
  sort?:     SortConfig
  filters?:  FilterConfig[]
  search?:   string
}

// ============================================================================
// FORM
// ============================================================================

export interface FieldError {
  field:   string
  message: string
}

export interface FormState<T> {
  data:         T
  errors:       FieldError[]
  isSubmitting: boolean
  isValid:      boolean
}

// ============================================================================
// ASYNC
// ============================================================================

export type LoadingState = 'idle' | 'loading' | 'success' | 'error'

export interface AsyncState<T = unknown> {
  status: LoadingState
  data:   T | null
  error:  string | null
}

// ============================================================================
// SCALARS
// ============================================================================

export type DateString = string
export type TimeString = string

// ============================================================================
// CONTACT
// ============================================================================

export interface Address {
  street:   string
  city:     string
  state:    string
  zipCode:  string
  country?: string
}

export interface ContactInfo {
  email:    string
  phone?:   string
  address?: Address
}