// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemModifiers.ts
// =============================================================================
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { ModifierGroup, Modifier, SelectedModifier } from '@/domain/menu/menu.types';
import { isRecord, errMsg } from '../utils/menuItemGuards';
import { parseModifierGroupsFromJson } from '@/domain/menu/parseModifierGroups';

interface UseMenuItemModifiersReturn {
  modifierGroups: ModifierGroup[];
  groupsLoading: boolean;
  groupsError: string | null;
  selected: Record<string, SelectedModifier[]>;
  expandedGroups: Record<string, boolean>;
  selectionPrunedWarning: string | null;
  maxSelectionHint: string | null;
  loadModifierGroups: () => Promise<void>;
  setSelectionForGroup: (group: ModifierGroup, mod: Modifier) => void;
  toggleGroupExpanded: (groupId: string) => void;
  clearSelections: () => void;
}

export function useMenuItemModifiers(
  itemId: string,
  onLiveStatus: (msg: string) => void,
): UseMenuItemModifiersReturn {
  const [modifierGroups, setModifierGroups]               = useState<ModifierGroup[]>([]);
  const [groupsLoading, setGroupsLoading]                 = useState(false);
  const [groupsError, setGroupsError]                     = useState<string | null>(null);
  const [selected, setSelected]                           = useState<Record<string, SelectedModifier[]>>({});
  const [expandedGroups, setExpandedGroups]               = useState<Record<string, boolean>>({});
  const [selectionPrunedWarning, setSelectionPrunedWarning] = useState<string | null>(null);
  const [maxSelectionHint, setMaxSelectionHint]           = useState<string | null>(null);

  // ── Load groups ─────────────────────────────────────────────────────────────

  const loadModifierGroups = useCallback(async () => {
    if (!itemId) return;
    setGroupsLoading(true);
    setGroupsError(null);

    try {
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_menu_item_public', {
        p_item_id: itemId,
      });

      if (rpcError) {
        const msg =
          isRecord(rpcError) && typeof rpcError.message === 'string'
            ? rpcError.message
            : 'Failed to load options';
        throw new Error(msg);
      }

      const raw    = isRecord(rpcData) ? rpcData.modifier_groups : null;
      // parseModifierGroupsFromJson is the single normalization boundary.
      // It converts DB dollar float → integer cents and produces domain ModifierGroup[].
      // normalizeGroups (modifierGuards.ts) must NOT be called here — it is
      // downstream of the boundary and asserts cents, it does not convert.
      const groups = parseModifierGroupsFromJson(raw);

      setModifierGroups(groups);

      // Expand required groups by default
      const exp: Record<string, boolean> = {};
      for (const g of groups) {
        exp[g.id] = g.required || g.min_selections > 0;
      }
      setExpandedGroups(exp);

      // Prune stale selections against freshly loaded groups
      setSelected((prev) => {
        const next: Record<string, SelectedModifier[]> = {};
        for (const g of groups) {
          const prior   = prev[g.id] ?? [];
          const allowed = new Set(g.modifiers.filter((m) => m.available).map((m) => m.id));
          next[g.id]    = prior.filter((s) => allowed.has(s.id));
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
        const prior   = prev[g.id] ?? [];
        const allowed = allowedByGroup[g.id] ?? new Set<string>();
        const pruned  = prior.filter((s) => allowed.has(s.id));
        if (pruned.length !== prior.length) {
          changed      = true;
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
    (group: ModifierGroup, mod: Modifier) => {
      if (!group.active) return;
      if (!mod.available) return;

      setMaxSelectionHint(null);

      setSelected((prev) => {
        const current = prev[group.id] ?? [];
        const exists  = current.some((s) => s.id === mod.id);

        // Domain boundary assertion:
        // parseModifierGroupsFromJson() converted DB dollar float → integer cents.
        // By this point price_adjustment MUST be a finite integer.
        // If it is not, parseModifierGroups.ts has a bug — fail fast here
        // rather than silently pricing the modifier at $0.
        const rawAdj = mod.price_adjustment;
        if (typeof rawAdj !== 'number' || !Number.isFinite(rawAdj) || !Number.isInteger(rawAdj)) {
          throw new Error(
            `useMenuItemModifiers: modifier(id=${mod.id}) has invalid price_adjustment ` +
            `"${String(rawAdj)}" after normalization. Expected a finite integer (cents).`,
          );
        }

        // Domain SelectedModifier uses snake_case fields
        const newEntry: SelectedModifier = {
          id:                mod.id,
          name:              mod.name,
          price_adjustment:  rawAdj,
          modifier_group_id: group.id,
        };

        if (group.type === 'radio') {
          if (exists) {
            if (group.min_selections >= 1) return prev;
            onLiveStatus(`${group.name}: cleared`);
            return { ...prev, [group.id]: [] };
          }
          onLiveStatus(`${group.name}: selected ${mod.name}`);
          return { ...prev, [group.id]: [newEntry] };
        }

        const next    = exists ? current.filter((s) => s.id !== mod.id) : [...current, newEntry];
        const max     = group.max_selections ?? null;

        if (max != null && max > 0 && next.length > max) {
          const trimmed = next.slice(next.length - max);
          const hint    = `You can choose up to ${max}. Oldest selection removed.`;
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