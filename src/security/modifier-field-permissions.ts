// src/security/modifier-field-permissions.ts
// ============================================================================
// MODIFIER FIELD PERMISSIONS — Security barrel
// ============================================================================
// Re-exports the field-level permission matrix from the domain layer
// through the security module, keeping the security layer as the canonical
// import path for permission checks.
// ============================================================================

export {
  canReadGroupField,
  canWriteGroupField,
  canReadModifierField,
  canWriteModifierField,
  getWritableGroupFields,
  getWritableModifierFields,
  sanitizeGroupPayload,
  sanitizeModifierPayload,
} from '@/domain/menu/modifier.permissions'