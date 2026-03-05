// =============================================================================
// PATH: src/modules/menu/components/MenuItemModal.tsx
// =============================================================================
// MENU ITEM MODAL — Production (2026) — Luxury UX + Modifier Support
// =============================================================================
// IMPORTANT: This file upgrades ONLY modal UI/UX + mechanics.
// All existing business logic + data contracts remain intact:
// - preflight invoke + payload shape
// - modifier selection rules + pruning behavior
// - addItem payload shape
// - pricingHash composition (kept exactly as-is)
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Info, Minus, Plus, Star, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { unlockScroll } from '@/lib/ui/scroll-lock';

type CartPhase = 'idle' | 'adding' | 'success';

interface Props {
  item: MenuItemPublic;
  onClose: () => void;
}

type PreflightOk = {
  ok: true;
  item_id: string;
  available: boolean;
  unit_price_cents: number;
  stock_count: number | null;
  low_stock_threshold: number | null;
  max_qty: number;
};

type PreflightErr = { ok: false; error: string };

type PreflightResponse = PreflightOk | PreflightErr;
type UnknownRecord = Record<string, unknown>;

type ModifierGroupType = 'radio' | 'checkbox';

type ModifierLike = {
  id: string;
  name: string;
  price_adjustment: number;
  available: boolean;
  sort_order?: number | null;
};

type ModifierGroupLike = {
  id: string;
  name: string;
  description: string | null;
  type: ModifierGroupType;
  required: boolean;
  min_selections: number | null;
  max_selections: number | null;
  sort_order?: number | null;
  active: boolean;
  modifiers: ModifierLike[];
};

type SelectedModifier = {
  id: string;
  name: string;
  priceAdjustment: number; // cents
  groupId: string;
};

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN;
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function safeStr(v: unknown, fallback = '', max = 500): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s) return fallback;
  return s.length > max ? s.slice(0, max) : s;
}

function safeBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function safeCents(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return clampInt(Math.round(n), 0, 50_000_000);
}

function fmtUsdFromCents(cents: number): string {
  const c = safeCents(cents, 0);
  return (c / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function errMsg(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return 'aborted';
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Request failed';
}

/** Tight runtime guard for MenuItemPublic-ish objects. */
function isMenuItemPublic(v: unknown): v is MenuItemPublic {
  if (!isRecord(v)) return false;
  return (
    typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string' && v.name.length > 0
  );
}

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((s) => s.length > 0)
      .slice(0, 24);
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((x) => x.trim())
      .filter((s) => s.length > 0)
      .slice(0, 24);
  }
  return [];
}

function normalizeGroupType(v: unknown): ModifierGroupType | null {
  const t = safeStr(v, '').toLowerCase();
  if (t === 'radio') return 'radio';
  if (t === 'checkbox') return 'checkbox';
  return null;
}

function normalizeModifierLike(v: unknown): ModifierLike | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  if (!id || !name) return null;

  return {
    id,
    name,
    price_adjustment: safeCents(v.price_adjustment, 0),
    available: safeBool(v.available, true),
    sort_order: typeof v.sort_order === 'number' ? v.sort_order : null,
  };
}

function normalizeGroupLike(v: unknown): ModifierGroupLike | null {
  if (!isRecord(v)) return null;
  const id = safeStr(v.id, '', 128);
  const name = safeStr(v.name, '', 120);
  const type = normalizeGroupType(v.type);
  if (!id || !name || !type) return null;

  const modsRaw = Array.isArray(v.modifiers) ? v.modifiers : [];
  const mods: ModifierLike[] = [];
  for (const m of modsRaw) {
    const mm = normalizeModifierLike(m);
    if (mm) mods.push(mm);
  }

  mods.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' ? a.sort_order : 0;
    const bo = typeof b.sort_order === 'number' ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });

  return {
    id,
    name,
    description: v.description == null ? null : safeStr(v.description, '', 240) || null,
    type,
    required: safeBool(v.required, false),
    min_selections: v.min_selections == null ? null : clampInt(v.min_selections, 0, 999),
    max_selections: v.max_selections == null ? null : clampInt(v.max_selections, 0, 999),
    sort_order: typeof v.sort_order === 'number' ? v.sort_order : null,
    active: safeBool(v.active, true),
    modifiers: mods,
  };
}

function normalizeGroups(v: unknown): ModifierGroupLike[] {
  const out: ModifierGroupLike[] = [];
  const raw = Array.isArray(v) ? v : [];
  for (const g of raw) {
    const gg = normalizeGroupLike(g);
    if (gg && gg.active) out.push(gg);
  }
  out.sort((a, b) => {
    const ao = typeof a.sort_order === 'number' ? a.sort_order : 0;
    const bo = typeof b.sort_order === 'number' ? b.sort_order : 0;
    return ao - bo || a.name.localeCompare(b.name);
  });
  return out;
}

function groupSelectionRangeLabel(group: ModifierGroupLike): string {
  const min = group.min_selections ?? (group.required ? 1 : 0);
  const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);

  if (group.type === 'radio') {
    if (group.required || min >= 1) return 'Choose 1';
    return 'Optional';
  }

  if (max != null && max > 0) {
    if (min > 0) return `Choose ${min}–${max}`;
    return `Choose up to ${max}`;
  }

  if (min > 0) return `Choose at least ${min}`;
  return 'Optional';
}

function isSelectionValidForGroup(group: ModifierGroupLike, selected: SelectedModifier[]): boolean {
  const sels = Array.isArray(selected) ? selected : [];
  const count = sels.length;

  const min = group.min_selections ?? (group.required ? 1 : 0);
  const max = group.max_selections ?? (group.type === 'radio' ? 1 : null);

  if (count < min) return false;
  if (max != null && count > max) return false;
  if (group.type === 'radio' && count > 1) return false;
  return true;
}

function computeSelectedModifierCents(selected: Record<string, SelectedModifier[]>): number {
  let sum = 0;
  for (const sels of Object.values(selected)) {
    if (!Array.isArray(sels)) continue;
    for (const s of sels) sum += safeCents(s.priceAdjustment, 0);
  }
  return Math.max(0, sum);
}

function canonicalizeSelectionsForHash(selected: Record<string, SelectedModifier[]>): string {
  const parts: string[] = [];
  const groupIds = Object.keys(selected).sort((a, b) => a.localeCompare(b));
  for (const gid of groupIds) {
    const sels = selected[gid] ?? [];
    const ids = sels
      .map((s) => safeStr(s.id, '').trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    parts.push(`${gid}:${ids.join('.')}`);
  }
  return parts.join('|');
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return nodes.filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}

export default function MenuItemModal({ item, onClose }: Props) {
  const { addItem } = useCart();

  const invalidItem = !isMenuItemPublic(item);

  // Treat props as untrusted at runtime (shape drift safe)
  const rec: UnknownRecord = isRecord(item) ? item : {};
  const id = safeStr(rec.id, '', 128);
  const name = safeStr(rec.name, 'Menu item', 120);

  const scrollToken = id ? `menu-item:${id}` : 'menu-item:unknown';

  // ✅ FIX: Hooks must be called at the top level (not inside effects/callbacks/conditions)
  useScrollLock({ enabled: true, token: scrollToken });

  const categoryLabel = safeStr(rec.category, 'menu', 40);
  const description = safeStr(rec.description, '', 1200);
  const imageUrl =
    typeof rec.image_url === 'string' && rec.image_url.trim() ? rec.image_url.trim() : null;
  const tags = useMemo(() => parseTags(rec.tags), [rec.tags]);

  const isPopular =
    rec.is_popular === true ||
    rec.isPopular === true ||
    (typeof rec.popularity_score === 'number' &&
      Number.isFinite(rec.popularity_score) &&
      rec.popularity_score >= 80);

  // UI state
  const [qty, setQty] = useState<number>(1);
  const [phase, setPhase] = useState<CartPhase>('idle');

  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  // Modifiers (best-effort load)
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroupLike[]>([]);
  const [selected, setSelected] = useState<Record<string, SelectedModifier[]>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Notes (optional; used in cart payload)
  const [notes, setNotes] = useState<string>('');

  // Warnings / status
  const [selectionPrunedWarning, setSelectionPrunedWarning] = useState<string | null>(null);
  const [maxSelectionHint, setMaxSelectionHint] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string>('');

  // timers + cancellation
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Modal mechanics refs
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    // Fail-safe: unlock immediately (don’t rely solely on unmount cleanup)
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

  // Focus restore (preserve existing behavior)
  useEffect(() => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    queueMicrotask(() => {
      closeBtnRef.current?.focus();
    });

    return () => {
      // (Optional) fail-safe unlock; useScrollLock also unlocks on unmount
      unlockScroll(scrollToken);
      queueMicrotask(() => {
        const el = lastFocusRef.current;
        if (el && document.contains(el)) el.focus();
      });
    };
  }, [scrollToken]);

  // Global key handling: ESC close + focus trap (Tab cycles within modal)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }

      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = getFocusable(dialog);
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const idx = focusables.findIndex((x) => x === active);
      const lastIdx = focusables.length - 1;

      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[lastIdx]?.focus();
        }
      } else {
        if (idx === -1 || idx >= lastIdx) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // Cleanup: preserve existing abort/timer hygiene
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (addTimer.current) clearTimeout(addTimer.current);
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // Load modifier groups best-effort from menu_items_public view (if present).
  // This does NOT replace server truth; it only drives customization UI.
  const loadModifierGroups = useCallback(async () => {
    if (!id) return;
    setGroupsLoading(true);
    setGroupsError(null);

    try {
      const { data, error } = await supabase
        .from('menu_items_public')
        .select('modifier_groups')
        .eq('id', id)
        .maybeSingle();

      if (error) throw new Error(error.message || 'Failed to load options');

      const raw = isRecord(data) ? (data as UnknownRecord).modifier_groups : null;
      const groups = normalizeGroups(raw);

      setModifierGroups(groups);

      // Expand required groups by default
      const exp: Record<string, boolean> = {};
      for (const g of groups) {
        const min = g.min_selections ?? (g.required ? 1 : 0);
        exp[g.id] = g.required || min > 0;
      }
      setExpandedGroups(exp);

      // Prune stale selections if groups changed
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
  }, [id]);

  useEffect(() => {
    void loadModifierGroups();
  }, [loadModifierGroups]);

  // If selected modifiers become unavailable later, prune + warn (UX-only; business logic preserved)
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
      setLiveStatus(msg);
      const t = window.setTimeout(() => setSelectionPrunedWarning(null), 3500);
      return () => window.clearTimeout(t);
    }

    return undefined;
  }, [modifierGroups]);

  // Server preflight (authoritative for base item + qty)
  const runPreflight = useCallback(
    async (requestedQty: number) => {
      if (!id) {
        setPreflight({ ok: false, error: 'Invalid item.' });
        setPreflightError('Invalid item.');
        return;
      }

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const seq = ++requestSeq.current;

      setPreflightLoading(true);
      setPreflightError(null);

      try {
        const { data, error } = await supabase.functions.invoke('menu-preflight', {
          method: 'POST',
          body: { item_id: id, qty: clampInt(requestedQty, 1, 20) },
          signal: ac.signal,
        });

        if (seq !== requestSeq.current) return;

        if (error) throw new Error(error.message || 'Preflight failed');

        const payload = data as unknown;
        if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
          throw new Error('Invalid preflight response');
        }

        if (payload.ok !== true) {
          const msg = typeof payload.error === 'string' ? payload.error : 'Item unavailable';
          setPreflight({ ok: false, error: msg });
          setPreflightError(msg);
          setLiveStatus(msg);
          return;
        }

        const normalized: PreflightOk = {
          ok: true,
          item_id: safeStr(payload.item_id, id, 128),
          available: Boolean(payload.available),
          unit_price_cents: safeCents(payload.unit_price_cents, 0),
          stock_count:
            payload.stock_count == null ? null : clampInt(payload.stock_count, 0, 1_000_000),
          low_stock_threshold:
            payload.low_stock_threshold == null
              ? null
              : clampInt(payload.low_stock_threshold, 1, 1_000_000),
          max_qty: clampInt(payload.max_qty ?? 1, 1, 20),
        };

        setPreflight(normalized);
        setQty((q) => clampInt(q, 1, normalized.max_qty));
      } catch (e) {
        const msg = errMsg(e);
        if (msg === 'aborted') return;

        setPreflight({ ok: false, error: msg });
        setPreflightError(msg);
        setLiveStatus(msg);
      } finally {
        if (seq === requestSeq.current) setPreflightLoading(false);
      }
    },
    [id],
  );

  // Derived
  const maxQty = useMemo(() => {
    const hardCap = 20;
    if (preflight?.ok !== true) return hardCap;
    return clampInt(preflight.max_qty, 1, hardCap);
  }, [preflight]);

  const safeQty = useMemo(() => clampInt(qty, 1, maxQty), [qty, maxQty]);

  const unitPriceCents = useMemo(() => {
    if (preflight?.ok === true) return safeCents(preflight.unit_price_cents, 0);
    return 0;
  }, [preflight]);

  const modifiersCents = useMemo(() => computeSelectedModifierCents(selected), [selected]);

  const lineTotalCents = useMemo(
    () => (unitPriceCents + modifiersCents) * safeQty,
    [unitPriceCents, modifiersCents, safeQty],
  );

  const isLowStock = useMemo(() => {
    if (preflight?.ok !== true) return false;
    if (preflight.stock_count == null) return false;
    const thr = preflight.low_stock_threshold ?? 5;
    return preflight.stock_count > 0 && preflight.stock_count <= thr;
  }, [preflight]);

  // Debounced preflight on open + qty changes
  useEffect(() => {
    if (!id) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void runPreflight(safeQty);
    }, 200);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [id, safeQty, runPreflight]);

  // Modifier validation + inventory gate (fail closed)
  const selectionBlockedIds = useMemo(() => {
    const blocked = new Set<string>();
    for (const g of modifierGroups) {
      const sels = selected[g.id] ?? [];
      for (const s of sels) {
        const mod = g.modifiers.find((m) => m.id === s.id);
        if (!mod) blocked.add(s.id);
        else if (!mod.available) blocked.add(s.id);
      }
    }
    return blocked;
  }, [modifierGroups, selected]);

  const modifierRulesOk = useMemo(() => {
    for (const g of modifierGroups) {
      const sels = selected[g.id] ?? [];
      if (!isSelectionValidForGroup(g, sels)) return false;
    }
    return true;
  }, [modifierGroups, selected]);

  const hasBlockedSelections = selectionBlockedIds.size > 0;

  const canAdd =
    phase === 'idle' &&
    preflight?.ok === true &&
    preflight.available === true &&
    unitPriceCents > 0 &&
    !preflightLoading &&
    modifierRulesOk &&
    !hasBlockedSelections;

  const requiredHint = useMemo(() => {
    if (!modifierGroups.length) return null;
    const missing: string[] = [];
    for (const g of modifierGroups) {
      const sels = selected[g.id] ?? [];
      if (!isSelectionValidForGroup(g, sels)) missing.push(g.name);
    }
    if (!missing.length) return null;
    return `Choose required options: ${missing.slice(0, 2).join(', ')}${missing.length > 2 ? '…' : ''}`;
  }, [modifierGroups, selected]);

  // Selection handlers
  const toggleGroupExpanded = useCallback((groupId: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !Boolean(prev[groupId]) }));
  }, []);

  const setSelectionForGroup = useCallback((group: ModifierGroupLike, mod: ModifierLike) => {
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
          setLiveStatus(`${group.name}: cleared`);
          return { ...prev, [group.id]: [] };
        }
        setLiveStatus(`${group.name}: selected ${mod.name}`);
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
        setLiveStatus(hint);
        return { ...prev, [group.id]: trimmed };
      }

      setLiveStatus(`${group.name}: ${exists ? 'removed' : 'added'} ${mod.name}`);
      return { ...prev, [group.id]: next };
    });
  }, []);

  const clearSelections = useCallback(() => {
    setSelected({});
    setLiveStatus('Selections cleared');
  }, []);

  // Add to cart (fail-closed unless preflight ok + modifiers ok)
  const handleAddToCart = useCallback(() => {
    if (!canAdd) {
      if (!modifierRulesOk) setLiveStatus('Choose required options before adding.');
      return;
    }
    if (preflight?.ok !== true) return;
    if (phase !== 'idle') return;

    setPhase('adding');
    setLiveStatus('Adding to cart…');

    if (addTimer.current) clearTimeout(addTimer.current);
    addTimer.current = setTimeout(() => {
      const chosen: Array<{ id: string; groupId: string; name: string; priceAdjustment: number }> =
        [];
      for (const g of modifierGroups) {
        const sels = selected[g.id] ?? [];
        for (const s of sels) {
          chosen.push({
            id: s.id,
            groupId: s.groupId,
            name: s.name,
            priceAdjustment: safeCents(s.priceAdjustment, 0),
          });
        }
      }

      const note = safeStr(notes, '', 600);
      const notesOrNull = note.length ? note : null;

      // IMPORTANT: pricingHash logic must remain intact
      const pricingHash = `v2:preflight:${id}:${preflight.unit_price_cents}:mods:${canonicalizeSelectionsForHash(selected)}:qty:${safeQty}`;

      addItem({
        menuItemId: id,
        name,
        unitPriceCents: preflight.unit_price_cents, // server confirmed
        imageUrl: imageUrl ?? null,
        category: item.category,
        modifiers: chosen,
        quantity: safeQty,
        notes: notesOrNull,
        pricingHash,
      });

      setPhase('success');
      setLiveStatus('Added!');

      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => close(), 900);
    }, 180);
  }, [
    canAdd,
    modifierRulesOk,
    preflight,
    phase,
    addItem,
    id,
    name,
    imageUrl,
    item.category,
    safeQty,
    notes,
    modifierGroups,
    selected,
    close,
  ]);

  const headerPriceLabel = useMemo(() => {
    if (preflightLoading) return 'checking…';
    if (preflight?.ok === true) return 'server-confirmed';
    return '—';
  }, [preflightLoading, preflight]);

  const stickyTotalLabel = useMemo(() => fmtUsdFromCents(lineTotalCents), [lineTotalCents]);
  const basePriceLabel = useMemo(() => fmtUsdFromCents(unitPriceCents), [unitPriceCents]);

  const extrasLabel = useMemo(() => {
    if (modifiersCents <= 0) return null;
    return `+ ${fmtUsdFromCents(modifiersCents)} options`;
  }, [modifiersCents]);

  const unavailable = preflight?.ok === true && preflight.available === false;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop: clicking closes and always unlocks */}
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onMouseDown={(e) => {
          e.preventDefault();
          close();
        }}
      />

      <div className="absolute inset-0 flex items-end justify-center p-3 sm:items-center">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${name} customization`}
          className={cx(
            'w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl',
            'max-h-[92vh]',
            'flex flex-col min-h-0',
          )}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            {liveStatus}
          </div>

          <div className="shrink-0 border-b border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-400">
                  {categoryLabel}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <h2 className="truncate text-xl font-semibold">{name}</h2>
                  {isPopular ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                      <Star className="h-3.5 w-3.5" aria-hidden="true" />
                      Popular
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  <span className="font-semibold text-amber-300">{basePriceLabel}</span>{' '}
                  <span className="text-[11px] text-zinc-500">• {headerPriceLabel}</span>
                  {extrasLabel ? (
                    <span className="ml-2 text-[11px] text-zinc-500">{extrasLabel}</span>
                  ) : null}
                </p>
              </div>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={close}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-6 [-webkit-overflow-scrolling:touch]">
            {invalidItem ? (
              <div className="pt-4">
                <div
                  className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200 shadow-xl"
                  aria-label="Item unavailable"
                >
                  This item can’t be opened right now.
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-semibold text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                      aria-label="Close"
                    >
                      Close
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="pt-4">
                  <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt=""
                        className="h-56 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="flex h-56 w-full items-center justify-center bg-linear-to-br from-white/5 to-white/0">
                        <div className="text-center">
                          <p className="text-sm font-semibold text-neutral-200">Sofi’s Kitchen</p>
                          <p className="mt-1 text-xs text-zinc-500">
                            Fresh, real plates, made to order.
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-950/70 via-neutral-950/10 to-transparent" />
                  </div>

                  {description ? <p className="mt-4 text-sm text-zinc-300">{description}</p> : null}

                  {tags.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {tags.slice(0, 10).map((t) => (
                        <span
                          key={t}
                          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {preflightError ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    {preflightError}
                  </div>
                ) : null}

                {isLowStock && preflight?.ok === true && preflight.stock_count != null ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    Only {preflight.stock_count} left — order soon.
                  </div>
                ) : null}

                {unavailable ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    This item is currently unavailable.
                  </div>
                ) : null}

                {selectionPrunedWarning ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    {selectionPrunedWarning}
                  </div>
                ) : null}

                {hasBlockedSelections ? (
                  <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
                    Some selected options are no longer available. Please update your choices.
                  </div>
                ) : null}

                <div className="mt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">Customize your order</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Options are validated for availability and required picks before adding to
                        cart.
                      </p>
                    </div>

                    {modifierGroups.length ? (
                      <button
                        type="button"
                        onClick={clearSelections}
                        className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-zinc-300 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                        aria-label="Clear all selections"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>

                  {groupsLoading ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <p className="text-sm text-zinc-300">Loading options…</p>
                      <div className="mt-3 grid gap-2">
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-10 animate-pulse rounded-xl bg-white/5"
                            aria-hidden="true"
                          />
                        ))}
                      </div>
                    </div>
                  ) : groupsError ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-zinc-300">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                          <Info className="h-4 w-4 text-zinc-200" aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-white">Options unavailable</p>
                          <p className="mt-1 text-xs text-zinc-500">{groupsError}</p>
                          <button
                            type="button"
                            onClick={() => void loadModifierGroups()}
                            className="mt-3 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                            aria-label="Retry loading options"
                          >
                            Retry
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : !modifierGroups.length ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-zinc-300">
                      No customization options for this item.
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {modifierGroups.map((g) => {
                        const sels = selected[g.id] ?? [];
                        const expanded = Boolean(expandedGroups[g.id]);
                        const valid = isSelectionValidForGroup(g, sels);
                        const rangeLabel = groupSelectionRangeLabel(g);

                        const selectedCount = sels.length;
                        const max = g.max_selections ?? (g.type === 'radio' ? 1 : null);
                        const min = g.min_selections ?? (g.required ? 1 : 0);

                        const subline =
                          g.type === 'radio'
                            ? `${rangeLabel}${selectedCount ? ` • selected` : ''}`
                            : `${rangeLabel}${
                                max != null
                                  ? ` • ${selectedCount}/${max}`
                                  : selectedCount
                                    ? ` • ${selectedCount} selected`
                                    : ''
                              }`;

                        return (
                          <div
                            key={g.id}
                            className={cx(
                              'overflow-hidden rounded-2xl border bg-white/3',
                              valid ? 'border-white/10' : 'border-amber-500/25',
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => toggleGroupExpanded(g.id)}
                              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                              aria-expanded={expanded ? 'true' : 'false'}
                              aria-label={`${g.name} options`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-sm font-semibold text-white">
                                    {g.name}
                                  </p>
                                  {g.required || min > 0 ? (
                                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-200 ring-1 ring-amber-500/25">
                                      Required
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-zinc-300 ring-1 ring-white/10">
                                      Optional
                                    </span>
                                  )}
                                </div>
                                {g.description ? (
                                  <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
                                    {g.description}
                                  </p>
                                ) : (
                                  <p className="mt-0.5 text-xs text-zinc-500">{subline}</p>
                                )}
                                {!valid ? (
                                  <p className="mt-1 text-[11px] font-semibold text-amber-200">
                                    {selectedCount < min
                                      ? `Select at least ${min}`
                                      : max != null
                                        ? `Select up to ${max}`
                                        : 'Selection required'}
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2">
                                {selectedCount ? (
                                  <span className="rounded-full bg-white/5 px-2 py-1 text-[11px] font-semibold text-zinc-200">
                                    {selectedCount} selected
                                  </span>
                                ) : null}
                                <ChevronDown
                                  className={cx(
                                    'h-5 w-5 text-zinc-400 transition',
                                    expanded && 'rotate-180',
                                  )}
                                  aria-hidden="true"
                                />
                              </div>
                            </button>

                            {expanded ? (
                              <div className="border-t border-white/10 px-4 py-3">
                                <div className="grid gap-2">
                                  {g.modifiers.map((m) => {
                                    const on = sels.some((s) => s.id === m.id);
                                    const disabled = !m.available;

                                    return (
                                      <button
                                        key={m.id}
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setSelectionForGroup(g, m)}
                                        className={cx(
                                          'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition',
                                          on
                                            ? 'border-amber-500/30 bg-amber-500/10'
                                            : 'border-white/10 bg-white/5 hover:bg-white/8',
                                          disabled &&
                                            'cursor-not-allowed opacity-50 hover:bg-white/5',
                                        )}
                                        aria-pressed={on ? 'true' : 'false'}
                                        aria-label={`${m.name}${disabled ? ', unavailable' : ''}`}
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-white">
                                            {m.name}
                                          </p>
                                          <p className="mt-0.5 text-[11px] text-zinc-500">
                                            {m.price_adjustment !== 0
                                              ? `${m.price_adjustment > 0 ? '+' : ''}${fmtUsdFromCents(m.price_adjustment)}`
                                              : 'No extra cost'}
                                            {!m.available ? ' • Unavailable' : ''}
                                          </p>
                                        </div>

                                        <div className="shrink-0">
                                          {on ? (
                                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
                                              <Check
                                                className="h-4 w-4 text-amber-200"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          ) : (
                                            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
                                              <span
                                                className="h-2 w-2 rounded-full bg-white/20"
                                                aria-hidden="true"
                                              />
                                            </span>
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>

                                {maxSelectionHint ? (
                                  <p className="mt-3 text-xs font-semibold text-amber-200">
                                    {maxSelectionHint}
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <p className="text-sm font-semibold text-white">Special instructions</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    Allergy notes, “no onions”, “extra crispy”, etc.
                  </p>

                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    maxLength={600}
                    className={cx(
                      'mt-3 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white',
                      'placeholder:text-zinc-500 outline-none',
                      'focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
                    )}
                    placeholder="Add a note for the kitchen (optional)…"
                    aria-label="Special instructions"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {clampInt(notes.length, 0, 999)} / 600
                  </p>
                </div>

                {requiredHint ? (
                  <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
                    {requiredHint}
                  </div>
                ) : null}

                <div className="h-4" aria-hidden="true" />
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-white/10 bg-neutral-950/90 backdrop-blur supports-backdrop-filter:bg-neutral-950/70">
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1">
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-white/10 disabled:opacity-40"
                      onClick={() => setQty((q) => clampInt(q - 1, 1, maxQty))}
                      disabled={safeQty <= 1 || preflightLoading || invalidItem}
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>

                    <div className="min-w-3rem text-center font-semibold tabular-nums">
                      {safeQty}
                    </div>

                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-white hover:bg-white/10 disabled:opacity-40"
                      onClick={() => setQty((q) => clampInt(q + 1, 1, maxQty))}
                      disabled={safeQty >= maxQty || preflightLoading || invalidItem}
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs text-zinc-400">Total</p>
                    <p className="truncate text-lg font-bold text-white">{stickyTotalLabel}</p>
                    <p className="text-[11px] text-zinc-500">
                      {preflightLoading ? 'Checking…' : preflight?.ok === true ? '' : '—'}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={cx(
                    'h-12 rounded-2xl px-5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                    canAdd && !invalidItem
                      ? 'bg-amber-500 text-black hover:opacity-95'
                      : 'cursor-not-allowed bg-white/10 text-zinc-400',
                  )}
                  onClick={handleAddToCart}
                  disabled={!canAdd || phase !== 'idle' || invalidItem}
                  aria-disabled={!canAdd || phase !== 'idle' || invalidItem ? 'true' : 'false'}
                  aria-label="Add to order"
                >
                  {invalidItem
                    ? 'Unavailable'
                    : preflightLoading
                      ? 'Checking…'
                      : phase === 'adding'
                        ? 'Adding…'
                        : phase === 'success'
                          ? 'Added!'
                          : unavailable
                            ? 'Unavailable'
                            : !modifierRulesOk
                              ? 'Choose options'
                              : 'Add to Order'}
                </button>
              </div>

              {!modifierRulesOk && !invalidItem ? (
                <p className="mt-2 text-center text-[11px] font-semibold text-amber-200">
                  Choose required options to continue.
                </p>
              ) : null}

              <p className="mt-2 text-center text-[11px] text-zinc-500">
                Final totals (tax, promos, credits) are enforced again at checkout by server +
                Stripe.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}