// src/components/ui/formStyles.ts
// ============================================================================
// CENTRALIZED FORM DESIGN SYSTEM
// ============================================================================
// Shared Tailwind class tokens used across admin UI.
// Keep this file free of React components (required for Fast Refresh).
// ============================================================================

export const formStyles = {
  label:
    'block text-sm font-medium text-gray-700 mb-1',

  input:
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ' +
    'disabled:bg-gray-50 disabled:cursor-not-allowed transition',

  inputError:
    'w-full rounded-lg border border-red-300 px-3 py-2 text-sm ' +
    'focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition',

  select:
    'w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white ' +
    'focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ' +
    'disabled:bg-gray-50 disabled:cursor-not-allowed transition',
}