// src/pages/Admin/components/ModifierEmptyState.tsx
// ============================================================================
// MODIFIER EMPTY STATE
// ============================================================================
// Shown when a menu item has no modifier groups assigned.
// Provides clear CTAs to add from scratch or use a template.
// ============================================================================

interface ModifierEmptyStateProps {
  onAddGroup:      () => void
  onAddTemplate:   () => void
}

export function ModifierEmptyState({ onAddGroup, onAddTemplate }: ModifierEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      {/* Illustration */}
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <span className="text-3xl" aria-hidden="true">🎛</span>
      </div>

      <h3 className="text-base font-semibold text-gray-800 mb-1">
        No modifier groups yet
      </h3>
      <p className="text-sm text-gray-500 max-w-xs mb-8 leading-relaxed">
        Modifier groups let customers customize this item — choose a protein,
        add-ons, size, sauce, and more.
      </p>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={onAddTemplate}
          className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
        >
          <span aria-hidden="true">📋</span>
          Use a Template
        </button>
        <button
          onClick={onAddGroup}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-black text-white rounded-lg text-sm font-semibold hover:opacity-90 transition"
        >
          <span aria-hidden="true">+</span>
          Add Modifier Group
        </button>
      </div>

      {/* Help text */}
      <p className="mt-6 text-xs text-gray-400">
        Templates let you reuse common groups like &quot;Protein Choice&quot; or &quot;Sauces&quot; instantly.
      </p>
    </div>
  )
}