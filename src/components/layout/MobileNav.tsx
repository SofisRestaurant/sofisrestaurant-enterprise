// src/components/layout/MobileNav.tsx
// =============================================================================
// DEPRECATED — Legacy mobile nav, replaced by BottomNav inside MobileDockShell.
//
// This component previously rendered its own `fixed bottom-0` nav bar, which
// created a DUPLICATE fixed dock underneath the MobileDockShell system.
// Two fixed bottom bars with independent positioning caused the scroll bounce.
//
// Now renders nothing.  The export is kept so any existing imports compile
// without error.  Remove all <MobileNav /> usage from layouts/pages, then
// delete this file entirely.
// =============================================================================

export function MobileNav() {
  return null;
}

export default MobileNav;