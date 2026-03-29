// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalImage.tsx
// =============================================================================
// Item hero image (or placeholder), description text, and tag pills.
// Pure renderer.
// =============================================================================

import type { ModalImageProps } from '@/domain/menu/menu-modal.types';
import { MODAL_TAG_DISPLAY_LIMIT } from '../../constants/menuItemModal.constants';

export function MenuItemModalImage({ imageUrl, name, description, tags }: ModalImageProps) {
  return (
    <div className="pt-4">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={name}
            className="h-56 w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex h-56 w-full items-center justify-center bg-linear-to-br from-white/5 to-white/0">
            <div className="text-center">
              <p className="text-sm font-semibold text-neutral-200">Sofi's Kitchen</p>
              <p className="mt-1 text-xs text-zinc-500">Fresh, real plates, made to order.</p>
            </div>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-neutral-950/70 via-neutral-950/10 to-transparent" />
      </div>

      {description ? <p className="mt-4 text-sm text-zinc-300">{description}</p> : null}

      {tags.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {tags.slice(0, MODAL_TAG_DISPLAY_LIMIT).map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-zinc-200"
            >
              {t}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}