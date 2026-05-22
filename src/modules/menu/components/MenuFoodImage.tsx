// =============================================================================
// Shared menu food image — reliable delivery, branded fallback, subtle motion.
// =============================================================================
//
// Candidate chain (per resolved image URL):
//   1. optimized — single sized wsrv URL (no srcSet on menu cards/rail)
//   2. direct    — sized fallback (Supabase transform or wsrv n=fb), no srcSet
//   3. raw       — public object URL (last resort for reload reliability)
//   4. unavailable — branded gradient (missing/invalid only)
//
// Priority/LCP: still eager + fetchPriority high; uses sized wsrv, not full original.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getFeaturedImageAttrs,
  getInitialMenuImageDeliveryStage,
  getMenuCardImageAttrs,
  getModalImageAttrs,
  isSupabaseStorageUrl,
  pickMenuImageFallbackGradient,
  pickMenuImageUrlFromRecord,
  resolveMenuImageUrl,
  toImgElementAttrs,
  type FeaturedImageVariant,
  type MenuImageDeliveryStage,
} from '@/lib/images/menuImageDelivery';
import { cx } from '@/modules/menu/utils/uiHelpers';

export type MenuFoodImageVariant = FeaturedImageVariant | 'card' | 'modal';

export type MenuFoodImageProps = {
  rawUrl?: string | null;
  record?: Record<string, unknown> | null;
  name: string;
  itemId?: string;
  variant: MenuFoodImageVariant;
  /** @deprecated Prefer `priority` — kept for FeaturedMenu hero wiring. */
  isAboveFold?: boolean;
  /** LCP candidate: eager + fetchPriority high + sized wsrv (not full original). */
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  decorative?: boolean;
  enableHoverScale?: boolean;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function imageIdentity(resolvedUrl: string | null, itemId: string): string {
  return `${itemId}::${resolvedUrl ?? ''}`;
}

function MenuFoodImageInner({
  rawUrl,
  record,
  name,
  itemId = '',
  variant,
  isAboveFold = false,
  priority: priorityProp,
  className,
  imageClassName,
  decorative = false,
  enableHoverScale = false,
}: MenuFoodImageProps) {
  const isPriority = priorityProp ?? isAboveFold;

  const resolvedUrl = useMemo(() => {
    if (record) {
      const fromRecord = pickMenuImageUrlFromRecord(record);
      if (fromRecord) return fromRecord;
    }
    return resolveMenuImageUrl(rawUrl);
  }, [record, rawUrl]);

  const identity = imageIdentity(resolvedUrl, itemId);

  const [stage, setStage] = useState<MenuImageDeliveryStage>(() =>
    resolvedUrl ? getInitialMenuImageDeliveryStage() : 'unavailable',
  );
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setStage(resolvedUrl ? getInitialMenuImageDeliveryStage() : 'unavailable');
    setLoaded(false);
  }, [identity, resolvedUrl, isPriority]);

  const imageAttrs = useMemo(() => {
    if (!resolvedUrl || stage === 'unavailable') return null;

    const attrs =
      variant === 'card'
        ? getMenuCardImageAttrs(resolvedUrl, { isAboveFold: isPriority, mode: stage })
        : variant === 'modal'
          ? getModalImageAttrs(resolvedUrl, { mode: stage })
          : getFeaturedImageAttrs(resolvedUrl, {
              variant,
              isAboveFold: isPriority,
              mode: stage,
            });

    return attrs ? toImgElementAttrs(attrs) : null;
  }, [resolvedUrl, stage, variant, isPriority]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(false);

    setStage((current) => {
      if (current === 'optimized') {
        return 'direct';
      }

      if (current === 'direct' && resolvedUrl && isSupabaseStorageUrl(resolvedUrl)) {
        return 'raw';
      }

      return 'unavailable';
    });
  }, [resolvedUrl]);

  const fallbackGradient = useMemo(
    () => pickMenuImageFallbackGradient(itemId || name),
    [itemId, name],
  );

  const hoverScaleClass =
    enableHoverScale && !prefersReducedMotion()
      ? 'motion-safe:transition-[transform,opacity] motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.035]'
      : '';

  if (!imageAttrs || stage === 'unavailable') {
    return (
      <div
        className={cx('relative h-full w-full overflow-hidden', className)}
        style={{ background: fallbackGradient }}
        aria-hidden="true"
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-800/70">
            Sofi&rsquo;s
          </p>
          <p className="mt-1 font-serif text-sm font-medium text-stone-700/90">Fresh daily</p>
        </div>
        <div
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.04]"
          aria-hidden="true"
        />
      </div>
    );
  }

  const { srcSet, ...imgRest } = imageAttrs;

  return (
    <div className={cx('relative h-full w-full overflow-hidden', className)}>
      <div
        className="absolute inset-0"
        style={{ background: fallbackGradient }}
        aria-hidden="true"
      />

      {!loaded && (
        <div
          className="absolute inset-0 bg-[linear-gradient(135deg,#f5f1ef_0%,#ede0ce_50%,#f5f1ef_100%)]"
          aria-hidden="true"
        />
      )}

      <img
        key={`${identity}:${stage}:${imgRest.src}`}
        {...imgRest}
        {...(srcSet ? { srcSet } : {})}
        alt={decorative ? '' : name}
        aria-hidden={decorative ? true : undefined}
        loading={isPriority ? 'eager' : imgRest.loading}
        fetchPriority={isPriority ? 'high' : imgRest.fetchPriority}
        decoding="async"
        className={cx(
          'absolute inset-0 h-full w-full object-cover',
          !isPriority && 'transition-opacity duration-500 ease-out',
          hoverScaleClass,
          imageClassName,
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={handleLoad}
        onError={handleError}
      />

      <div
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.04]"
        aria-hidden="true"
      />
    </div>
  );
}

export const MenuFoodImage = memo(MenuFoodImageInner);
export default MenuFoodImage;
