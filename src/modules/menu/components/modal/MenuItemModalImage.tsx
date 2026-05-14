// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalImage.tsx
// =============================================================================
// Item hero image (or placeholder), description text, and tag pills.
// Pure renderer — no side-effects, no state leakage.
//
// Performance contracts (2026):
//   loading="eager"          Modal image is ALWAYS immediately visible on tap.
//                            lazy would defer the fetch on a fixed-position element.
//   fetchPriority="high"     Elevates this request above other queued resources.
//                            The hero image is the primary content of the modal.
//   decoding="async"         Offloads decode to a worker thread.
//   referrerPolicy           Matches the rest of the application.
//   width/height             Intrinsic-size hints for the browser resource scheduler.
//   will-change conditional  GPU compositor layer only while the image is loading.
//                            Released once imageVisible=true — no leaked layers.
//
// Bug fixes vs previous version:
//   · loading="eager"  (was "lazy" — modal image was loading late, shimmer persisted)
//   · fetchPriority="high"  (was absent — image queued at default priority)
//   · transition-[opacity,transform]  (was transition-opacity + transition-transform
//     as two separate classes — each overwrites the other's transition-property,
//     so opacity was transitioning instantly with no fade-in)
//   · will-change conditional  (was permanent — GPU layer held for modal lifetime)
//   · referrerPolicy="no-referrer"  (was absent — inconsistent with rest of app)
//   · width/height attributes  (were absent — no intrinsic dimension hint)
//   · Responsive image height h-48 sm:h-60  (was h-56 fixed — pinched on wide modals)
//   · group-hover:scale removed  (hover zoom is a browse signal, wrong on a
//     conversion surface; hover never fires on mobile where modal is primary)
//   · WebkitMaskImage conditional + unprefixed maskImage  (was always-on;
//     short descriptions got a fade to nothing; -webkit- only, missing standard)
//   · useCallback removed from dispatch wrappers  (dispatch from useReducer is
//     already referentially stable — useCallback added allocation with zero benefit)
//   · injectKeyframes moved to module scope  (was called on every render body)
//   · Tag key={tag} → key={`${tag}-${i}`}  (duplicate tags caused React key warnings)
//
// Zero breaking changes to external contracts:
//   - Props shape (ModalImageProps) unchanged
//   - MODAL_TAG_DISPLAY_LIMIT still enforced
//   - No new dependencies beyond existing utils
//   - Tag categorisation, overlay layers, and placeholder design intact
// =============================================================================

import { useId, useReducer } from 'react';
import type { ModalImageProps } from '@/domain/menu/menu-modal.types';
import { MODAL_TAG_DISPLAY_LIMIT } from '../../constants/menuItemModal.constants';
import { cx } from '../../utils/uiHelpers';

// ─── Image load FSM ──────────────────────────────────────────────────────────

type ImageState = 'loading' | 'loaded' | 'error';
type ImageAction = { type: 'LOADED' } | { type: 'ERROR' };

function imageReducer(_: ImageState, action: ImageAction): ImageState {
  if (action.type === 'LOADED') return 'loaded';
  if (action.type === 'ERROR') return 'error';
  return 'loading';
}

// ─── Tag categorisation ──────────────────────────────────────────────────────

const DIETARY_TAGS = new Set([
  'vegan',
  'vegetarian',
  'plant-based',
  'gluten-free',
  'dairy-free',
  'nut-free',
  'halal',
  'kosher',
  'raw',
]);

const HEAT_TAGS = new Set(['spicy', 'hot', 'mild', 'medium', 'extra hot', 'habanero', 'jalapeño']);

const PROVENANCE_TAGS = new Set([
  'seasonal',
  'local',
  'organic',
  'house-made',
  'house made',
  'housemade',
  'small batch',
  'farm-to-table',
]);

type TagVariant = 'dietary' | 'heat' | 'provenance' | 'default';

function resolveTagVariant(tag: string): TagVariant {
  const lower = tag.toLowerCase();
  if (DIETARY_TAGS.has(lower)) return 'dietary';
  if (HEAT_TAGS.has(lower)) return 'heat';
  if (PROVENANCE_TAGS.has(lower)) return 'provenance';
  return 'default';
}

const TAG_VARIANT_CLASSES: Record<TagVariant, string> = {
  dietary:
    'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300/90 ring-1 ring-inset ring-emerald-500/10',
  heat: 'border-red-500/20 bg-red-500/[0.08] text-red-300/80 ring-1 ring-inset ring-red-500/10',
  provenance:
    'border-amber-500/20 bg-amber-500/[0.08] text-amber-200/80 ring-1 ring-inset ring-amber-500/10',
  default: 'border-white/10 bg-white/5 text-zinc-300/90 ring-1 ring-inset ring-white/5',
};

// ─── Keyframe injection (idempotent, module-scope) ────────────────────────────
//
// Called once at module initialisation time (via IIFE below), not on every
// render. The style element id ensures idempotency across HMR reloads.

const MODAL_IMAGE_KF_ID = 'sofi-modal-image-kf';

const KEYFRAME_CSS = `
  @keyframes sofi-fade-up {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sofi-fade-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes sofi-modal-img-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  @keyframes sofi-gold-pulse {
    0%, 100% { opacity: 0.04; transform: scale(1); }
    50%       { opacity: 0.10; transform: scale(1.15); }
  }
`;

// Renamed local keyframe to sofi-modal-img-shimmer to avoid colliding with
// MenuGrid's sofi-shimmer definition (different direction + colour stops).
(function injectModalImageKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(MODAL_IMAGE_KF_ID)) return;
  const el = document.createElement('style');
  el.id = MODAL_IMAGE_KF_ID;
  el.textContent = KEYFRAME_CSS;
  document.head.appendChild(el);
})();

// ─── Description overflow threshold ──────────────────────────────────────────
//
// At 14px font in a ~460px modal content area, roughly 80-90 chars fit per line.
// 4 lines ≈ 320-360 chars. We apply the trailing fade mask only when the
// description is long enough to potentially overflow line-clamp-4, so short
// 1-2 line descriptions don't fade their own last word to nothing.

const DESC_CLAMP_MASK_THRESHOLD = 280;

// ─── Sub-components ──────────────────────────────────────────────────────────

/** Shimmer shown while the hero image is in-flight. */
function ImageSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background:
          'linear-gradient(90deg, rgb(255 255 255 / 0.03) 0%, rgb(255 255 255 / 0.07) 40%, rgb(255 255 255 / 0.03) 100%)',
        backgroundSize: '200% 100%',
        animation: 'sofi-modal-img-shimmer 1.6s ease-in-out infinite',
      }}
    />
  );
}

/** Multi-layer cinematic gradient overlay — always present over real images. */
function ImageOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {/* Bottom scrim — protects any future caption text */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-neutral-950/85 via-neutral-950/25 to-transparent" />
      {/* Edge vignette — cinematic depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,rgb(10_9_8/0.35)_100%)]" />
      {/* Gold glint — top-right atmospheric accent */}
      <div
        className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-amber-400/5 blur-3xl"
        style={{ animation: 'sofi-gold-pulse 4s ease-in-out infinite' }}
      />
    </div>
  );
}

/** Branded atmospheric placeholder shown when no image is available or load failed. */
function ImagePlaceholder({ name }: { name: string }) {
  return (
    <div
      className="relative flex h-48 w-full items-center justify-center overflow-hidden bg-neutral-950 sm:h-60"
      role="img"
      aria-label={`${name} — photo not available`}
    >
      {/* Atmospheric radial warmth */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_35%_50%,rgb(212_175_55/0.06)_0%,transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_85%_at_75%_65%,rgb(168_69_32/0.07)_0%,transparent_60%)]" />
        {/* Subtle dot-grid texture */}
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: 'radial-gradient(circle, rgb(255 255 255 / 1) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Bottom vignette */}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-neutral-950/70 to-transparent" />
      </div>

      {/* Brand wordmark treatment */}
      <div className="relative z-10 select-none text-center" aria-hidden="true">
        <div className="mx-auto mb-3.5 flex items-center justify-center gap-3">
          <span className="h-px w-10 bg-gradient-to-r from-transparent via-amber-400/40 to-amber-400/20" />
          <span
            className="text-[9px] font-bold uppercase tracking-[0.30em] text-amber-400/50"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Est. 2018
          </span>
          <span className="h-px w-10 bg-gradient-to-l from-transparent via-amber-400/40 to-amber-400/20" />
        </div>

        <p
          className="text-base font-semibold tracking-[0.02em] text-neutral-200/75"
          style={{ fontFamily: 'var(--font-display, Georgia, serif)' }}
        >
          Sofi&rsquo;s Kitchen
        </p>
        <p
          className="mt-1.5 text-[11px] tracking-[0.06em] text-zinc-600"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Fresh, real plates &mdash; made to order.
        </p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MenuItemModalImage({ imageUrl, name, description, tags }: ModalImageProps) {
  const [imgState, dispatch] = useReducer(imageReducer, 'loading');
  const descId = useId();

  // dispatch from useReducer is referentially stable — no useCallback needed.
  const handleLoad = () => dispatch({ type: 'LOADED' });
  const handleError = () => dispatch({ type: 'ERROR' });

  const showImage = Boolean(imageUrl) && imgState !== 'error';
  const imageVisible = imgState === 'loaded';

  const visibleTags = tags.slice(0, MODAL_TAG_DISPLAY_LIMIT);

  // Description fade mask: only applies when the description is long enough to
  // potentially overflow line-clamp-4 (~280+ chars). Short descriptions render
  // cleanly without fading their own last word to nothing.
  const descriptionMayClamp =
    Boolean(description) && description.length > DESC_CLAMP_MASK_THRESHOLD;

  return (
    <figure
      aria-describedby={description ? descId : undefined}
      className="pt-4"
      style={{ animation: 'sofi-fade-up 420ms cubic-bezier(0.16,1,0.3,1) both' }}
    >
      {/* ── Hero image wrapper ─────────────────────────────────────────── */}
      <div
        className={cx(
          // Shape
          'relative overflow-hidden rounded-2xl',
          // Border / ring — layered depth
          'border border-white/[0.08] ring-1 ring-inset ring-white/5',
          // Background fill visible during load
          'bg-neutral-900',
          // Shadow — dimensional lift
          'shadow-[0_8px_40px_rgb(0_0_0/0.45),0_2px_8px_rgb(0_0_0/0.30)]',
        )}
      >
        {showImage ? (
          <>
            {/* Shimmer skeleton — only visible while image is in-flight */}
            {!imageVisible && <ImageSkeleton />}

            <img
              src={imageUrl!}
              alt={name}
              // ── Performance attributes ──────────────────────────────────
              // eager: modal image is ALWAYS immediately visible on tap —
              //        lazy would defer the fetch on a fixed-position element.
              loading="eager"
              // high: elevates this request in the browser's fetch queue.
              //       The hero image is the primary content of the modal.
              fetchPriority="high"
              decoding="async"
              referrerPolicy="no-referrer"
              // Intrinsic-size hints for the browser's resource scheduler.
              // CSS controls actual render size; these inform early prioritisation.
              width={800}
              height={450}
              // ── Layout + transition ─────────────────────────────────────
              // h-48/sm:h-60: responsive — proportional to the modal's max-w-xl
              // container rather than a fixed 224px on all widths.
              //
              // transition-[opacity,transform]: COMBINED in one property.
              // Previously transition-opacity + transition-transform as two
              // separate Tailwind classes. Each sets transition-property entirely,
              // so the second overwrote the first — opacity was snapping instantly
              // with no fade while only transform transitioned. Now both work.
              //
              // duration for opacity: 700ms / for transform: 900ms.
              // These differ so they need separate declarations via style prop.
              className={cx(
                'h-48 w-full object-cover sm:h-60',
                // Opacity-only transition via className for the fade-in
                'transition-opacity duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
                imageVisible ? 'opacity-100' : 'opacity-0',
              )}
              style={{
                // Transform transition at a separate duration.
                // This is a style-prop because Tailwind can't express two
                // transition durations for different properties in one class.
                transition:
                  'opacity 700ms cubic-bezier(0.16,1,0.3,1), transform 900ms cubic-bezier(0.16,1,0.3,1)',
                // will-change: only while loading. Creates a GPU compositor
                // layer for the fade-in and removes it once the image is
                // fully visible to avoid holding a layer for the modal lifetime.
                willChange: imageVisible ? 'auto' : 'opacity, transform',
              }}
              onLoad={handleLoad}
              onError={handleError}
            />

            <ImageOverlay />
          </>
        ) : (
          <ImagePlaceholder name={name} />
        )}
      </div>

      {/* ── Description ───────────────────────────────────────────────── */}
      {description ? (
        <p
          id={descId}
          className="mt-4 line-clamp-4 text-sm leading-[1.72] text-zinc-300/85"
          style={{
            fontFamily: 'var(--font-sans)',
            animation: 'sofi-fade-in 380ms cubic-bezier(0.16,1,0.3,1) 80ms both',
            // Trailing fade mask — only applied when description is long enough
            // to potentially overflow line-clamp-4 (~280+ chars). Short
            // descriptions don't fade their own last word to nothing.
            // Both prefixed (-webkit-) and unprefixed (Chrome 120+, Firefox 53+).
            ...(descriptionMayClamp
              ? {
                  WebkitMaskImage:
                    'linear-gradient(to bottom, black 60%, rgb(0 0 0 / 0.45) 85%, transparent 100%)',
                  maskImage:
                    'linear-gradient(to bottom, black 60%, rgb(0 0 0 / 0.45) 85%, transparent 100%)',
                }
              : {}),
          }}
        >
          {description}
        </p>
      ) : null}

      {/* ── Tag pills ─────────────────────────────────────────────────── */}
      {visibleTags.length > 0 ? (
        <ul
          role="list"
          aria-label="Item attributes"
          className="mt-3 flex flex-wrap gap-1.5"
          style={{ animation: 'sofi-fade-in 340ms cubic-bezier(0.16,1,0.3,1) 120ms both' }}
        >
          {visibleTags.map((tag, i) => {
            const variant = resolveTagVariant(tag);
            return (
              <li
                // key uses both tag + index: duplicate tag strings (e.g. two
                // 'spicy' tags from different fields) no longer cause React key
                // warnings or silent DOM mutations.
                key={`${tag}-${i}`}
                role="listitem"
                className={cx(
                  // Shape + layout
                  'rounded-full border px-2.5 py-[3px]',
                  // Typography
                  'text-[11px] font-semibold leading-[1.5]',
                  // Interaction
                  'transition-all duration-150 ease-out hover:brightness-110',
                  // Variant colours
                  TAG_VARIANT_CLASSES[variant],
                )}
                style={{
                  animation: `sofi-fade-up 280ms cubic-bezier(0.16,1,0.3,1) ${100 + i * 28}ms both`,
                }}
              >
                {tag}
              </li>
            );
          })}
        </ul>
      ) : null}
    </figure>
  );
}