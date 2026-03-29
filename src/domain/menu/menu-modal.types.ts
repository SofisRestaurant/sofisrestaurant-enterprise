// =============================================================================
// PATH: src/domain/menu/menu-modal.types.ts
// =============================================================================
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import type { Database } from '@/types/supabase';
// ── Cart phase ───────
//─────────────────────────────────────────────────────────

export type CartPhase = 'idle' | 'adding' | 'success';

// ── Modifier selection ────────────────────────────────────────────────────────

/** A single modifier the user has toggled on within a group. */
export interface SelectedModifier {
  id: string;
  groupId: string;
  name: string;
  /** Cents — may be negative (discount modifier). */
  priceAdjustment: number;
}

/** Map of groupId → selected modifiers for that group. */
export type SelectionMap = Record<string, SelectedModifier[]>;

// ── Preflight ─────────────────────────────────────────────────────────────────

/** Shape returned by the preflight API when the item is orderable. */
export interface PreflightOk {
  ok: true;
  available: boolean;
  unit_price_cents: number;
  stock_count?: number | null;
  low_stock_threshold?: number | null;
}

/** Shape returned by the preflight API when the item cannot be ordered. */
export interface PreflightFail {
  ok: false;
  reason?: string;
  error?: string;
}

export type PreflightResult = PreflightOk | PreflightFail;

// ── Modal state (surface for hooks) ──────────────────────────────────────────

export interface MenuItemModalState {
  phase: CartPhase;
  notes: string;
  liveStatus: string;
}

// ── Pricing derived values ────────────────────────────────────────────────────

export interface ModalPricingValues {
  unitPriceCents: number;
  modifiersCents: number;
  lineTotalCents: number;
}

export interface ModalPriceLabels {
  /** e.g. "$12.50" */
  basePriceLabel: string;
  /** e.g. "+ $2.00 options" or null */
  extrasLabel: string | null;
  /** e.g. "$14.50" */
  stickyTotalLabel: string;
  /** e.g. "server-confirmed" | "checking…" | "—" */
  headerPriceLabel: string;
}

// ── Availability derived values ───────────────────────────────────────────────

export interface ModalAvailability {
  isLowStock: boolean;
  unavailable: boolean;
  hasBlockedSelections: boolean;
  /** Set of modifier IDs that are no longer available but are still selected. */
  selectionBlockedIds: Set<string>;
}

// ── Validation derived values ─────────────────────────────────────────────────

export interface ModalValidation {
  modifierRulesOk: boolean;
  canAdd: boolean;
  /** Human-readable hint listing missing required groups, or null. */
  requiredHint: string | null;
}

// ── Add-to-cart payload ───────────────────────────────────────────────────────

export interface AddToCartPayload {
  menuItemId: string;
  name: string;
  unitPriceCents: number;
  imageUrl: string | null;
  category: Database['public']['Enums']['menu_category'];
  modifiers: Array<{
    id: string;
    groupId: string;
    name: string;
    priceAdjustment: number;
  }>;
  quantity: number;
  notes: string | null;
  /** Composite hash used for server-side price integrity check. */
  pricingHash: string;
}

// ── Component prop shapes ─────────────────────────────────────────────────────

export interface MenuItemModalProps {
  item: MenuItemPublic;
  onClose: () => void;
}

export interface ModalHeaderProps {
  name: string;
  categoryLabel: string;
  isPopular: boolean;
  basePriceLabel: string;
  headerPriceLabel: string;
  extrasLabel: string | null;
  onClose: () => void;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}

export interface ModalImageProps {
  imageUrl: string | null;
  name: string;
  description: string;
  tags: string[];
}

export interface ModalAlertsProps {
  preflightError: string | null;
  isLowStock: boolean;
  stockCount?: number | null;
  unavailable: boolean;
  selectionPrunedWarning: string | null;
  hasBlockedSelections: boolean;
}

export interface ModalModifiersProps {
  modifierGroups: import('@/domain/menu/menu.types').ModifierGroup[];
  groupsLoading: boolean;
  groupsError: string | null;
  selected: SelectionMap;
  expandedGroups: Record<string, boolean>;
  maxSelectionHint: string | null;
  selectionBlockedIds: Set<string>;
  onClearSelections: () => void;
  onToggleGroup: (groupId: string) => void;
  onSetSelection: (
    group: import('@/domain/menu/menu.types').ModifierGroup,
    modifier: import('@/domain/menu/menu.types').Modifier,
  ) => void;
  onRetryLoad: () => void;
}

export interface ModalModifierGroupProps {
  group: import('@/domain/menu/menu.types').ModifierGroup;
  sels: SelectedModifier[];
  expanded: boolean;
  valid: boolean;
  maxSelectionHint: string | null;
  onToggle: () => void;
  onSetSelection: (
    group: import('@/domain/menu/menu.types').ModifierGroup,
    modifier: import('@/domain/menu/menu.types').Modifier,
  ) => void;
}

export interface ModalNotesProps {
  notes: string;
  maxLength: number;
  onChange: (value: string) => void;
}

export interface ModalQuantityProps {
  safeQty: number;
  maxQty: number;
  preflightLoading: boolean;
  invalidItem: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
}

export interface ModalFooterProps {
  safeQty: number;
  maxQty: number;
  stickyTotalLabel: string;
  preflightLoading: boolean;
  phase: CartPhase;
  canAdd: boolean;
  invalidItem: boolean;
  modifierRulesOk: boolean;
  unavailable: boolean;
  onDecrement: () => void;
  onIncrement: () => void;
  onAddToCart: () => void;
}

// ── Section wrapper props ─────────────────────────────────────────────────────

export interface ModalSectionProps {
  children: React.ReactNode;
  className?: string;
  /** Renders a top-border separator before the section. */
  bordered?: boolean;
}

export interface ModalGroupWrapperProps {
  children: React.ReactNode;
  valid: boolean;
  className?: string;
}