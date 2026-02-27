// src/features/auth/components/index.ts
// =============================================================================
// AUTH COMPONENTS — Barrel export (2026)
// =============================================================================
// ModalShell is NOT re-exported here — it lives at @/components/ui/ModalShell.
// Exporting it here caused 'ModalShell refers to a value, used as a type'
// errors in files that imported it expecting a React component, not a type alias.
//
// Removed from legacy version:
//   • AuthModal          — file does not exist
//   • LoginForm          — file does not exist
//   • AuthModals as type — it is a value (React component), never a type
//   • CartItem/CartStore  — belong in @/features/cart, not here
//   • MenuItem           — belongs in @/types/menu, not here
// =============================================================================

// Default exports (wrap in named re-export for consistent import style)
export { default as LoginModal }          from './LoginModal'
export { default as SignupModal }         from './SignupModal'
export { default as ForgotPasswordModal } from './ForgotPasswordModal'
export { default as AuthModals }          from './AuthModals'

// Named export
export { SignupForm } from './SignupForm'

// Type export
export type { AuthModalKey } from './AuthModals'