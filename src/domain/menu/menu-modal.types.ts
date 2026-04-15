// =============================================================================
// PATH: src/domain/menu/menu-modal.types.ts
// =============================================================================
import type { MenuItemPublic, ModifierGroup, Modifier, SelectedModifier } from '@/domain/menu/menu.types';
import type { Database } from '@/types/supabase';

// ── Cart phase ────────────────────────────────────────────────────────────────

export type CartPhase = 'idle' | 'adding' | 'success';

// ── Modifier selection ────────────────────────────────────────────────────────

/**
 * Re-export canonical SelectedModifier from menu.types so modal consumers
 * use one definition only. modifier_group_id is required — never optional.
 */
export type { SelectedModifier };

/**
 * Map of modifier_group_id → selected modifiers for that group.
 * Key is the group's UUID. Value is always an array (never null/undefined).
 */
export type SelectionMap = Record<string, SelectedModifier[]>;

// ── Preflight ─────────────────────────────────────────────────────────────────

export interface PreflightOk {
  ok: true;
  available: boolean;
  unit_price_cents: number;
  stock_count: number | null;
  low_stock_threshold: number | null;
}

export interface PreflightFail {
  ok: false;
  reason: string;
  error?: string;
}

export type PreflightResult = PreflightOk | PreflightFail;

// ── Modal state ───────────────────────────────────────────────────────────────

export interface MenuItemModalState {
  readonly phase: CartPhase;
  readonly notes: string;
  readonly liveStatus: string;
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export interface ModalPricingValues {
  readonly unitPriceCents: number;
  readonly modifiersCents: number;
  readonly lineTotalCents: number;
}

export interface ModalPriceLabels {
  readonly basePriceLabel: string;
  readonly extrasLabel: string | null;
  readonly stickyTotalLabel: string;
  readonly headerPriceLabel: string;
}

// ── Availability ──────────────────────────────────────────────────────────────

export interface ModalAvailability {
  readonly isLowStock: boolean;
  readonly unavailable: boolean;
  readonly hasBlockedSelections: boolean;
  /** Set of modifier IDs that are no longer available but still selected. */
  readonly selectionBlockedIds: ReadonlySet<string>;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ModalValidation {
  readonly modifierRulesOk: boolean;
  readonly canAdd: boolean;
  readonly requiredHint: string | null;
}

// ── Add-to-cart payload ───────────────────────────────────────────────────────

export interface AddToCartPayload {
  readonly menuItemId: string;
  readonly name: string;
  readonly unitPriceCents: number;
  readonly imageUrl: string | null;
  readonly category: Database['public']['Enums']['menu_category'];
  readonly modifiers: ReadonlyArray<{
    readonly id: string;
    /** Required — must match the group this modifier belongs to. */
    readonly groupId: string;
    readonly name: string;
    readonly priceAdjustment: number;
  }>;
  readonly quantity: number;
  readonly notes: string | null;
  /** Composite hash for server-side price integrity check. */
  readonly pricingHash: string;
}

// ── Component props ───────────────────────────────────────────────────────────

export interface MenuItemModalProps {
  readonly item: MenuItemPublic;
  readonly onClose: () => void;
}

export interface ModalHeaderProps {
  readonly name: string;
  readonly categoryLabel: string;
  readonly isPopular: boolean;
  readonly basePriceLabel: string;
  readonly headerPriceLabel: string;
  readonly extrasLabel: string | null;
  readonly onClose: () => void;
  readonly closeBtnRef: React.RefObject<HTMLButtonElement | null>;
}

export interface ModalImageProps {
  readonly imageUrl: string | null;
  readonly name: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export interface ModalAlertsProps {
  readonly preflightError: string | null;
  readonly isLowStock: boolean;
  readonly stockCount: number | null;
  readonly unavailable: boolean;
  readonly selectionPrunedWarning: string | null;
  readonly hasBlockedSelections: boolean;
}

export interface ModalModifiersProps {
  readonly modifierGroups: readonly ModifierGroup[];
  readonly groupsLoading: boolean;
  readonly groupsError: string | null;
  readonly selected: SelectionMap;
  readonly expandedGroups: Record<string, boolean>;
  readonly maxSelectionHint: string | null;
  readonly selectionBlockedIds: ReadonlySet<string>;
  readonly onClearSelections: () => void;
  readonly onToggleGroup: (groupId: string) => void;
  readonly onSetSelection: (group: ModifierGroup, modifier: Modifier) => void;
  readonly onRetryLoad: () => void;
}

export interface ModalModifierGroupProps {
  readonly group: ModifierGroup;
  readonly sels: readonly SelectedModifier[];
  readonly expanded: boolean;
  readonly valid: boolean;
  readonly maxSelectionHint: string | null;
  readonly onToggle: () => void;
  readonly onSetSelection: (group: ModifierGroup, modifier: Modifier) => void;
}

export interface ModalNotesProps {
  readonly notes: string;
  readonly maxLength: number;
  readonly onChange: (value: string) => void;
}

export interface ModalQuantityProps {
  readonly safeQty: number;
  readonly maxQty: number;
  readonly preflightLoading: boolean;
  readonly invalidItem: boolean;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
}

export interface ModalFooterProps {
  readonly safeQty: number;
  readonly maxQty: number;
  readonly stickyTotalLabel: string;
  readonly preflightLoading: boolean;
  readonly phase: CartPhase;
  readonly canAdd: boolean;
  readonly invalidItem: boolean;
  readonly modifierRulesOk: boolean;
  readonly unavailable: boolean;
  readonly onDecrement: () => void;
  readonly onIncrement: () => void;
  readonly onAddToCart: () => void;
}

// ── Section wrapper props ─────────────────────────────────────────────────────

export interface ModalSectionProps {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly bordered?: boolean;
}

export interface ModalGroupWrapperProps {
  readonly children: React.ReactNode;
  readonly valid: boolean;
  readonly className?: string;
}