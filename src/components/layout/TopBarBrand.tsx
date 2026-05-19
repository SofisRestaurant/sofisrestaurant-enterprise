// src/components/layout/TopBarBrand.tsx
// =============================================================================
// TOP BAR BRAND — Premium mobile-first restaurant identity chip
// =============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Sparkles } from 'lucide-react';

import TopBarKitchenStatus from '@/components/layout/TopBarKitchenStatus';

const SOFIS_LOGO_SRC = '/sofislogo10.svg';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

interface TopBarBrandProps {
  ariaLabel: string;
}

export default function TopBarBrand({ ariaLabel }: TopBarBrandProps) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <Link
      to="/"
      aria-label={ariaLabel}
      className={cx(
        'group relative flex h-11 shrink-0 items-center rounded-[1.25rem]',
        'min-w-[12rem] max-w-[14.75rem] px-0.5',
        'transition-transform duration-200 active:scale-[0.985]',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-(--color-ink-950)',
        'xs:min-w-[13rem] xs:max-w-[15.75rem]',
        'sm:min-w-[15rem] sm:max-w-[18rem]',
        'md:min-w-[17rem] md:max-w-[21rem]',
      )}
    >
      <span
        className={cx(
          'pointer-events-none absolute inset-0 rounded-[1.25rem]',
          'bg-linear-to-br from-white/80 via-cream-50/65 to-gold-50/45',
          'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
          'dark:from-white/8 dark:via-white/5 dark:to-gold-300/8',
        )}
        aria-hidden="true"
      />

      <span
        className={cx(
          'relative z-10 flex h-10.5 w-full items-center gap-2 overflow-hidden rounded-[1.15rem]',
          'border border-white/75 bg-white/82 px-2',
          'shadow-[0_10px_28px_rgba(46,24,12,0.075),inset_0_1px_0_rgba(255,255,255,0.92)]',
          'backdrop-blur-2xl',
          'transition-[border-color,background-color,box-shadow] duration-200',
          'group-hover:border-gold-200/90 group-hover:bg-white/92',
          'dark:border-white/10 dark:bg-white/8 dark:shadow-[0_12px_30px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.06)]',
          'dark:group-hover:border-gold-300/20 dark:group-hover:bg-white/10',
        )}
      >
        <span
          className={cx(
            'relative flex h-8.5 w-8.5 shrink-0 items-center justify-center overflow-hidden rounded-[1rem]',
            'bg-linear-to-br from-white via-cream-50 to-gold-50',
            'shadow-[0_6px_16px_rgba(46,24,12,0.10),inset_0_1px_0_rgba(255,255,255,0.95)]',
            'ring-1 ring-cream-300/75',
            'dark:bg-white/90 dark:ring-white/10',
          )}
          aria-hidden="true"
        >
          <span
            className="pointer-events-none absolute inset-x-1 top-0 h-px bg-linear-to-r from-transparent via-white to-transparent"
            aria-hidden="true"
          />

          {!logoFailed ? (
            <img
              src={SOFIS_LOGO_SRC}
              alt=""
              className="block h-7.5 w-7.5 object-contain"
              width={34}
              height={34}
              loading="eager"
              decoding="sync"
              fetchPriority="high"
              onLoad={() => setLogoFailed(false)}
              onError={(event) => {
                console.error('[TopBarBrand] Logo failed to load:', event.currentTarget.src);
                setLogoFailed(true);
              }}
            />
          ) : (
            <span className="text-sm font-black text-(--color-ember-700)">S</span>
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-[13px] font-black leading-tight tracking-[-0.025em] text-(--color-ink-950) dark:text-white">
              Sofi&apos;s Restaurant
            </span>

            <TopBarKitchenStatus />
          </span>

          <span className="mt-0.5 flex min-w-0 items-center gap-1.5">
            <span className="flex min-w-0 items-center gap-1 text-[10px] font-bold leading-none text-(--color-ink-500) dark:text-white/55">
              <MapPin
                className="h-3 w-3 shrink-0 text-(--color-ember-600) dark:text-(--color-ember-300)"
                strokeWidth={2.4}
              />
              <span className="truncate">Surprise, AZ</span>
            </span>

            <span className="h-1 w-1 shrink-0 rounded-full bg-(--color-gold-400)" />

            <span className="hidden min-w-0 items-center gap-1 text-[10px] font-bold leading-none text-(--color-ink-500) dark:text-white/55 xs:flex">
              <Sparkles
                className="h-3 w-3 shrink-0 text-(--color-gold-500)"
                strokeWidth={2.4}
              />
              <span className="truncate">Made fresh</span>
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}