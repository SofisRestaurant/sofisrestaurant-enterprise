// =============================================================================
// Shared menu food image — reliable delivery, branded fallback, subtle motion.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getFeaturedImageAttrs,
  getMenuCardImageAttrs,
  getModalImageAttrs,
  pickMenuImageFallbackGradient,
  pickMenuImageUrlFromRecord,
  resolveMenuImageUrl,
  type FeaturedImageVariant,
  type MenuImageDeliveryMode,
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
  /** LCP / above-the-fold candidate: eager + fetchPriority high, no load fade. */
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  /** Decorative thumbnail on cards — use item name in parent aria-label. */
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

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deliveryMode, setDeliveryMode] = useState<MenuImageDeliveryMode>('optimized');

  const resolvedUrl = useMemo(() => {
    if (record) {
      const fromRecord = pickMenuImageUrlFromRecord(record);
      if (fromRecord) return fromRecord;
    }
    return resolveMenuImageUrl(rawUrl);
  }, [record, rawUrl]);

  const imageAttrs = useMemo(() => {
    if (!resolvedUrl || failed) return null;

    if (variant === 'card') {
      return getMenuCardImageAttrs(resolvedUrl, { isAboveFold: isPriority, mode: deliveryMode });
    }

    if (variant === 'modal') {
      return getModalImageAttrs(resolvedUrl, { mode: deliveryMode });
    }

    return getFeaturedImageAttrs(resolvedUrl, {
      variant,
      isAboveFold: isPriority,
      mode: deliveryMode,
    });
  }, [resolvedUrl, failed, variant, isPriority, deliveryMode]);

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setDeliveryMode('optimized');
  }, [resolvedUrl]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
  }, []);

  const handleError = useCallback(() => {
    if (deliveryMode === 'optimized') {
      setLoaded(false);
      setDeliveryMode('direct');
      return;
    }

    setLoaded(false);
    setFailed(true);
  }, [deliveryMode]);

  const fallbackGradient = useMemo(
    () => pickMenuImageFallbackGradient(itemId || name),
    [itemId, name],
  );

  const hoverScaleClass =
    enableHoverScale && !prefersReducedMotion()
      ? 'motion-safe:transition-[transform,opacity] motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.035]'
      : '';

  if (!imageAttrs || failed) {
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

  return (
    <div className={cx('relative h-full w-full overflow-hidden', className)}>
      <div
        className="absolute inset-0"
        style={{ background: fallbackGradient }}
        aria-hidden="true"
      />

      {!isPriority && !loaded && (
        <div
          className="absolute inset-0 bg-[linear-gradient(135deg,#f5f1ef_0%,#ede0ce_50%,#f5f1ef_100%)]"
          aria-hidden="true"
        />
      )}

      <img
        key={`${deliveryMode}:${imageAttrs.src}`}
        {...imageAttrs}
        alt={decorative ? '' : name}
        aria-hidden={decorative ? true : undefined}
        loading={isPriority ? 'eager' : imageAttrs.loading}
        fetchPriority={isPriority ? 'high' : imageAttrs.fetchPriority}
        decoding="async"
        className={cx(
          'absolute inset-0 h-full w-full object-cover',
          !isPriority && 'transition-opacity duration-500 ease-out',
          hoverScaleClass,
          imageClassName,
          isPriority || loaded ? 'opacity-100' : 'opacity-0',
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
