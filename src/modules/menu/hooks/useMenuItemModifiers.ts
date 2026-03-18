// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemModifiers.ts
// =============================================================================
// Manages modifier group state for a single menu item:
//   - loads groups from menu_items_public view (best-effort, not server-truth)
//   - maintains selection state per group
//   - prunes stale / unavailable selections automatically
//   - exposes handlers consumed directly by MenuItemModal JSX
// =============================================================================

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { ModifierGroupLike, ModifierLike, SelectedModifier } from '../utils/modifierGuards';
import { isRecord, safeCents, errMsg } from '../utils/menuItemGuards';
import { normalizeGroups } from '../utils/modifierGuards';

interface UseMenuItemModifiersReturn {
  modifierGroups: ModifierGroupLike[];
  groupsLoading: boolean;
  groupsError: string | null;
  selected: Record<string, SelectedModifier[]>;
  expandedGroups: Record<string, boolean>;
  selectionPrunedWarning: string | null;
  maxSelectionHint: string | null;
  loadModifierGroups: () => Promise<void>;
  setSelectionForGroup: (group: ModifierGroupLike, mod: ModifierLike) => void;
  toggleGroupExpanded: (groupId: string) => void;
  clearSelections: () => void;
}

export function useMenuItemModifiers(
  itemId: string,
  onLiveStatus: (msg: string) => void,
): UseMenuItemModifiersReturn {
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupLike[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, SelectedModifier[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectionPrunedWarning, setSelectionPrunedWarning] = useState<string | null>(null);
  const [maxSelectionHint, setMaxSelectionHint] = useState<string | null>(null);

  // ── Load groups ─────────────────────────────────────────────────────────────

  const loadModifierGroups = useCallback(async () => {
    if (!itemId) return;
    setGroupsLoading(true);
    setGroupsError(null);

    try {
      const invokeResult = await supabase
        .from('menu_items_public')
        .select('modifier_groups')
        .eq('id', itemId)
        .maybeSingle();

      const invokeError: unknown = invokeResult.error;
      const invokeData: unknown = invokeResult.data;

      if (invokeError) {
        const msg =
          isRecord(invokeError) && typeof invokeError.message === 'string'
            ? invokeError.message
            : 'Failed to load options';
        throw new Error(msg);
      }

      const raw = isRecord(invokeData) ? invokeData.modifier_groups : null;
      const groups = normalizeGroups(raw);

      setModifierGroups(groups);

      // Expand required groups by default
      const exp: Record<string, boolean> = {};
      for (const g of groups) {
        const min = g.min_selections ?? (g.required ? 1 : 0);
        exp[g.id] = g.required || min > 0;
      }
      setExpandedGroups(exp);

      // Prune stale selections against freshly loaded groups
      setSelected((prev) => {
        const next: Record<string, SelectedModifier[]> = {};
        for (const g of groups) {
          const prior = prev[g.id] ?? [];
          const allowed = new Set(g.modifiers.filter((m) => m.available).map((m) => m.id));
          const pruned = prior.filter((s) => allowed.has(s.id));
          next[g.id] = pruned;
        }
        return next;
      });
    } catch (e) {
      const msg = errMsg(e);
      if (msg !== 'aborted') {
        setModifierGroups([]);
        setGroupsError('Options are temporarily unavailable.');
      }
    } finally {
      setGroupsLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void loadModifierGroups();
  }, [loadModifierGroups]);

  // ── Prune unavailable selections when groups update ──────────────────────────

  useEffect(() => {
    if (!modifierGroups.length) return;

    let prunedCount = 0;

    const allowedByGroup: Record<string, Set<string>> = {};
    for (const g of modifierGroups) {
      allowedByGroup[g.id] = new Set(g.modifiers.filter((m) => m.available).map((m) => m.id));
    }

    setSelected((prev) => {
      let changed = false;
      const next: Record<string, SelectedModifier[]> = {};
      for (const g of modifierGroups) {
        const prior = prev[g.id] ?? [];
        const allowed = allowedByGroup[g.id] ?? new Set<string>();
        const pruned = prior.filter((s) => allowed.has(s.id));
        if (pruned.length !== prior.length) {
          changed = true;
          prunedCount += prior.length - pruned.length;
        }
        next[g.id] = pruned;
      }
      return changed ? next : prev;
    });

    if (prunedCount > 0) {
      const msg = 'Some selected options were removed because they are no longer available.';
      setSelectionPrunedWarning(msg);
      onLiveStatus(msg);
      const t = window.setTimeout(() => setSelectionPrunedWarning(null), 3500);
      return () => window.clearTimeout(t);
    }

    return undefined;
  }, [modifierGroups, onLiveStatus]);

  // ── Selection handlers ───────────────────────────────────────────────────────

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  const setSelectionForGroup = useCallback(
    (group: ModifierGroupLike, mod: ModifierLike) => {
      if (!group.active) return;
      if (!mod.available) return;

      setMaxSelectionHint(null);

      setSelected((prev) => {
        const current = prev[group.id] ?? [];
        const exists = current.some((s) => s.id === mod.id);

        if (group.type === 'radio') {
          if (exists) {
            const min = group.min_selections ?? (group.required ? 1 : 0);
            if (min >= 1) return prev;
            onLiveStatus(`${group.name}: cleared`);
            return { ...prev, [group.id]: [] };
          }
          onLiveStatus(`${group.name}: selected ${mod.name}`);
          return {
            ...prev,
            [group.id]: [
              {
                id: mod.id,
                name: mod.name,
                priceAdjustment: safeCents(mod.price_adjustment, 0),
                groupId: group.id,
              },
            ],
          };
        }

        const next = exists
          ? current.filter((s) => s.id !== mod.id)
          : [
              ...current,
              {
                id: mod.id,
                name: mod.name,
                priceAdjustment: safeCents(mod.price_adjustment, 0),
                groupId: group.id,
              },
            ];

        const max = group.max_selections ?? null;
        if (max != null && max > 0 && next.length > max) {
          const trimmed = next.slice(next.length - max);
          const hint = `You can choose up to ${max}. Oldest selection removed.`;
          setMaxSelectionHint(hint);
          onLiveStatus(hint);
          return { ...prev, [group.id]: trimmed };
        }

        onLiveStatus(`${group.name}: ${exists ? 'removed' : 'added'} ${mod.name}`);
        return { ...prev, [group.id]: next };
      });
    },
    [onLiveStatus],
  );

  const clearSelections = useCallback(() => {
    setSelected({});
    onLiveStatus('Selections cleared');
  }, [onLiveStatus]);

  return {
    modifierGroups,
    groupsLoading,
    groupsError,
    selected,
    expandedGroups,
    selectionPrunedWarning,
    maxSelectionHint,
    loadModifierGroups,
    setSelectionForGroup,
    toggleGroupExpanded,
    clearSelections,
  };
}