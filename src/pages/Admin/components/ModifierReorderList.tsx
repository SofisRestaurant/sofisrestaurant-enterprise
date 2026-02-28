// src/pages/Admin/components/ModifierReorderList.tsx
// ============================================================================
// MODIFIER REORDER LIST
// ============================================================================
// Drag-and-drop reorder for modifier groups on a menu item.
// No external DnD library — uses native HTML5 draggable API to avoid
// adding dependencies. Simple and deterministic.
//
// On drag end, calls onReorder with the new ordered array of group IDs.
// The parent is responsible for persisting the new sort_order via service.
// ============================================================================

import { useState, useCallback }  from 'react'
import type { AdminModifierGroup } from '@/types/admin-menu'
import { DragHandle }              from '@/components/ui/DragHandle'

interface ModifierReorderListProps {
  groups:     AdminModifierGroup[]
  onReorder:  (orderedIds: string[]) => void
  disabled?:  boolean
}

export function ModifierReorderList({ groups, onReorder, disabled = false }: ModifierReorderListProps) {
  const [ordered, setOrdered] = useState<AdminModifierGroup[]>(groups)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)

  // Sync external groups list when it changes
  if (
    groups.length !== ordered.length ||
    groups.some((g, i) => g.id !== ordered[i]?.id)
  ) {
    setOrdered(groups)
  }

  const handleDragStart = useCallback((idx: number) => {
    setDragIdx(idx)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setOverIdx(idx)
  }, [])

  const handleDrop = useCallback(() => {
    if (dragIdx === null || overIdx === null || dragIdx === overIdx) {
      setDragIdx(null)
      setOverIdx(null)
      return
    }

    const next = [...ordered]
    const [moved] = next.splice(dragIdx, 1)
    next.splice(overIdx, 0, moved)

    setOrdered(next)
    setDragIdx(null)
    setOverIdx(null)
    onReorder(next.map((g) => g.id))
  }, [dragIdx, overIdx, ordered, onReorder])

  const handleDragEnd = useCallback(() => {
    setDragIdx(null)
    setOverIdx(null)
  }, [])

  return (
    <div className="space-y-2">
      {ordered.map((group, idx) => (
        <div
          key={group.id}
          draggable={!disabled}
          onDragStart={() => handleDragStart(idx)}
          onDragOver={(e) => handleDragOver(e, idx)}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          className={[
            'flex items-center gap-3 px-4 py-3 bg-white border rounded-lg transition-all select-none',
            dragIdx === idx   ? 'opacity-40 border-dashed border-gray-400' : 'border-gray-200',
            overIdx === idx && dragIdx !== idx ? 'border-amber-400 bg-amber-50' : '',
            disabled ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
          ].filter(Boolean).join(' ')}
        >
          {!disabled && <DragHandle />}

          {/* Sort position badge */}
          <span className="w-6 text-center text-xs text-gray-400 font-mono tabular-nums shrink-0">
            {idx + 1}
          </span>

          {/* Group name */}
          <span className="flex-1 text-sm font-medium text-gray-800 truncate">
            {group.name}
          </span>

          {/* Type badge */}
          <span className="text-xs text-gray-400 capitalize shrink-0">{group.type}</span>

          {/* Required badge */}
          {group.required && (
            <span className="text-xs text-amber-600 font-medium shrink-0">Required</span>
          )}
        </div>
      ))}

      {ordered.length === 0 && (
        <p className="text-xs text-gray-400 text-center py-4">No groups to reorder.</p>
      )}
    </div>
  )
}