// src/modules/checkout/components/page/cx.ts
//
// Minimal className combiner used by checkout page sub-components.
// Intentionally not exported from the checkout module root — it is
// page-scoped. If a global solution is added later, delete this file
// and update imports.

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}