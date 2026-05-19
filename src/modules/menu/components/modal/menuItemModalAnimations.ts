// =============================================================================
// Shared keyframes for the customer menu item modal (idempotent injection).
// =============================================================================

const STYLE_ID = 'sofi-menu-item-modal-keyframes';

const KEYFRAME_CSS = `
  @keyframes sofi-modal-backdrop {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sofi-modal-dialog {
    from { opacity: 0; transform: scale(0.97) translateY(20px); }
    to   { opacity: 1; transform: scale(1) translateY(0); }
  }
  @keyframes sofi-modal-stagger {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sofi-modal-accordion {
    from { opacity: 0; max-height: 0; }
    to   { opacity: 1; max-height: 720px; }
  }
  @keyframes sofi-modal-img-fade {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
`;

let injected = false;

export function injectMenuItemModalKeyframes(): void {
  if (injected || typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = KEYFRAME_CSS;
  document.head.appendChild(el);
  injected = true;
}

export const MODAL_ANIM = {
  backdrop: 'sofi-modal-backdrop 220ms ease both',
  dialog: 'sofi-modal-dialog 400ms cubic-bezier(0.16, 1, 0.3, 1) both',
  stagger: (delayMs: number) =>
    `sofi-modal-stagger 280ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms both`,
  accordion: 'sofi-modal-accordion 220ms ease both',
  imgFade: 'sofi-modal-img-fade 500ms cubic-bezier(0.16, 1, 0.3, 1) both',
} as const;
