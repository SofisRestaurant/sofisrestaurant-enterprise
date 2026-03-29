// =============================================================================
// PATH: src/modules/menu/constants/menuItemModal.constants.ts
// =============================================================================
// Modal-specific constants. Extend (never replace) the existing
// src/modules/menu/constants/index.ts — import from there for shared values.
// =============================================================================

// ── Timing ───────────────────────────────────────────────────────────────────

/** ms after a successful add before the modal auto-closes. */
export const MODAL_SUCCESS_CLOSE_DELAY_MS = 900;

/** ms before the simulated "adding" animation resolves and addItem is called. */
export const MODAL_ADD_DEBOUNCE_MS = 180;

/** ms debounce before a preflight re-fires on qty / id change. */
export const MODAL_PREFLIGHT_DEBOUNCE_MS = 200;

// ── Quantity ─────────────────────────────────────────────────────────────────

/** Default qty shown when the modal first opens. */
export const MODAL_DEFAULT_QTY = 1;

/** Absolute UI ceiling before the server clamps further. */
export const MODAL_UI_MAX_QTY = 99;

// ── Notes ────────────────────────────────────────────────────────────────────

/** Maximum characters allowed in the special-instructions textarea. */
export const MODAL_MAX_NOTES_LENGTH = 300;

// ── Skeleton ─────────────────────────────────────────────────────────────────

/** IDs used to render skeleton loading rows while modifier groups load. */
export const MODAL_SKELETON_IDS = ['sk-1', 'sk-2', 'sk-3'] as const;

// ── Popularity threshold ──────────────────────────────────────────────────────

/** popularity_score >= this → show "Popular" badge. */
export const MODAL_POPULARITY_SCORE_THRESHOLD = 80;

// ── Pricing hash ─────────────────────────────────────────────────────────────

/** Version prefix embedded in every pricingHash to enable server-side migration. */
export const PRICING_HASH_VERSION = 'v2' as const;

// ── Scroll lock ───────────────────────────────────────────────────────────────

/** Token prefix for the scroll-lock system. Final token = `${prefix}:${itemId}`. */
export const MODAL_SCROLL_LOCK_PREFIX = 'menu-item' as const;

// ── Text limits ───────────────────────────────────────────────────────────────

export const MODAL_TAG_DISPLAY_LIMIT = 10;
export const MODAL_REQUIRED_HINT_GROUP_LIMIT = 2;