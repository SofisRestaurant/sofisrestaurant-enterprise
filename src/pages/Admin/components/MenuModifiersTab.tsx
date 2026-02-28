// src/pages/Admin/components/MenuModifiersTab.tsx
// ============================================================================
// MENU MODIFIERS TAB
// ============================================================================
// Complete modifier management interface for a single menu item.
//
// Features:
//   - List all modifier groups with their modifiers
//   - Add / edit / delete groups (via ModifierGroupModal)
//   - Add / edit / delete individual modifiers (via ModifierModal)
//   - Toggle group active / modifier available
//   - Drag-and-drop reorder (via ModifierReorderList panel)
//   - Template library (via ModifierTemplateLibrary)
//   - Realtime sync (via useModifierRealtime)
//   - Optimistic updates on toggles
//   - Confirm dialog on delete
//
// Data flow:
//   Parent passes menuItemId → this tab owns all modifier data loading
//   Write ops go through ModifierGroupService / ModifierService directly
// ============================================================================

import { useEffect, useState, useCallback } from 'react'
import { ModifierGroupService }       from '@/services/modifier-group.service'
import { ModifierService }            from '@/services/modifier.service'
import { ModifierTemplateService }    from '@/services/modifier-template.service'
import { useModifierRealtime }        from '@/hooks/useModifierRealtime'
import { ModifierGroupCard }          from './ModifierGroupCard'
import { ModifierGroupModal }         from './ModifierGroupModal'
import { ModifierModal }              from './ModifierModal'
import { ModifierReorderList }        from './ModifierReorderList'
import { ModifierEmptyState }         from './ModifierEmptyState'
import { ModifierTemplateLibrary }    from './ModifierTemplateLibrary'
import { ConfirmDialog }              from '@/components/ui/ConfirmDialog'
import { ErrorBanner }                from '@/components/ui/ErrorBanner'
import { AsyncButton }                from '@/components/ui/AsyncButton'
import type { AdminModifierGroup, AdminModifier, ModifierGroupWritePayload, ModifierWritePayload } from '@/types/admin-menu'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ActivePanel = 'groups' | 'reorder' | 'templates'

interface MenuModifiersTabProps {
  menuItemId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function MenuModifiersTab({ menuItemId }: MenuModifiersTabProps) {
  // ── Data state ─────────────────────────────────────────────────────────────
  const [groups,    setGroups]    = useState<AdminModifierGroup[]>([])
  const [modifiers, setModifiers] = useState<Record<string, AdminModifier[]>>({}) // groupId → []
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)

  // ── UI state ────────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<ActivePanel>('groups')

  // ── Modal state — groups ────────────────────────────────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup,   setEditingGroup]   = useState<AdminModifierGroup | null>(null)

  // ── Modal state — modifiers ─────────────────────────────────────────────────
  const [modifierModalOpen, setModifierModalOpen] = useState(false)
  const [editingModifier,   setEditingModifier]   = useState<AdminModifier | null>(null)
  const [targetGroupId,     setTargetGroupId]     = useState<string | null>(null)

  // ── Confirm dialog ──────────────────────────────────────────────────────────
  const [confirmOpen,    setConfirmOpen]    = useState(false)
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmTitle,   setConfirmTitle]   = useState('')
  const [confirmAction,  setConfirmAction]  = useState<() => Promise<void>>(() => async () => {})
  const [confirmLoading, setConfirmLoading] = useState(false)

  // ─────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const gs = await ModifierGroupService.getForMenuItem(menuItemId)
      setGroups(gs)

      // Load modifiers for each group in parallel
      const entries = await Promise.all(
        gs.map(async (g) => {
          const mods = await ModifierService.getForGroup(g.id)
          return [g.id, mods] as [string, AdminModifier[]]
        })
      )
      setModifiers(Object.fromEntries(entries))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modifiers')
    } finally {
      setLoading(false)
    }
  }, [menuItemId])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime sync
  // ─────────────────────────────────────────────────────────────────────────

  useModifierRealtime({
    menuItemId,
    onAnyChange: () => loadGroups(),
    enabled: true,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Confirm helper
  // ─────────────────────────────────────────────────────────────────────────

  function confirm(title: string, message: string, action: () => Promise<void>) {
    setConfirmTitle(title)
    setConfirmMessage(message)
    setConfirmAction(() => action)
    setConfirmOpen(true)
  }

  async function runConfirm() {
    setConfirmLoading(true)
    try {
      await confirmAction()
      setConfirmOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Operation failed')
      setConfirmOpen(false)
    } finally {
      setConfirmLoading(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Group actions
  // ─────────────────────────────────────────────────────────────────────────

  function openCreateGroup() {
    setEditingGroup(null)
    setGroupModalOpen(true)
  }

  function openEditGroup(group: AdminModifierGroup) {
    setEditingGroup(group)
    setGroupModalOpen(true)
  }

  async function handleSaveGroup(payload: ModifierGroupWritePayload) {
    if (editingGroup) {
      const updated = await ModifierGroupService.update(editingGroup.id, payload)
      setGroups((p) => p.map((g) => g.id === updated.id ? updated : g))
    } else {
      // Create group then attach to menu item
      const created = await ModifierGroupService.create(payload)
      await ModifierGroupService.attachToMenuItem({
        menu_item_id: menuItemId,
        modifier_group_id: created.id,
        sort_order: groups.length,
      })
      setGroups((p) => [...p, created])
      setModifiers((p) => ({ ...p, [created.id]: [] }))
    }
  }

  function handleDeleteGroup(group: AdminModifierGroup) {
    const modCount = (modifiers[group.id] ?? []).length
    confirm(
      'Delete Group',
      `Delete "${group.name}"${modCount > 0 ? ` and its ${modCount} option${modCount !== 1 ? 's' : ''}` : ''}? This cannot be undone.`,
      async () => {
        await ModifierService.deleteAllInGroup(group.id)
        await ModifierGroupService.detachFromMenuItem(menuItemId, group.id)
        await ModifierGroupService.delete(group.id)
        setGroups((p) => p.filter((g) => g.id !== group.id))
        setModifiers((p) => {
          const next = { ...p }
          delete next[group.id]
          return next
        })
      }
    )
  }

  async function handleToggleGroup(group: AdminModifierGroup, active: boolean) {
    setSaving(true)
    try {
      await ModifierGroupService.toggleActive(group.id, active)
      setGroups((p) => p.map((g) => g.id === group.id ? { ...g, active } : g))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  async function handleGroupReorder(orderedIds: string[]) {
    const items = orderedIds.map((id, i) => ({ id, sort_order: i }))
    await ModifierGroupService.reorderForMenuItem(menuItemId, items)
    const reordered = orderedIds.map((id) => groups.find((g) => g.id === id)!).filter(Boolean)
    setGroups(reordered)
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Modifier actions
  // ─────────────────────────────────────────────────────────────────────────

  function openAddModifier(groupId: string) {
    setEditingModifier(null)
    setTargetGroupId(groupId)
    setModifierModalOpen(true)
  }

  function openEditModifier(modifier: AdminModifier) {
    setEditingModifier(modifier)
    setTargetGroupId(modifier.modifier_group_id)
    setModifierModalOpen(true)
  }

  async function handleSaveModifier(
    payload: Omit<ModifierWritePayload, 'modifier_group_id'>
  ) {
    if (!targetGroupId) throw new Error('No group selected')

    if (editingModifier) {
      const updated = await ModifierService.update(editingModifier.id, payload)
      setModifiers((p) => ({
        ...p,
        [targetGroupId]: (p[targetGroupId] ?? []).map((m) =>
          m.id === updated.id ? updated : m
        ),
      }))
    } else {
      const full: ModifierWritePayload = { ...payload, modifier_group_id: targetGroupId }
      const created = await ModifierService.create(full)
      setModifiers((p) => ({
        ...p,
        [targetGroupId]: [...(p[targetGroupId] ?? []), created],
      }))
    }
  }

  function handleDeleteModifier(modifier: AdminModifier) {
    confirm(
      'Delete Option',
      `Delete "${modifier.name}"? This cannot be undone.`,
      async () => {
        await ModifierService.delete(modifier.id)
        setModifiers((p) => ({
          ...p,
          [modifier.modifier_group_id]: (p[modifier.modifier_group_id] ?? []).filter(
            (m) => m.id !== modifier.id
          ),
        }))
      }
    )
  }

  async function handleToggleModifier(modifier: AdminModifier, available: boolean) {
    setSaving(true)
    try {
      await ModifierService.toggleAvailability(modifier.id, available)
      setModifiers((p) => ({
        ...p,
        [modifier.modifier_group_id]: (p[modifier.modifier_group_id] ?? []).map((m) =>
          m.id === modifier.id ? { ...m, available } : m
        ),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Template apply
  // ─────────────────────────────────────────────────────────────────────────

  async function handleApplyTemplate(templateId: string) {
    await ModifierTemplateService.applyToMenuItem(menuItemId, templateId, groups.length)
    await loadGroups()
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin h-5 w-5 border-2 border-gray-200 border-t-gray-700 rounded-full" />
        <span className="ml-3 text-sm text-gray-400">Loading modifiers…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Panel toggle tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {([
            ['groups',    'Groups'],
            ['reorder',   'Reorder'],
            ['templates', 'Templates'],
          ] as [ActivePanel, string][]).map(([panel, label]) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel)}
              className={[
                'px-3 py-1.5 text-xs font-medium rounded-md transition',
                activePanel === panel
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {label}
              {panel === 'groups' && groups.length > 0 && (
                <span className="ml-1.5 text-gray-400">({groups.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Add group button — only in groups panel */}
        {activePanel === 'groups' && (
          <AsyncButton
            variant="primary"
            size="sm"
            onClick={openCreateGroup}
            disabled={saving}
          >
            + Add Group
          </AsyncButton>
        )}
      </div>

      {/* ── Groups panel ─────────────────────────────────────────────────── */}
      {activePanel === 'groups' && (
        <>
          {groups.length === 0 ? (
            <ModifierEmptyState
              onAddGroup={openCreateGroup}
              onAddTemplate={() => setActivePanel('templates')}
            />
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <ModifierGroupCard
                  key={group.id}
                  group={group}
                  modifiers={modifiers[group.id] ?? []}
                  onEditGroup={openEditGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onToggleActive={handleToggleGroup}
                  onAddModifier={openAddModifier}
                  onEditModifier={openEditModifier}
                  onDeleteModifier={handleDeleteModifier}
                  onToggleModifier={handleToggleModifier}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Reorder panel ─────────────────────────────────────────────────── */}
      {activePanel === 'reorder' && (
        <div>
          <p className="text-xs text-gray-500 mb-3">
            Drag groups into your preferred display order. Changes save automatically.
          </p>
          <ModifierReorderList
            groups={groups}
            onReorder={handleGroupReorder}
            disabled={saving}
          />
        </div>
      )}

      {/* ── Templates panel ────────────────────────────────────────────────── */}
      {activePanel === 'templates' && (
        <ModifierTemplateLibrary
          onApply={handleApplyTemplate}
          disabled={saving}
        />
      )}

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <ModifierGroupModal
        isOpen={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSave={handleSaveGroup}
        editing={editingGroup}
      />

      <ModifierModal
        isOpen={modifierModalOpen}
        onClose={() => setModifierModalOpen(false)}
        onSave={handleSaveModifier}
        editing={editingModifier}
        groupName={
          targetGroupId
            ? groups.find((g) => g.id === targetGroupId)?.name
            : undefined
        }
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={runConfirm}
        title={confirmTitle}
        message={confirmMessage}
        confirmText="Delete"
        variant="danger"
        loading={confirmLoading}
      />
    </div>
  )
}