// src/pages/Admin/components/ModifierGroupCard.tsx
// ============================================================================
// MODIFIER GROUP CARD
// ============================================================================
// Renders one modifier group in the MenuModifiersTab.
// Features:
//   - Collapsible modifier list
//   - Group-level active toggle
//   - Edit / Delete group actions
//   - Add modifier button
//   - Per-modifier toggle, edit, delete via ModifierCard
//   - Visual badge for type (radio/checkbox/quantity) and required flag
// ============================================================================

import { useState }                 from 'react'
import type { AdminModifierGroup, AdminModifier } from '@/types/admin-menu'
import { ModifierCard }             from './ModifierCard'
import { InlineToggle }             from '@/components/ui/InlineToggle'
import { DragHandle }               from '@/components/ui/DragHandle'

interface ModifierGroupCardProps {
  group:              AdminModifierGroup
  modifiers:          AdminModifier[]
  onEditGroup:        (group: AdminModifierGroup) => void
  onDeleteGroup:      (group: AdminModifierGroup) => void
  onToggleActive:     (group: AdminModifierGroup, active: boolean) => void
  onAddModifier:      (groupId: string) => void
  onEditModifier:     (modifier: AdminModifier) => void
  onDeleteModifier:   (modifier: AdminModifier) => void
  onToggleModifier:   (modifier: AdminModifier, available: boolean) => void
  draggable?:         boolean
  saving?:            boolean
}

const typeBadge: Record<string, string> = {
  radio:    'bg-blue-50 text-blue-700',
  checkbox: 'bg-purple-50 text-purple-700',
  quantity: 'bg-orange-50 text-orange-700',
}

export function ModifierGroupCard({
  group,
  modifiers,
  onEditGroup,
  onDeleteGroup,
  onToggleActive,
  onAddModifier,
  onEditModifier,
  onDeleteModifier,
  onToggleModifier,
  draggable = false,
  saving    = false,
}: ModifierGroupCardProps) {
  const [expanded, setExpanded] = useState(true)

  const availableCount   = modifiers.filter((m) => m.available).length
  const unavailableCount = modifiers.length - availableCount

  return (
    <div className={['rounded-xl border bg-white shadow-sm overflow-hidden', group.active ? 'border-gray-200' : 'border-gray-100 opacity-60'].join(' ')}>

      {/* ── Group header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
        {draggable && <DragHandle />}

        {/* Collapse toggle */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label={expanded ? 'Collapse group' : 'Expand group'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points={expanded ? '2,4 7,9 12,4' : '4,2 9,7 4,12'} />
          </svg>
        </button>

        {/* Name + badges */}
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-gray-900 truncate">{group.name}</span>
          <span className={['text-xs px-2 py-0.5 rounded-full font-medium capitalize', typeBadge[group.type] ?? 'bg-gray-100 text-gray-600'].join(' ')}>
            {group.type}
          </span>
          {group.required && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
              Required
            </span>
          )}
          {group.item_count > 0 && (
            <span className="text-xs text-gray-400">
              {group.item_count} item{group.item_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Modifier count */}
        <span className="text-xs text-gray-400 tabular-nums">
          {modifiers.length} option{modifiers.length !== 1 ? 's' : ''}
          {unavailableCount > 0 && (
            <span className="text-red-400"> · {unavailableCount} off</span>
          )}
        </span>

        {/* Active toggle */}
        <InlineToggle
          checked={group.active}
          onChange={(v) => onToggleActive(group, v)}
          label="Active"
          hideLabel
          disabled={saving}
        />

        {/* Edit */}
        <button
          onClick={() => onEditGroup(group)}
          disabled={saving}
          className="text-xs text-blue-600 hover:underline disabled:opacity-40"
        >
          Edit
        </button>

        {/* Delete */}
        <button
          onClick={() => onDeleteGroup(group)}
          disabled={saving}
          className="text-xs text-red-500 hover:underline disabled:opacity-40"
        >
          Delete
        </button>
      </div>

      {/* ── Modifiers list ────────────────────────────────────────────────── */}
      {expanded && (
        <div className="divide-y divide-gray-50">
          {modifiers.length === 0 ? (
            <p className="px-4 py-3 text-xs text-gray-400 italic">No modifiers yet.</p>
          ) : (
            modifiers.map((mod) => (
              <ModifierCard
                key={mod.id}
                modifier={mod}
                onEdit={onEditModifier}
                onDelete={onDeleteModifier}
                onToggleAvailable={onToggleModifier}
                draggable={false}
                saving={saving}
              />
            ))
          )}

          {/* Add modifier */}
          <div className="px-4 py-2">
            <button
              onClick={() => onAddModifier(group.id)}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium flex items-center gap-1 transition disabled:opacity-40"
            >
              <span aria-hidden="true">+</span> Add Option
            </button>
          </div>
        </div>
      )}
    </div>
  )
}