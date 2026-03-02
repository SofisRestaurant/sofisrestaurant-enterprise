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
//   - Toggle group active / modifier available (optimistic + safe)
//   - Drag-and-drop reorder groups (via ModifierGroupReorderList)
//   - Template library (via ModifierTemplateLibrary)
//   - Realtime sync (via useModifierRealtime)
//   - Confirm dialog on destructive actions
//
// Notes:
//   - Avoids promise-returning functions in JSX handlers (no-misused-promises)
//   - Avoids unstable callbacks (react-hooks/exhaustive-deps)
//   - Avoids “used before declaration” by ordering callbacks correctly
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react'

import { ModifierGroupService } from '@/services/modifier-group.service'
import { ModifierService } from '@/services/modifier.service'
import { ModifierTemplateService } from '@/services/modifier-template.service'

import { useModifierRealtime } from '@/hooks/useModifierRealtime'

import { ModifierGroupCard } from './ModifierGroupCard'
import { ModifierGroupModal } from './ModifierGroupModal'
import { ModifierModal } from './ModifierModal'
import { ModifierEmptyState } from './ModifierEmptyState'
import { ModifierTemplateLibrary } from '../nav/ModifierTemplateLibrary'
import { ModifierGroupReorderList } from './ModifierReorderList'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { AsyncButton } from '@/components/ui/AsyncButton'

import type {
  AdminModifierGroup,
  AdminModifier,
  ModifierGroupWritePayload,
  ModifierWritePayload,
} from '@/types/admin-menu'

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
  const [groups, setGroups] = useState<AdminModifierGroup[]>([])
  const [modifiers, setModifiers] = useState<Record<string, AdminModifier[]>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [activePanel, setActivePanel] = useState<ActivePanel>('groups')

  // ── Modal state — groups ───────────────────────────────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<AdminModifierGroup | null>(null)

  // ── Modal state — modifiers ────────────────────────────────────────────────
  const [modifierModalOpen, setModifierModalOpen] = useState(false)
  const [editingModifier, setEditingModifier] = useState<AdminModifier | null>(null)
  const [targetGroupId, setTargetGroupId] = useState<string | null>(null)

  // ── Confirm dialog ─────────────────────────────────────────────────────────
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmAction, setConfirmAction] = useState<() => Promise<void>>(
    () => async () => {},
  )
  const [confirmLoading, setConfirmLoading] = useState(false)

  const isGroupsPanel = activePanel === 'groups'
  const isReorderPanel = activePanel === 'reorder'
  const isTemplatesPanel = activePanel === 'templates'

  const modifiersByGroup = useMemo(() => modifiers, [modifiers])

  // ─────────────────────────────────────────────────────────────────────────
  // Data loading
  // ─────────────────────────────────────────────────────────────────────────

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const gs = await ModifierGroupService.getForMenuItem(menuItemId)
      setGroups(gs)

      const entries = await Promise.all(
        gs.map(async (g) => {
          const mods = await ModifierService.getForGroup(g.id)
          return [g.id, mods] as [string, AdminModifier[]]
        }),
      )
      setModifiers(Object.fromEntries(entries))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load modifiers')
    } finally {
      setLoading(false)
    }
  }, [menuItemId])

  useEffect(() => {
    void loadGroups()
  }, [loadGroups])

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime sync
  // ─────────────────────────────────────────────────────────────────────────
  // IMPORTANT: onAnyChange expects a void-returning function.
  // We trigger async work with `void` inside the handler.

  const handleRealtimeAnyChange = useCallback((): void => {
    void loadGroups()
  }, [loadGroups])

  useModifierRealtime({
    menuItemId,
    onAnyChange: handleRealtimeAnyChange,
    enabled: true,
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Confirm helper
  // ─────────────────────────────────────────────────────────────────────────

  const openConfirm = useCallback(
    (title: string, message: string, action: () => Promise<void>) => {
      setConfirmTitle(title)
      setConfirmMessage(message)
      setConfirmAction(() => action)
      setConfirmOpen(true)
    },
    [],
  )

  const runConfirm = useCallback(async () => {
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
  }, [confirmAction])

  // ─────────────────────────────────────────────────────────────────────────
  // Group actions (stable callbacks)
  // ─────────────────────────────────────────────────────────────────────────

  const openCreateGroup = useCallback(() => {
    setEditingGroup(null)
    setGroupModalOpen(true)
  }, [])

  const openEditGroup = useCallback((group: AdminModifierGroup) => {
    setEditingGroup(group)
    setGroupModalOpen(true)
  }, [])

  const handleSaveGroup = useCallback(
    async (payload: ModifierGroupWritePayload) => {
      if (editingGroup) {
        const updated = await ModifierGroupService.update(editingGroup.id, payload)
        setGroups((p) => p.map((g) => (g.id === updated.id ? updated : g)))
        return
      }

      const created = await ModifierGroupService.create(payload)
      await ModifierGroupService.attachToMenuItem({
        menu_item_id: menuItemId,
        modifier_group_id: created.id,
        sort_order: groups.length,
      })

      setGroups((p) => [...p, created])
      setModifiers((p) => ({ ...p, [created.id]: [] }))
    },
    [editingGroup, menuItemId, groups.length],
  )

  const handleDeleteGroup = useCallback(
    (group: AdminModifierGroup) => {
      const modCount = (modifiersByGroup[group.id] ?? []).length

      openConfirm(
        'Delete Group',
        `Delete "${group.name}"${
          modCount > 0
            ? ` and its ${modCount} option${modCount !== 1 ? 's' : ''}`
            : ''
        }? This cannot be undone.`,
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
        },
      )
    },
    [menuItemId, modifiersByGroup, openConfirm],
  )

  const handleToggleGroup = useCallback(async (group: AdminModifierGroup, active: boolean) => {
    setSaving(true)
    setError(null)
    try {
      await ModifierGroupService.toggleActive(group.id, active)
      setGroups((p) => p.map((g) => (g.id === group.id ? { ...g, active } : g)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }, [])

  const handleGroupReorder = useCallback(
    async (orderedIds: string[]) => {
      setSaving(true)
      setError(null)
      try {
        const items = orderedIds.map((id, i) => ({ id, sort_order: i }))
        await ModifierGroupService.reorderForMenuItem(menuItemId, items)

        setGroups((prev) => {
          const byId = new Map(prev.map((g) => [g.id, g] as const))
          return orderedIds.map((id) => byId.get(id)).filter(Boolean) as AdminModifierGroup[]
        })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reorder')
      } finally {
        setSaving(false)
      }
    },
    [menuItemId],
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Modifier actions (stable callbacks)
  // ─────────────────────────────────────────────────────────────────────────

  const openAddModifier = useCallback((groupId: string) => {
    setEditingModifier(null)
    setTargetGroupId(groupId)
    setModifierModalOpen(true)
  }, [])

  const openEditModifier = useCallback((modifier: AdminModifier) => {
    setEditingModifier(modifier)
    setTargetGroupId(modifier.modifier_group_id)
    setModifierModalOpen(true)
  }, [])

  const handleSaveModifier = useCallback(
    async (payload: Omit<ModifierWritePayload, 'modifier_group_id'>) => {
      if (!targetGroupId) throw new Error('No group selected')

      if (editingModifier) {
        const updated = await ModifierService.update(editingModifier.id, payload)
        setModifiers((p) => ({
          ...p,
          [targetGroupId]: (p[targetGroupId] ?? []).map((m) =>
            m.id === updated.id ? updated : m,
          ),
        }))
        return
      }

      const full: ModifierWritePayload = { ...payload, modifier_group_id: targetGroupId }
      const created = await ModifierService.create(full)
      setModifiers((p) => ({
        ...p,
        [targetGroupId]: [...(p[targetGroupId] ?? []), created],
      }))
    },
    [editingModifier, targetGroupId],
  )

  const handleDeleteModifier = useCallback(
    (modifier: AdminModifier) => {
      openConfirm(
        'Delete Option',
        `Delete "${modifier.name}"? This cannot be undone.`,
        async () => {
          await ModifierService.delete(modifier.id)
          setModifiers((p) => ({
            ...p,
            [modifier.modifier_group_id]: (p[modifier.modifier_group_id] ?? []).filter(
              (m) => m.id !== modifier.id,
            ),
          }))
        },
      )
    },
    [openConfirm],
  )

  const handleToggleModifier = useCallback(async (modifier: AdminModifier, available: boolean) => {
    setSaving(true)
    setError(null)
    try {
      await ModifierService.toggleAvailability(modifier.id, available)
      setModifiers((p) => ({
        ...p,
        [modifier.modifier_group_id]: (p[modifier.modifier_group_id] ?? []).map((m) =>
          m.id === modifier.id ? { ...m, available } : m,
        ),
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }, [])

  // UI-safe wrappers (voiding promises for JSX)
  const onToggleGroupActive = useCallback(
    (group: AdminModifierGroup, active: boolean) => {
      void handleToggleGroup(group, active)
    },
    [handleToggleGroup],
  )

  const onToggleModifierAvailable = useCallback(
    (modifier: AdminModifier, available: boolean) => {
      void handleToggleModifier(modifier, available)
    },
    [handleToggleModifier],
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Template apply
  // ─────────────────────────────────────────────────────────────────────────

  const handleApplyTemplate = useCallback(
    async (templateId: string) => {
      setSaving(true)
      setError(null)
      try {
        await ModifierTemplateService.applyToMenuItem(menuItemId, templateId, groups.length)
        await loadGroups()
        setActivePanel('groups')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to apply template')
      } finally {
        setSaving(false)
      }
    },
    [menuItemId, groups.length, loadGroups],
  )

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-gray-700" />
        <span className="ml-3 text-sm text-gray-400">Loading modifiers…</span>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(
            [
              ['groups', 'Groups'],
              ['reorder', 'Reorder'],
              ['templates', 'Templates'],
            ] as [ActivePanel, string][]
          ).map(([panel, label]) => (
            <button
              key={panel}
              type="button"
              onClick={() => setActivePanel(panel)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                activePanel === panel
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700',
              ].join(' ')}
            >
              {label}
              {panel === 'groups' && groups.length > 0 ? (
                <span className="ml-1.5 text-gray-400">({groups.length})</span>
              ) : null}
            </button>
          ))}
        </div>

        {isGroupsPanel ? (
          <AsyncButton
            variant="primary"
            size="sm"
            onClick={openCreateGroup}
            disabled={saving}
          >
            + Add Group
          </AsyncButton>
        ) : null}
      </div>

      {/* ── Groups panel ─────────────────────────────────────────────────── */}
      {isGroupsPanel ? (
        <>
          {groups.length === 0 ? (
            <ModifierEmptyState onAdd={openCreateGroup} />
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <ModifierGroupCard
                  key={group.id}
                  group={group}
                  modifiers={modifiersByGroup[group.id] ?? []}
                  onEditGroup={openEditGroup}
                  onDeleteGroup={handleDeleteGroup}
                  onToggleActive={onToggleGroupActive}
                  onAddModifier={openAddModifier}
                  onEditModifier={openEditModifier}
                  onDeleteModifier={handleDeleteModifier}
                  onToggleModifier={onToggleModifierAvailable}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {/* ── Reorder panel ─────────────────────────────────────────────────── */}
      {isReorderPanel ? (
        <section className="space-y-3">
          <p className="text-xs text-gray-500">
            Drag groups into your preferred display order. Changes save automatically.
          </p>

          <ModifierGroupReorderList
            groups={groups}
            disabled={saving}
            onReorder={(reorderedGroups) => {
              void handleGroupReorder(reorderedGroups.map((g) => g.id))
            }}
          />
        </section>
      ) : null}

      {/* ── Templates panel ────────────────────────────────────────────────── */}
      {isTemplatesPanel ? (
        <ModifierTemplateLibrary onApply={handleApplyTemplate} disabled={saving} />
      ) : null}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
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
          targetGroupId ? groups.find((g) => g.id === targetGroupId)?.name : undefined
        }
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          void runConfirm()
        }}
        title={confirmTitle}
        message={confirmMessage}
        confirmText="Delete"
        variant="danger"
        loading={confirmLoading}
      />
    </div>
  )
}