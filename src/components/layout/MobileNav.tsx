// src/components/layout/MobileNav.tsx
// =============================================================================
// DEPRECATED — Legacy mobile nav, replaced by BottomNav inside MobileDockShell.
//
// This component previously rendered its own `fixed bottom-0 z-50` nav bar,
// creating a DUPLICATE fixed dock. Now renders nothing.
//
// The export is kept so existing imports compile without error.
// Remove all <MobileNav /> usage from layouts/pages, then delete this file.
// =============================================================================

export function MobileNav() {
  return null;
}

export default MobileNav;