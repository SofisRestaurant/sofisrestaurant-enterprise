// =============================================================================
// Shared menu food image — Supabase-only delivery, branded fallback always visible.
// =============================================================================
//
// Per image (stable identity = itemId + resolved public URL):
//   1. Try Supabase render/image at layout width (single src, no srcSet, no wsrv).
//   2. On error → public object URL (only when different from step 1).
//   3. On error → branded placeholder (always visible, never blank).
//
// Priority: loading=eager, fetchPriority=high. Non-priority: lazy, fetchPriority=auto.
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';

import {
  getFeaturedImageSources,
  getMenuCardImageSources,
  getModalImageSources,
  pickMenuImageFallbackGradient,
  pickMenuImageUrlFromRecord,
  resolveMenuImageUrl,
  type FeaturedImageVariant,
  type MenuImageSources,
} from '@/lib/images/menuImageDelivery';
import { cx } from '@/modules/menu/utils/uiHelpers';

export type MenuFoodImageVariant = FeaturedImageVariant | 'card' | 'modal';

export type MenuFoodImageProps = {
  rawUrl?: string | null;
  record?: Record<string, unknown> | null;
  name: string;
  itemId?: string;
  variant: MenuFoodImageVariant;
  /** @deprecated Prefer `priority`. */
  isAboveFold?: boolean;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  decorative?: boolean;
  enableHoverScale?: boolean;
};

type LoadAttempt = 'sized' | 'public';

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

function resolveSources(
  resolvedUrl: string,
  variant: MenuFoodImageVariant,
  isPriority: boolean,
): MenuImageSources | null {
  if (variant === 'card') {
    return getMenuCardImageSources(resolvedUrl, { isAboveFold: isPriority });
  }

  if (variant === 'modal') {
    return getModalImageSources(resolvedUrl);
  }

  return getFeaturedImageSources(resolvedUrl, { variant, isAboveFold: isPriority });
}

function BrandedFallback({
  className,
  gradient,
  showLabel = true,
}: {
  className?: string;
  gradient: string;
  showLabel?: boolean;
}) {
  return (
    <div
      className={cx('relative h-full w-full overflow-hidden', className)}
      style={{ background: gradient }}
      aria-hidden={showLabel ? true : undefined}
    >
      {showLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
          <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-amber-800/70">
            Sofi&rsquo;s
          </p>
          <p className="mt-1 font-serif text-sm font-medium text-stone-700/90">Fresh daily</p>
        </div>
      )}
      <div
        className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/[0.04]"
        aria-hidden="true"
      />
    </div>
  );
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

  const sources = useMemo(() => {
    if (!resolvedUrl) return null;
    return resolveSources(resolvedUrl, variant, isPriority);
  }, [resolvedUrl, variant, isPriority]);

  const [attempt, setAttempt] = useState<LoadAttempt>('sized');
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt('sized');
    setLoaded(false);
    setFailed(false);
  }, [identity]);

  const activeSrc = useMemo(() => {
    if (!sources) return '';
    if (attempt === 'public') {
      return sources.publicSrc;
    }
    return sources.src;
  }, [sources, attempt]);

  const handleLoad = useCallback(() => {
    setLoaded(true);
    setFailed(false);
  }, []);

  const handleError = useCallback(() => {
    setLoaded(false);

    if (sources?.hasPublicFallback && attempt === 'sized') {
      setAttempt('public');
      return;
    }

    setFailed(true);
  }, [sources, attempt]);

  const fallbackGradient = useMemo(
    () => pickMenuImageFallbackGradient(itemId || name),
    [itemId, name],
  );

  const hoverScaleClass =
    enableHoverScale && !prefersReducedMotion()
      ? 'motion-safe:transition-[transform,opacity] motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-[1.035]'
      : '';

  if (!resolvedUrl || !sources || failed) {
    return <BrandedFallback className={className} gradient={fallbackGradient} />;
  }

  return (
    <div className={cx('relative h-full w-full overflow-hidden', className)}>
      <BrandedFallback className="absolute inset-0" gradient={fallbackGradient} showLabel={!loaded} />

      <img
        key={`${identity}:${attempt}:${activeSrc}`}
        src={activeSrc}
        sizes={sources.sizes}
        width={sources.width}
        height={sources.height}
        alt={decorative ? '' : name}
        aria-hidden={decorative ? true : undefined}
        loading={isPriority ? 'eager' : sources.loading}
        fetchPriority={isPriority ? 'high' : sources.fetchPriority}
        decoding="async"
        referrerPolicy="no-referrer"
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
