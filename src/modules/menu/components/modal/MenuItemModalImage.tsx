// =============================================================================
// Hero food image (full-bleed top) + tag pills. Description lives in MenuItemModalHero.
// =============================================================================

import { useReducer } from 'react';
import type { ModalImageProps } from '@/domain/menu/menu-modal.types';
import { MODAL_TAG_DISPLAY_LIMIT } from '../../constants/menuItemModal.constants';
import { cx } from '../../utils/uiHelpers';
import { getModalImageProps } from '@/lib/images/supabaseImage';
import { MODAL_ANIM } from './menuItemModalAnimations';

type ImageState = 'loading' | 'loaded' | 'error';
type ImageAction = { type: 'LOADED' } | { type: 'ERROR' };

function imageReducer(_: ImageState, action: ImageAction): ImageState {
  if (action.type === 'LOADED') return 'loaded';
  if (action.type === 'ERROR') return 'error';
  return 'loading';
}

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

const TAG_CLASSES: Record<TagVariant, string> = {
  dietary: 'bg-emerald-50 text-emerald-800 ring-emerald-200/80',
  heat: 'bg-red-50 text-red-800 ring-red-200/80',
  provenance: 'bg-gold-100 text-ember-800 ring-gold-200',
  default: 'bg-cream-100 text-ink-700 ring-cream-300',
};

function ImageSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 animate-pulse bg-cream-200"
    />
  );
}

function ImagePlaceholder({ name }: { name: string }) {
  return (
    <div
      className="flex aspect-[16/10] w-full items-center justify-center bg-cream-100 sm:aspect-[5/3]"
      role="img"
      aria-label={`${name} — photo not available`}
    >
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-ink-400">
          Sofi&rsquo;s Restaurant
        </p>
        <p className="mt-2 font-serif text-lg font-medium text-ink-700">Photo coming soon</p>
      </div>
    </div>
  );
}

export function MenuItemModalImage({ imageUrl, name, tags }: ModalImageProps) {
  const [imgState, dispatch] = useReducer(imageReducer, 'loading');

  const showImage = Boolean(imageUrl) && imgState !== 'error';
  const imageVisible = imgState === 'loaded';
  const visibleTags = tags.slice(0, MODAL_TAG_DISPLAY_LIMIT);
  const modalImgProps = getModalImageProps(imageUrl, name);

  return (
    <figure
      className="relative shrink-0 overflow-hidden"
      style={{ animation: MODAL_ANIM.imgFade }}
    >
      <div className="relative aspect-[16/10] w-full bg-cream-100 sm:aspect-[5/3]">
        {showImage ? (
          <>
            {!imageVisible && <ImageSkeleton />}
            <img
              src={modalImgProps.src}
              srcSet={modalImgProps.srcSet}
              sizes={modalImgProps.sizes}
              alt={modalImgProps.alt}
              loading={modalImgProps.loading}
              fetchPriority={modalImgProps.fetchPriority}
              decoding={modalImgProps.decoding}
              referrerPolicy={modalImgProps.referrerPolicy}
              width={modalImgProps.width}
              height={modalImgProps.height}
              className={cx(
                'h-full w-full object-cover transition-opacity duration-500',
                imageVisible ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => dispatch({ type: 'LOADED' })}
              onError={() => dispatch({ type: 'ERROR' })}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/25 to-transparent"
              aria-hidden="true"
            />
          </>
        ) : (
          <ImagePlaceholder name={name} />
        )}
      </div>

      {visibleTags.length > 0 ? (
        <ul
          role="list"
          aria-label="Item attributes"
          className="absolute bottom-3 left-4 right-4 flex flex-wrap gap-1.5"
        >
          {visibleTags.map((tag, i) => (
            <li
              key={`${tag}-${i}`}
              role="listitem"
              className={cx(
                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1',
                TAG_CLASSES[resolveTagVariant(tag)],
              )}
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
