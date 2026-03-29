// =============================================================================
// src/pages/Admin/Marketing/CampaignManager.tsx
// =============================================================================
// Admin UI for campaigns (2026 hardened)
// - List campaigns
// - Create/Edit campaign
// - Schedule start/end
// - Activate/Deactivate
// - Pin Featured (single winner per placement, enforced server-side)
// - Rotate now (server-side rotation)
//
// SECURITY + CONTRACT
// - This page must NOT call supabase.functions.invoke('admin-gateway') directly.
// - All privileged reads/writes must route through the Growth service, which
//   calls the SINGLE typed gateway client (callAdminGateway).
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign } from '@/features/admin/growth/growth.types';
import {
  fetchCampaigns,
  toggleCampaign,
  createCampaign,
  updateCampaign,
  pinFeaturedCampaign,
  runCampaignRotation,
  deleteCampaign,
} from '@/features/admin/growth/growth.service';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Badge,
  Skeleton,
  EmptyState,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmtTime = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—');

function relativeFromNow(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const t = d.getTime();
  if (Number.isNaN(t)) return '—';
  const diffMs = t - Date.now();
  const abs = Math.abs(diffMs);
  const sign = diffMs < 0 ? -1 : 1;

  const mins = Math.round(abs / 60_000);
  if (mins < 60) return sign < 0 ? `${mins}m ago` : `in ${mins}m`;

  const hrs = Math.round(abs / 3_600_000);
  if (hrs < 48) return sign < 0 ? `${hrs}h ago` : `in ${hrs}h`;

  const days = Math.round(abs / 86_400_000);
  return sign < 0 ? `${days}d ago` : `in ${days}d`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe readers (avoid any)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(obj: unknown, keys: string[]): string | undefined {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function readNumber(obj: unknown, keys: string[]): number | undefined {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

function readBool(obj: unknown, keys: string[]): boolean | undefined {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'boolean') return v;
  }
  return undefined;
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return min;
  const x = Math.trunc(n);
  return Math.max(min, Math.min(max, x));
}

function safeTrim(v: unknown, max = 10_000): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function isUuidLike(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoMs(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge styling (NO variant prop in your BadgeProps)
// ─────────────────────────────────────────────────────────────────────────────

type BadgeTone = 'success' | 'warn' | 'info' | 'danger' | 'default';

function badgeClass(tone: BadgeTone): string {
  switch (tone) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
    case 'warn':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
    case 'info':
      return 'bg-sky-500/15 text-sky-300 border border-sky-500/25';
    case 'danger':
      return 'bg-red-500/15 text-red-300 border border-red-500/25';
    default:
      return 'bg-zinc-700/30 text-zinc-200 border border-zinc-700/40';
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'active'
      ? 'success'
      : status === 'paused'
        ? 'warn'
        : status === 'completed'
          ? 'info'
          : status === 'draft'
            ? 'default'
            : 'default';

  return <Badge className={badgeClass(tone)}>{status}</Badge>;
}

function ChannelBadge({ channel }: { channel: string }) {
  return <Badge className={badgeClass('default')}>{channel}</Badge>;
}

function FlagBadge({ tone, label }: { tone: BadgeTone; label: string }) {
  return <Badge className={badgeClass(tone)}>{label}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datetime helpers (local input <-> ISO)
// ─────────────────────────────────────────────────────────────────────────────

function toLocalDT(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}`;
}

function fromLocalDT(local: string): string | null {
  const s = String(local ?? '').trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign field normalizers (defensive across old/new shapes)
// ─────────────────────────────────────────────────────────────────────────────

type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft' | 'unknown';

function getActiveFlag(c: Campaign): boolean | null {
  const b = readBool(c, ['active']);
  return typeof b === 'boolean' ? b : null;
}

function getCampaignStatus(c: Campaign): CampaignStatus {
  const s = readString(c, ['status']);
  if (s === 'active' || s === 'paused' || s === 'completed' || s === 'draft') return s;

  // Fallback for shapes that only include boolean "active"
  const active = getActiveFlag(c);
  if (active === true) return 'active';
  if (active === false) return 'paused';
  return 'draft';
}

// NOTE: readString is defined once above (module-level safe readers section).
// The duplicate declaration that previously appeared here has been removed.
// getStartedAt was also removed — it was unused throughout the component.

function getSentCount(c: Campaign): number {
  return readNumber(c, ['sentCount', 'sent_count']) ?? 0;
}

function getOpenCount(c: Campaign): number {
  return readNumber(c, ['openCount', 'open_count']) ?? 0;
}

function getConversionCount(c: Campaign): number {
  return readNumber(c, ['conversionCount', 'conversion_count']) ?? 0;
}

function getRevenueCents(c: Campaign): number {
  return readNumber(c, ['revenueCents', 'revenue_cents']) ?? 0;
}

function getChannel(c: Campaign): string {
  const raw = (c as unknown as { channel?: unknown }).channel;
  return typeof raw === 'string' && raw.length ? raw : 'other';
}

function getPlacement(c: Campaign): string {
  return readString(c, ['placement', 'channel']) ?? getChannel(c);
}

function getIsFeatured(c: Campaign): boolean {
  return readBool(c, ['is_featured', 'featured', 'isFeatured']) ?? false;
}

function getEligibleForRotation(c: Campaign): boolean {
  return readBool(c, ['eligible_for_rotation', 'eligibleForRotation']) ?? true;
}

function getMenuItemId(c: Campaign): string {
  return readString(c, ['menu_item_id', 'menuItemId']) ?? '';
}

function getHeroTitle(c: Campaign): string {
  return readString(c, ['hero_title', 'heroTitle']) ?? '';
}

function getHeroSubtitle(c: Campaign): string {
  return readString(c, ['hero_subtitle', 'heroSubtitle']) ?? '';
}

function getBadgeText(c: Campaign): string {
  return readString(c, ['badge']) ?? '';
}

function getCtaLabel(c: Campaign): string {
  return readString(c, ['cta_label', 'ctaLabel']) ?? '';
}

function getDeepLink(c: Campaign): string {
  return readString(c, ['deep_link', 'deepLink']) ?? '';
}

function getPriority(c: Campaign): number {
  return readNumber(c, ['priority']) ?? 0;
}

function getWeight(c: Campaign): number {
  return readNumber(c, ['weight']) ?? 0;
}

function getStartsAt(c: Campaign): string | null {
  return readString(c, ['starts_at', 'startsAt']) ?? null;
}

function getEndsAt(c: Campaign): string | null {
  return readString(c, ['ends_at', 'endsAt']) ?? null;
}

type ScheduleState = 'always' | 'upcoming' | 'live' | 'ended' | 'invalid';

function getScheduleState(c: Campaign): { state: ScheduleState; nextChangeIso: string | null } {
  const sMs = parseIsoMs(getStartsAt(c));
  const eMs = parseIsoMs(getEndsAt(c));
  const now = Date.now();

  if ((getStartsAt(c) && sMs == null) || (getEndsAt(c) && eMs == null)) {
    return { state: 'invalid', nextChangeIso: null };
  }

  if (sMs == null && eMs == null) return { state: 'always', nextChangeIso: null };

  if (sMs != null && now < sMs)
    return { state: 'upcoming', nextChangeIso: new Date(sMs).toISOString() };

  if (eMs != null && now >= eMs) return { state: 'ended', nextChangeIso: null };

  if (eMs != null) return { state: 'live', nextChangeIso: new Date(eMs).toISOString() };
  return { state: 'live', nextChangeIso: null };
}

function scheduleBadgeTone(state: ScheduleState): BadgeTone {
  switch (state) {
    case 'live':
      return 'success';
    case 'upcoming':
      return 'info';
    case 'ended':
      return 'default';
    case 'invalid':
      return 'danger';
    default:
      return 'default';
  }
}

function scheduleLabel(state: ScheduleState, nextChangeIso: string | null): string {
  if (state === 'always') return 'Always on';
  if (state === 'invalid') return 'Bad dates';
  if (state === 'ended') return 'Ended';
  if (state === 'upcoming')
    return nextChangeIso
      ? `Starts ${fmtDate(nextChangeIso)} • ${fmtTime(nextChangeIso)}`
      : 'Upcoming';
  if (state === 'live')
    return nextChangeIso ? `Ends ${fmtDate(nextChangeIso)} • ${fmtTime(nextChangeIso)}` : 'Live';
  return '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal (Create/Edit)
// ─────────────────────────────────────────────────────────────────────────────

type CampaignDraft = {
  id?: string;
  campaign_name: string;
  placement: string;
  menu_item_id: string;
  badge: string;
  hero_title: string;
  hero_subtitle: string;
  cta_label: string;
  deep_link: string;
  starts_at_local: string;
  ends_at_local: string;
  active: boolean;
  is_featured: boolean;
  eligible_for_rotation: boolean;
  priority: number;
  weight: number;
};

function draftEquals(a: CampaignDraft, b: CampaignDraft): boolean {
  return (
    (a.id ?? '') === (b.id ?? '') &&
    a.campaign_name === b.campaign_name &&
    a.placement === b.placement &&
    a.menu_item_id === b.menu_item_id &&
    a.badge === b.badge &&
    a.hero_title === b.hero_title &&
    a.hero_subtitle === b.hero_subtitle &&
    a.cta_label === b.cta_label &&
    a.deep_link === b.deep_link &&
    a.starts_at_local === b.starts_at_local &&
    a.ends_at_local === b.ends_at_local &&
    a.active === b.active &&
    a.is_featured === b.is_featured &&
    a.eligible_for_rotation === b.eligible_for_rotation &&
    a.priority === b.priority &&
    a.weight === b.weight
  );
}

function CampaignModal({
  open,
  mode,
  busy,
  initial,
  error,
  onClose,
  onSave,
  onPreview,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  busy: boolean;
  initial: CampaignDraft;
  error: string | null;
  onClose: () => void;
  onSave: (next: CampaignDraft) => void;
  onPreview: (next: CampaignDraft) => void;
}) {
  const [draft, setDraft] = useState<CampaignDraft>(initial);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const titleId = mode === 'create' ? 'campaign-modal-title-create' : 'campaign-modal-title-edit';

  useEffect(() => {
    if (!open) return;
    setDraft(initial);
  }, [open, initial]);

  const dirty = useMemo(() => !draftEquals(draft, initial), [draft, initial]);

  useEffect(() => {
    if (!open) return;
    prevFocusRef.current = (document.activeElement as HTMLElement) ?? null;
    const t = window.setTimeout(() => {
      firstInputRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(t);
      prevFocusRef.current?.focus?.();
      prevFocusRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!busy) {
          if (dirty && !window.confirm('Discard changes?')) return;
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose, dirty]);

  const validation = useMemo(() => {
    const errs: string[] = [];
    const name = draft.campaign_name.trim();
    const placement = draft.placement.trim();

    if (!name) errs.push('Campaign name is required.');
    if (!placement) errs.push('Placement is required.');

    const menuId = draft.menu_item_id.trim();
    if (menuId && !isUuidLike(menuId)) errs.push('Menu item UUID is not a valid UUID.');

    const startsIso = fromLocalDT(draft.starts_at_local);
    const endsIso = fromLocalDT(draft.ends_at_local);
    if (startsIso && endsIso) {
      const a = Date.parse(startsIso);
      const b = Date.parse(endsIso);
      if (Number.isFinite(a) && Number.isFinite(b) && b <= a)
        errs.push('End time must be after start time.');
    }

    const weight = clampInt(draft.weight, 0, 1_000_000);
    if (draft.eligible_for_rotation && weight <= 0)
      errs.push('Rotation weight should be > 0 when in rotation pool.');

    return { ok: errs.length === 0, errs };
  }, [draft]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/60 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-zinc-800 bg-[#0d0d10] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <p id={titleId} className="text-sm font-black text-white">
              {mode === 'create' ? 'New Campaign' : 'Edit Campaign'}
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Writes are admin-only via admin-gateway (service role in Edge).
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ActionButton size="sm" onClick={() => onPreview(draft)} disabled={busy}>
              Preview on /menu
            </ActionButton>
            <ActionButton
              size="sm"
              onClick={() => {
                if (busy) return;
                if (dirty && !window.confirm('Discard changes?')) return;
                onClose();
              }}
              disabled={busy}
              aria-label="Close modal"
            >
              Close
            </ActionButton>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400"
            >
              {error}
            </div>
          )}

          {!validation.ok ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-200">
              <div className="font-semibold">Fix before saving:</div>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">
                {validation.errs.slice(0, 6).map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] font-mono text-zinc-500">Campaign name</span>
              <input
                ref={firstInputRef}
                value={draft.campaign_name}
                onChange={(e) => setDraft((p) => ({ ...p, campaign_name: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="Chilaquiles Deal"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Placement</span>
              <input
                value={draft.placement}
                onChange={(e) => setDraft((p) => ({ ...p, placement: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="menu_deals_rail"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Menu item UUID</span>
              <input
                value={draft.menu_item_id}
                onChange={(e) => setDraft((p) => ({ ...p, menu_item_id: e.target.value.trim() }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="e.g. eb428883-5539-4dc5-afd0-bdef9516791b"
                disabled={busy}
              />
              {draft.menu_item_id.trim() && !isUuidLike(draft.menu_item_id.trim()) ? (
                <p className="text-[11px] text-red-400">Not a valid UUID.</p>
              ) : null}
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Hero title</span>
              <input
                value={draft.hero_title}
                onChange={(e) => setDraft((p) => ({ ...p, hero_title: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="Chilaquiles Special"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Hero subtitle</span>
              <input
                value={draft.hero_subtitle}
                onChange={(e) => setDraft((p) => ({ ...p, hero_subtitle: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="Tap to see details"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Badge</span>
              <input
                value={draft.badge}
                onChange={(e) => setDraft((p) => ({ ...p, badge: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="DEAL"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">CTA label</span>
              <input
                value={draft.cta_label}
                onChange={(e) => setDraft((p) => ({ ...p, cta_label: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="See deal"
                disabled={busy}
              />
            </label>

            <label className="space-y-1 md:col-span-2">
              <span className="text-[11px] font-mono text-zinc-500">Deep link (optional)</span>
              <input
                value={draft.deep_link}
                onChange={(e) => setDraft((p) => ({ ...p, deep_link: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                placeholder="/menu"
                disabled={busy}
              />
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Starts</span>
              <input
                type="datetime-local"
                value={draft.starts_at_local}
                onChange={(e) => setDraft((p) => ({ ...p, starts_at_local: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                disabled={busy}
              />
              {draft.starts_at_local ? (
                <p className="text-[11px] text-zinc-600">
                  {relativeFromNow(fromLocalDT(draft.starts_at_local))}
                </p>
              ) : null}
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Ends</span>
              <input
                type="datetime-local"
                value={draft.ends_at_local}
                onChange={(e) => setDraft((p) => ({ ...p, ends_at_local: e.target.value }))}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                disabled={busy}
              />
              {draft.ends_at_local ? (
                <p className="text-[11px] text-zinc-600">
                  {relativeFromNow(fromLocalDT(draft.ends_at_local))}
                </p>
              ) : null}
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Priority</span>
              <input
                type="number"
                value={draft.priority}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, priority: clampInt(e.target.value, 0, 1_000_000) }))
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                disabled={busy}
              />
              <p className="text-[11px] text-zinc-600">
                Higher priority can win within a placement.
              </p>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-mono text-zinc-500">Weight</span>
              <input
                type="number"
                value={draft.weight}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, weight: clampInt(e.target.value, 0, 1_000_000) }))
                }
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
                disabled={busy}
              />
              <p className="text-[11px] text-zinc-600">Higher weight increases rotation odds.</p>
            </label>

            <button
              type="button"
              onClick={() => setDraft((p) => ({ ...p, is_featured: !p.is_featured }))}
              className={`md:col-span-2 w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                draft.is_featured
                  ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
              }`}
              disabled={busy}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Pin featured (instant)</span>
                <span className="font-mono text-xs">{draft.is_featured ? 'ON' : 'OFF'}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Featured takes priority in /menu deals rail immediately.
              </p>
            </button>

            <button
              type="button"
              onClick={() =>
                setDraft((p) => ({ ...p, eligible_for_rotation: !p.eligible_for_rotation }))
              }
              className={`md:col-span-2 w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                draft.eligible_for_rotation
                  ? 'border-sky-500/25 bg-sky-500/10 text-sky-200'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
              }`}
              disabled={busy}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Auto-rotate pool</span>
                <span className="font-mono text-xs">
                  {draft.eligible_for_rotation ? 'IN' : 'OUT'}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                When enabled, rotation job can choose this campaign.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setDraft((p) => ({ ...p, active: !p.active }))}
              className={`md:col-span-2 w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                draft.active
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
              }`}
              disabled={busy}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">Active</span>
                <span className="font-mono text-xs">{draft.active ? 'ON' : 'OFF'}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-zinc-500">
                Inactive campaigns never show on /menu.
              </p>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-4">
          <p className="text-[11px] text-zinc-600">
            Scheduling is enforced server-side by the Edge function.
          </p>
          <ActionButton
            size="sm"
            onClick={() => onSave(draft)}
            disabled={
              busy ||
              !draft.campaign_name.trim() ||
              !draft.placement.trim() ||
              (draft.menu_item_id.trim() ? !isUuidLike(draft.menu_item_id.trim()) : false) ||
              !validation.ok
            }
          >
            {busy ? 'Saving…' : 'Save'}
          </ActionButton>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const CampaignManager = memo(function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [filters, setFilters] = useState<{
    q: string;
    placement: string;
    onlyActive: boolean;
    onlyFeatured: boolean;
    schedule: 'all' | 'live' | 'upcoming' | 'ended';
  }>({
    q: '',
    placement: '',
    onlyActive: false,
    onlyFeatured: false,
    schedule: 'all',
  });

  const [sort, setSort] = useState<{
    key: 'revenue' | 'status' | 'schedule' | 'priority' | 'name';
    dir: 'asc' | 'desc';
  }>({
    key: 'schedule',
    dir: 'asc',
  });

  const [autoRefresh, setAutoRefresh] = useState(true);
  const [autoRefreshSec, setAutoRefreshSec] = useState(30);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [modalInitial, setModalInitial] = useState<CampaignDraft>({
    campaign_name: '',
    placement: 'menu_deals_rail',
    menu_item_id: '',
    badge: 'DEAL',
    hero_title: '',
    hero_subtitle: 'Tap to see details',
    cta_label: 'See deal',
    deep_link: '/menu',
    starts_at_local: '',
    ends_at_local: '',
    active: true,
    is_featured: false,
    eligible_for_rotation: true,
    priority: 0,
    weight: 1,
  });

  const lastLoadedAtRef = useRef<string | null>(null);

  const refreshListSilently = useCallback(async (): Promise<Campaign[]> => {
    const data = await fetchCampaigns();
    const list = Array.isArray(data) ? data : [];
    setCampaigns(list);
    lastLoadedAtRef.current = nowIso();
    return list;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await refreshListSilently();
    } catch (e) {
      setCampaigns([]);
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, [refreshListSilently]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const sec = clampInt(autoRefreshSec, 10, 300);
    const t = window.setInterval(() => {
      void refreshListSilently().catch(() => {
        // silent; UI already has manual refresh + error surface on actions
      });
    }, sec * 1000);
    return () => window.clearInterval(t);
  }, [autoRefresh, autoRefreshSec, refreshListSilently]);

  const placements = useMemo(() => {
    const set = new Set<string>();
    for (const c of campaigns) {
      const p = safeTrim(getPlacement(c), 200);
      if (p) set.add(p);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [campaigns]);

  const handleToggle = useCallback(
    async (c: Campaign) => {
      const currentActive = getActiveFlag(c) ?? getCampaignStatus(c) === 'active';
      const nextActive = !currentActive;
      const prevStatus = getCampaignStatus(c);

      setBusyId(c.id);
      setError(null);

      setCampaigns((prev) =>
        prev.map((x) =>
          x.id === c.id
            ? ({
                ...x,
                status: nextActive ? 'active' : 'paused',
                active: nextActive,
              } as unknown as Campaign)
            : x,
        ),
      );

      try {
        await toggleCampaign(c.id, nextActive);
      } catch (e) {
        setCampaigns((prev) =>
          prev.map((x) =>
            x.id === c.id
              ? ({
                  ...x,
                  status: prevStatus,
                  active: currentActive,
                } as unknown as Campaign)
              : x,
          ),
        );
        setError(e instanceof Error ? e.message : 'Failed to update campaign');
      } finally {
        setBusyId(null);
      }
    },
    [setCampaigns],
  );

  const handlePinFeatured = useCallback(
    async (c: Campaign) => {
      const placement = getPlacement(c) || 'menu_deals_rail';
      if (
        !window.confirm(
          `Pin "${c.name}" as featured for "${placement}"? (replaces existing featured)`,
        )
      )
        return;

      setBusyId(c.id);
      setError(null);

      setCampaigns((prev) =>
        prev.map((x) => {
          if (getPlacement(x) !== placement) return x;
          return {
            ...x,
            is_featured: x.id === c.id,
            featured: x.id === c.id,
            isFeatured: x.id === c.id,
          } as unknown as Campaign;
        }),
      );

      try {
        await pinFeaturedCampaign({ id: c.id, placement });
        await refreshListSilently();
      } catch (e) {
        await refreshListSilently();
        setError(e instanceof Error ? e.message : 'Failed to pin featured campaign');
      } finally {
        setBusyId(null);
      }
    },
    [refreshListSilently],
  );

  const openCreate = useCallback(() => {
    setModalErr(null);
    setModalMode('create');
    setModalInitial({
      campaign_name: '',
      placement: 'menu_deals_rail',
      menu_item_id: '',
      badge: 'DEAL',
      hero_title: '',
      hero_subtitle: 'Tap to see details',
      cta_label: 'See deal',
      deep_link: '/menu',
      starts_at_local: '',
      ends_at_local: '',
      active: true,
      is_featured: false,
      eligible_for_rotation: true,
      priority: 0,
      weight: 1,
    });
    setModalOpen(true);
  }, []);

  const openDuplicate = useCallback((c: Campaign) => {
    setModalErr(null);
    setModalMode('create');
    setModalInitial({
      campaign_name: `${(readString(c, ['campaign_name', 'name']) ?? c.name ?? '').trim()} (Copy)`,
      placement: getPlacement(c) || 'menu_deals_rail',
      menu_item_id: getMenuItemId(c),
      badge: getBadgeText(c) || 'DEAL',
      hero_title: getHeroTitle(c),
      hero_subtitle: getHeroSubtitle(c) || 'Tap to see details',
      cta_label: getCtaLabel(c) || 'See deal',
      deep_link: getDeepLink(c) || '/menu',
      starts_at_local: '',
      ends_at_local: '',
      active: false,
      is_featured: false,
      eligible_for_rotation: getEligibleForRotation(c),
      priority: getPriority(c),
      weight: Math.max(1, getWeight(c)),
    });
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((c: Campaign) => {
    setModalErr(null);
    setModalMode('edit');
    setModalInitial({
      id: c.id,
      campaign_name: (readString(c, ['campaign_name', 'name']) ?? c.name ?? '').trim(),
      placement: getPlacement(c) || 'menu_deals_rail',
      menu_item_id: getMenuItemId(c),
      badge: getBadgeText(c) || 'DEAL',
      hero_title: getHeroTitle(c),
      hero_subtitle: getHeroSubtitle(c) || 'Tap to see details',
      cta_label: getCtaLabel(c) || 'See deal',
      deep_link: getDeepLink(c) || '/menu',
      starts_at_local: toLocalDT(getStartsAt(c)),
      ends_at_local: toLocalDT(getEndsAt(c)),
      active: getActiveFlag(c) ?? getCampaignStatus(c) === 'active',
      is_featured: getIsFeatured(c),
      eligible_for_rotation: getEligibleForRotation(c),
      priority: getPriority(c),
      weight: getWeight(c),
    });
    setModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (c: Campaign) => {
    const name = (c.name ?? 'this campaign').trim();
    setDeleteTarget({ id: c.id, name });
    setDeleteConfirmOpen(true);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteCampaign(deleteTarget.id);
      setCampaigns((prev) => prev.filter((x) => x.id !== deleteTarget.id));
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete campaign');
      setDeleteConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget]);

  const handlePreview = useCallback((draft: CampaignDraft) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const link = (draft.deep_link && draft.deep_link.trim()) || '/menu';
    const url = link.startsWith('http') ? link : `${base}${link}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const copyToClipboard = useCallback(async (text: string) => {
    const s = safeTrim(text, 4000);
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s);
    } catch {
      const el = document.createElement('textarea');
      el.value = s;
      el.style.position = 'fixed';
      el.style.left = '-9999px';
      document.body.appendChild(el);
      el.select();
      try {
        document.execCommand('copy');
      } catch {
        // ignore
      } finally {
        document.body.removeChild(el);
      }
    }
  }, []);

  function extractCreatedId(result: unknown): string | null {
    if (!isRecord(result)) return null;
    const id = result.id;
    return typeof id === 'string' && id.trim() ? id : null;
  }

  const handleSave = useCallback(
    async (draft: CampaignDraft) => {
      setModalBusy(true);
      setModalErr(null);

      const startsIso = fromLocalDT(draft.starts_at_local);
      const endsIso = fromLocalDT(draft.ends_at_local);

      const basePayload = {
        campaign_name: draft.campaign_name.trim(),
        placement: draft.placement.trim(),
        menu_item_id: draft.menu_item_id.trim() || null,
        badge: draft.badge.trim() || null,
        hero_title: draft.hero_title.trim() || null,
        hero_subtitle: draft.hero_subtitle.trim() || null,
        cta_label: draft.cta_label.trim() || null,
        deep_link: draft.deep_link.trim() || null,
        starts_at: startsIso,
        ends_at: endsIso,
        active: Boolean(draft.active),
        is_featured: Boolean(draft.is_featured),
        eligible_for_rotation: Boolean(draft.eligible_for_rotation),
        priority: clampInt(draft.priority, 0, 1_000_000),
        weight: clampInt(draft.weight, 0, 1_000_000),
      } as const;

      try {
        let campaignId: string | null = draft.id ?? null;

        if (modalMode === 'create') {
          const res = await createCampaign(basePayload);
          campaignId = extractCreatedId(res);

          if (!campaignId) {
            const list = await refreshListSilently();
            const match = list.find((c) => {
              const nm = (readString(c, ['campaign_name', 'name']) ?? c.name ?? '').trim();
              return nm === basePayload.campaign_name && getPlacement(c) === basePayload.placement;
            });
            campaignId = match?.id ?? null;
          }
        } else {
          if (!draft.id) throw new Error('Missing campaign id');
          await updateCampaign({ id: draft.id, ...basePayload });
          campaignId = draft.id;
        }

        if (basePayload.is_featured && campaignId) {
          await pinFeaturedCampaign({ id: campaignId, placement: basePayload.placement });
        }

        setModalOpen(false);
        await refreshListSilently();
      } catch (e) {
        setModalErr(e instanceof Error ? e.message : 'Failed to save campaign');
      } finally {
        setModalBusy(false);
      }
    },
    [modalMode, refreshListSilently],
  );

  const handleRunRotation = useCallback(async () => {
    setError(null);
    if (
      !window.confirm('Run campaign rotation now? This will update what customers see immediately.')
    )
      return;

    try {
      await runCampaignRotation();
      await refreshListSilently();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to rotate campaigns');
    }
  }, [refreshListSilently]);

  const totals = useMemo(() => {
    const totalRevenue = campaigns.reduce((s, c) => s + getRevenueCents(c), 0);
    const totalSent = campaigns.reduce((s, c) => s + getSentCount(c), 0);
    const totalOpens = campaigns.reduce((s, c) => s + getOpenCount(c), 0);
    const totalConversions = campaigns.reduce((s, c) => s + getConversionCount(c), 0);

    const activeCampaigns = campaigns.filter((c) => getCampaignStatus(c) === 'active').length;

    const liveNow = campaigns.filter((c) => {
      const active = getActiveFlag(c) ?? getCampaignStatus(c) === 'active';
      const sched = getScheduleState(c).state;
      return active && (sched === 'always' || sched === 'live');
    }).length;

    const upcoming = campaigns.filter((c) => {
      const active = getActiveFlag(c) ?? getCampaignStatus(c) === 'active';
      return active && getScheduleState(c).state === 'upcoming';
    }).length;

    const endingSoon = campaigns.filter((c) => {
      const active = getActiveFlag(c) ?? getCampaignStatus(c) === 'active';
      const info = getScheduleState(c);
      if (!active || info.state !== 'live' || !info.nextChangeIso) return false;
      const ms = parseIsoMs(info.nextChangeIso);
      if (ms == null) return false;
      return ms - Date.now() <= 2 * 60 * 60 * 1000;
    }).length;

    return {
      totalRevenue,
      totalSent,
      totalOpens,
      totalConversions,
      activeCampaigns,
      liveNow,
      upcoming,
      endingSoon,
    };
  }, [campaigns]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const placement = filters.placement.trim();
    const onlyActive = filters.onlyActive;
    const onlyFeatured = filters.onlyFeatured;
    const schedule = filters.schedule;

    return campaigns.filter((c) => {
      if (onlyActive && getCampaignStatus(c) !== 'active') return false;
      if (onlyFeatured && !getIsFeatured(c)) return false;
      if (placement && getPlacement(c) !== placement) return false;

      const sched = getScheduleState(c).state;
      if (schedule !== 'all') {
        if (schedule === 'live') {
          if (!(sched === 'always' || sched === 'live')) return false;
        } else if (schedule !== sched) {
          return false;
        }
      }

      if (!q) return true;
      const name = String(c.name ?? '').toLowerCase();
      const pl = String(getPlacement(c)).toLowerCase();
      const hero = String(getHeroTitle(c)).toLowerCase();
      const badge = String(getBadgeText(c)).toLowerCase();
      return name.includes(q) || pl.includes(q) || hero.includes(q) || badge.includes(q);
    });
  }, [campaigns, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    const list = [...filtered];

    list.sort((a, b) => {
      if (sort.key === 'name') {
        return dir * String(a.name ?? '').localeCompare(String(b.name ?? ''));
      }
      if (sort.key === 'revenue') {
        return dir * (getRevenueCents(a) - getRevenueCents(b));
      }
      if (sort.key === 'priority') {
        return dir * (getPriority(a) - getPriority(b));
      }
      if (sort.key === 'status') {
        return dir * getCampaignStatus(a).localeCompare(getCampaignStatus(b));
      }
      const as = getScheduleState(a).state;
      const bs = getScheduleState(b).state;
      const order = (s: ScheduleState) =>
        s === 'invalid' ? 0 : s === 'upcoming' ? 1 : s === 'live' ? 2 : s === 'always' ? 3 : 4;
      const d0 = order(as) - order(bs);
      if (d0 !== 0) return dir * d0;

      const an = parseIsoMs(getScheduleState(a).nextChangeIso) ?? Number.MAX_SAFE_INTEGER;
      const bn = parseIsoMs(getScheduleState(b).nextChangeIso) ?? Number.MAX_SAFE_INTEGER;
      const d1 = an - bn;
      if (d1 !== 0) return dir * d1;

      return dir * String(a.name ?? '').localeCompare(String(b.name ?? ''));
    });

    return list;
  }, [filtered, sort]);

  const exportCsv = useCallback(() => {
    const rows = sorted.map((c) => {
      const info = getScheduleState(c);
      return {
        id: c.id,
        name: String(c.name ?? ''),
        placement: getPlacement(c),
        status: getCampaignStatus(c),
        active: String(getActiveFlag(c) ?? ''),
        featured: String(getIsFeatured(c)),
        eligible_for_rotation: String(getEligibleForRotation(c)),
        priority: String(getPriority(c)),
        weight: String(getWeight(c)),
        starts_at: getStartsAt(c) ?? '',
        ends_at: getEndsAt(c) ?? '',
        schedule_state: info.state,
        next_change: info.nextChangeIso ?? '',
        menu_item_id: getMenuItemId(c),
        hero_title: getHeroTitle(c),
        badge: getBadgeText(c),
        sent: String(getSentCount(c)),
        opens: String(getOpenCount(c)),
        conversions: String(getConversionCount(c)),
        revenue_cents: String(getRevenueCents(c)),
      };
    });

    const headers = Object.keys(rows[0] ?? { id: '' });
    const escape = (v: string) => {
      const s = String(v ?? '');
      if (/[,"\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
      return s;
    };

    const csv = [
      headers.join(','),
      ...rows.map((r) => headers.map((h) => escape((r as UnknownRecord)[h] as string)).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaigns_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [sorted]);

  const bulkToggle = useCallback(
    async (nextActive: boolean) => {
      const targets = sorted.filter((c) => {
        const active = getActiveFlag(c) ?? getCampaignStatus(c) === 'active';
        return active !== nextActive;
      });

      if (!targets.length) return;

      const label = nextActive ? 'Activate' : 'Pause';
      if (!window.confirm(`${label} ${targets.length} campaign(s) in current view?`)) return;

      setError(null);

      setCampaigns((prev) =>
        prev.map((x) => {
          const hit = targets.some((t) => t.id === x.id);
          if (!hit) return x;
          return {
            ...x,
            status: nextActive ? 'active' : 'paused',
            active: nextActive,
          } as unknown as Campaign;
        }),
      );

      try {
        for (const c of targets) {
          await toggleCampaign(c.id, nextActive);
        }
        await refreshListSilently();
      } catch (e) {
        await refreshListSilently();
        setError(e instanceof Error ? e.message : 'Bulk update failed');
      }
    },
    [sorted, refreshListSilently],
  );

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Campaigns"
        subtitle="Create, schedule, pin featured, and auto-rotate — admin-only writes via gateway"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <ActionButton size="sm" onClick={openCreate} disabled={loading}>
              New
            </ActionButton>
            <ActionButton size="sm" onClick={handleRunRotation} disabled={loading}>
              Rotate now
            </ActionButton>
            <ActionButton size="sm" onClick={exportCsv} disabled={loading || !sorted.length}>
              Export CSV
            </ActionButton>
            <ActionButton size="sm" onClick={load} disabled={loading}>
              Refresh
            </ActionButton>
          </div>
        }
      />

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Live now" value={String(totals.liveNow)} accent="emerald" />
        <KPICard label="Upcoming" value={String(totals.upcoming)} accent="sky" />
        <KPICard label="Ending soon" value={String(totals.endingSoon)} accent="slate" />
        <KPICard label="Campaign Revenue" value={fmt$(totals.totalRevenue)} accent="amber" />
      </div>

      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800 space-y-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-bold text-zinc-200">All Campaigns</p>
              <p className="text-xs text-zinc-600 mt-0.5">
                {sorted.length} records
                {lastLoadedAtRef.current ? (
                  <span className="ml-2">• Updated {relativeFromNow(lastLoadedAtRef.current)}</span>
                ) : null}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefresh((p) => !p)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  autoRefresh
                    ? 'border-sky-500/25 bg-sky-500/10 text-sky-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
                }`}
              >
                Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
              </button>

              <input
                type="number"
                value={autoRefreshSec}
                onChange={(e) => setAutoRefreshSec(clampInt(e.target.value, 10, 300))}
                className="w-24 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-500/50"
                disabled={!autoRefresh}
                aria-label="Auto refresh seconds"
                title="Auto refresh interval (seconds)"
              />

              <ActionButton
                size="sm"
                onClick={() => void bulkToggle(true)}
                disabled={loading || !sorted.length}
              >
                Activate view
              </ActionButton>
              <ActionButton
                size="sm"
                onClick={() => void bulkToggle(false)}
                disabled={loading || !sorted.length}
              >
                Pause view
              </ActionButton>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
              placeholder="Search name / placement / hero / badge…"
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
            />

            <select
              value={filters.placement}
              onChange={(e) => setFilters((p) => ({ ...p, placement: e.target.value }))}
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
              aria-label="Placement filter"
            >
              <option value="">All placements</option>
              {placements.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <select
              value={filters.schedule}
              onChange={(e) =>
                setFilters((p) => ({ ...p, schedule: e.target.value as typeof filters.schedule }))
              }
              className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-amber-500/50"
              aria-label="Schedule filter"
            >
              <option value="all">All schedule</option>
              <option value="live">Live now</option>
              <option value="upcoming">Upcoming</option>
              <option value="ended">Ended</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFilters((p) => ({ ...p, onlyActive: !p.onlyActive }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  filters.onlyActive
                    ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
                }`}
              >
                {filters.onlyActive ? 'Active only' : 'All statuses'}
              </button>

              <button
                type="button"
                onClick={() => setFilters((p) => ({ ...p, onlyFeatured: !p.onlyFeatured }))}
                className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                  filters.onlyFeatured
                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-200'
                    : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900/60'
                }`}
              >
                {filters.onlyFeatured ? 'Featured' : 'All'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono text-zinc-600">Sort:</span>
            <select
              value={`${sort.key}:${sort.dir}`}
              onChange={(e) => {
                const [key, dir] = String(e.target.value).split(':') as [
                  typeof sort.key,
                  typeof sort.dir,
                ];
                setSort({ key, dir });
              }}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-100 outline-none focus:border-amber-500/50"
            >
              <option value="schedule:asc">Schedule (soonest)</option>
              <option value="schedule:desc">Schedule (latest)</option>
              <option value="revenue:desc">Revenue (high)</option>
              <option value="revenue:asc">Revenue (low)</option>
              <option value="priority:desc">Priority (high)</option>
              <option value="priority:asc">Priority (low)</option>
              <option value="name:asc">Name (A→Z)</option>
              <option value="name:desc">Name (Z→A)</option>
              <option value="status:asc">Status (A→Z)</option>
              <option value="status:desc">Status (Z→A)</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-5">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState title="No campaigns" />
            <p className="mt-2 text-xs text-zinc-600">Create your first campaign to get started.</p>
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Placement</Th>
                <Th>Status</Th>
                <Th>Schedule</Th>
                <Th>Sent</Th>
                <Th>Open</Th>
                <Th>Conv</Th>
                <Th>Revenue</Th>
                <Th>Action</Th>
              </tr>
            </thead>

            <tbody>
              {sorted.map((c) => {
                const sent = getSentCount(c);
                const opens = getOpenCount(c);
                const conversions = getConversionCount(c);
                const status = getCampaignStatus(c);
                const revenue = getRevenueCents(c);
                const placement = getPlacement(c);
                const channel = getChannel(c);

                const isBusy = busyId === c.id;
                const featured = getIsFeatured(c);
                const eligible = getEligibleForRotation(c);

                const sched = getScheduleState(c);
                const schedLabel = scheduleLabel(sched.state, sched.nextChangeIso);

                const deep = getDeepLink(c);
                const badge = getBadgeText(c);

                return (
                  <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                    <Td>
                      <button type="button" onClick={() => openEdit(c)} className="text-left">
                        <span className="font-medium text-zinc-200">{c.name}</span>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          {featured ? <FlagBadge tone="warn" label="FEATURED" /> : null}
                          {!eligible ? <FlagBadge tone="default" label="NO-ROTATE" /> : null}
                          {badge ? <FlagBadge tone="default" label={badge} /> : null}
                        </div>
                        <div className="mt-1 font-mono text-[10px] text-zinc-600">
                          {c.id.slice(0, 8)}
                        </div>
                      </button>
                    </Td>

                    <Td>
                      <div className="flex flex-col gap-1">
                        <ChannelBadge channel={channel} />
                        <span className="font-mono text-[11px] text-zinc-500">
                          {placement || '—'}
                        </span>
                      </div>
                    </Td>

                    <Td>
                      <StatusBadge status={status} />
                    </Td>

                    <Td>
                      <div className="flex flex-col gap-1">
                        <Badge className={badgeClass(scheduleBadgeTone(sched.state))}>
                          {sched.state}
                        </Badge>
                        <span className="text-[11px] text-zinc-500">{schedLabel}</span>
                        {sched.nextChangeIso ? (
                          <span className="text-[11px] text-zinc-600">
                            {relativeFromNow(sched.nextChangeIso)}
                          </span>
                        ) : null}
                      </div>
                    </Td>

                    <Td className="font-mono text-xs text-zinc-400">{sent.toLocaleString()}</Td>
                    <Td className="font-mono text-xs text-zinc-400">{pct(opens, sent)}</Td>
                    <Td className="font-mono text-xs text-zinc-400">{pct(conversions, sent)}</Td>

                    <Td className="font-bold text-amber-400">{fmt$(revenue)}</Td>

                    <Td>
                      <div className="flex flex-wrap items-center gap-2">
                        <ActionButton size="sm" disabled={loading} onClick={() => openEdit(c)}>
                          Edit
                        </ActionButton>

                        <ActionButton size="sm" disabled={isBusy} onClick={() => handleToggle(c)}>
                          {isBusy ? 'Saving…' : status === 'active' ? 'Pause' : 'Activate'}
                        </ActionButton>

                        <ActionButton
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handlePinFeatured(c)}
                        >
                          {isBusy ? '…' : 'Pin'}
                        </ActionButton>

                        <ActionButton size="sm" disabled={loading} onClick={() => openDuplicate(c)}>
                          Duplicate
                        </ActionButton>

                        <ActionButton
                          size="sm"
                          disabled={isBusy || deleting}
                          onClick={() => void handleDelete(c)}
                          className="text-red-400 hover:bg-red-500/10 hover:text-red-300 border-red-500/20"
                        >
                          Delete
                        </ActionButton>

                        {deep ? (
                          <ActionButton
                            size="sm"
                            disabled={loading}
                            onClick={() => void copyToClipboard(deep)}
                          >
                            Copy link
                          </ActionButton>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Panel>

      <CampaignModal
        open={modalOpen}
        mode={modalMode}
        busy={modalBusy}
        initial={modalInitial}
        error={modalErr}
        onClose={() => (modalBusy ? null : setModalOpen(false))}
        onSave={handleSave}
        onPreview={handlePreview}
      />

      {/* ── Delete confirmation dialog ───────────────────────────────────── */}
      {deleteConfirmOpen && deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !deleting && setDeleteConfirmOpen(false)}
          />

          {/* Dialog */}
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-zinc-700/60 bg-zinc-900 p-6 shadow-2xl">
            {/* Icon */}
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20">
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                className="text-red-400"
              >
                <path d="M3 5h14M8 2h4M7 5v11a1 1 0 001 1h4a1 1 0 001-1V5" strokeLinecap="round" />
              </svg>
            </div>

            <h2 id="delete-dialog-title" className="text-base font-semibold text-zinc-100">
              Delete campaign?
            </h2>
            <p className="mt-1.5 text-sm text-zinc-400">
              <span className="font-medium text-zinc-200">{deleteTarget.name}</span> will be
              permanently removed. This cannot be undone.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void confirmDelete()}
                className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Deleting…
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default CampaignManager;