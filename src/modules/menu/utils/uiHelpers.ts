// =============================================================================
// PATH: src/modules/menu/utils/uiHelpers.ts
// =============================================================================
// Tiny DOM / className helpers shared across menu UI components.
// No React, no Supabase — pure functions only.
// =============================================================================

/** Joins truthy class strings, filtering out falsy values. */
export function cx(...c: Array<string | false | null | undefined>): string {
  return c.filter(Boolean).join(' ');
}

/** Returns all focusable, non-hidden, non-disabled elements within a container. */
export function getFocusable(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])';
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(selector));
  return nodes.filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true',
  );
}