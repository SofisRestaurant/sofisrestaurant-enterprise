// =============================================================================
// src/components/home/ServiceChoiceModal.tsx
// =============================================================================
//
// Sofi's Restaurant — Smart Service Choice Modal
//
// Professional behavior:
// - Shows shortly after first homepage visit.
// - Does not show on checkout/admin/auth/order-success routes.
// - Remembers pickup/delivery for 7 days.
// - Remembers "Just browsing" for 24 hours.
// - Mobile: bottom-sheet style.
// - Desktop: premium centered modal.
// - No database required to work.
// - Database/analytics-ready through event names in serviceChoice.ts.
// =============================================================================

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ShoppingBag, Truck, UtensilsCrossed, X, type LucideIcon } from 'lucide-react';

import {
  SERVICE_CHOICE_EVENTS,
  saveServiceChoice,
  shouldShowServiceChoiceModal,
  type ServiceChoiceEventName,
  type ServiceChoiceMode,
} from '@/lib/serviceChoice';

type ServiceOption = {
  mode: ServiceChoiceMode;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  Icon: LucideIcon;
  primary?: boolean;
};

const SHOW_DELAY_MS = 1100;

const OPTIONS: ServiceOption[] = [
  {
    mode: 'pickup',
    eyebrow: 'Quick and fresh',
    title: 'Pickup from Sofi’s',
    description: 'Place your order and we’ll have it ready for you.',
    cta: 'Start pickup order',
    href: '/menu',
    Icon: ShoppingBag,
    primary: true,
  },
  {
    mode: 'delivery',
    eyebrow: 'Delivered your way',
    title: 'Delivery options',
    description: 'Choose the delivery partner that works best for you.',
    cta: 'See delivery options',
    href: '#delivery',
    Icon: Truck,
  },
];

function emitServiceChoiceEvent(eventName: ServiceChoiceEventName, metadata?: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.info('[Sofi service choice]', eventName, metadata ?? {});
  }

  window.dispatchEvent(
    new CustomEvent('sofis:service-choice', {
      detail: {
        eventName,
        metadata: metadata ?? {},
        timestamp: Date.now(),
      },
    }),
  );
}

function getCurrentPathname(): string {
  if (typeof window === 'undefined') return '/';
  return window.location.pathname || '/';
}

function scrollToHashTarget(hash: string) {
  const scroll = () => {
    const target = document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  requestAnimationFrame(() => {
    requestAnimationFrame(scroll);
  });
}

function cardClassName(primary?: boolean): string {
  return [
    'group flex w-full flex-col rounded-2xl p-4 text-left shadow-sm ring-1 transition duration-200',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-[#faf6ef]',
    'motion-reduce:transition-none',
    'active:scale-[0.985] motion-reduce:active:scale-100',
    primary
      ? 'bg-stone-950 text-white ring-stone-900/80 sm:hover:-translate-y-0.5 sm:hover:bg-stone-900 sm:hover:shadow-md'
      : 'bg-white text-stone-950 ring-stone-200/90 sm:hover:-translate-y-0.5 sm:hover:border-orange-100 sm:hover:shadow-md sm:hover:ring-orange-200/60',
  ].join(' ');
}

export function ServiceChoiceModal() {
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const viewedRef = useRef(false);

  const shouldRender = useMemo(() => typeof window !== 'undefined', []);

  useEffect(() => {
    if (!shouldRender) return;

    const pathname = getCurrentPathname();

    if (!shouldShowServiceChoiceModal(pathname)) {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsOpen(true);

      if (!viewedRef.current) {
        viewedRef.current = true;
        emitServiceChoiceEvent(SERVICE_CHOICE_EVENTS.viewed, { pathname });
      }
    }, SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [shouldRender]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleBrowse();
      }
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleChoose = useCallback(
    (option: ServiceOption) => {
      saveServiceChoice(option.mode);

      emitServiceChoiceEvent(
        option.mode === 'pickup'
          ? SERVICE_CHOICE_EVENTS.pickupSelected
          : SERVICE_CHOICE_EVENTS.deliverySelected,
        {
          mode: option.mode,
          href: option.href,
          pathname: getCurrentPathname(),
        },
      );

      closeModal();

      if (option.href.startsWith('#')) {
        scrollToHashTarget(option.href);
        return;
      }

      window.location.href = option.href;
    },
    [closeModal],
  );

  const handleBrowse = useCallback(() => {
    saveServiceChoice('browse');

    emitServiceChoiceEvent(SERVICE_CHOICE_EVENTS.browseSelected, {
      mode: 'browse',
      pathname: getCurrentPathname(),
    });

    closeModal();
  }, [closeModal]);

  const handleBackdropClick = useCallback(() => {
    saveServiceChoice('browse');

    emitServiceChoiceEvent(SERVICE_CHOICE_EVENTS.closed, {
      pathname: getCurrentPathname(),
      method: 'backdrop',
    });

    closeModal();
  }, [closeModal]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-stone-950/50 px-0 pb-0 pt-8 backdrop-blur-[2px] animate-backdrop-in motion-reduce:animate-none sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          handleBackdropClick();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="service-choice-title"
        aria-describedby="service-choice-description"
        className={[
          'relative w-full max-w-[34rem] overflow-hidden bg-[#faf6ef]',
          'rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(28,25,21,0.12),0_24px_80px_rgba(28,25,21,0.22)]',
          'ring-1 ring-stone-200/80',
          'max-sm:animate-sheet-in sm:animate-modal-in motion-reduce:animate-none',
          'sm:max-w-[32rem] sm:rounded-[1.75rem]',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
        ].join(' ')}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-orange-200/25 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-20 -left-16 h-48 w-48 rounded-full bg-amber-100/50 blur-3xl"
          aria-hidden="true"
        />

        <div
          className="mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-stone-300/90 sm:hidden"
          aria-hidden="true"
        />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={handleBrowse}
          aria-label="Close and continue browsing"
          className="absolute right-3 top-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-stone-500 shadow-sm ring-1 ring-stone-200/80 transition hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50 sm:right-4 sm:top-4"
        >
          <X className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
        </button>

        <div className="relative px-5 pt-2 pb-5 sm:px-7 sm:pt-6 sm:pb-7">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br from-amber-100 to-orange-50 text-orange-800 shadow-sm ring-1 ring-orange-200/50">
            <UtensilsCrossed className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
          </div>

          <div className="text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-orange-800/90">
              Sofi&apos;s Restaurant · Surprise, AZ
            </p>

            <h2
              id="service-choice-title"
              className="mt-2.5 text-[1.65rem] font-bold leading-tight tracking-[-0.03em] text-stone-950 sm:text-[1.85rem]"
            >
              Welcome in. How would you like to enjoy Sofi&apos;s today?
            </h2>

            <p
              id="service-choice-description"
              className="mx-auto mt-2.5 max-w-[20rem] text-sm leading-relaxed text-stone-600 sm:max-w-md sm:text-[0.95rem]"
            >
              Choose pickup, delivery, or take a look around first. No rush.
            </p>
          </div>

          <div className="stagger-children mt-5 grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const { Icon } = option;

              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => handleChoose(option)}
                  aria-label={`${option.cta}. ${option.description}`}
                  className={[cardClassName(option.primary), 'animate-fade-rise motion-reduce:animate-none'].join(' ')}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={[
                        'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
                        option.primary
                          ? 'bg-white/10 text-orange-100'
                          : 'bg-[#f3ede4] text-orange-800',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={[
                          'text-[10px] font-semibold uppercase tracking-[0.14em]',
                          option.primary ? 'text-orange-200/90' : 'text-orange-800',
                        ].join(' ')}
                      >
                        {option.eyebrow}
                      </p>

                      <h3 className="mt-0.5 text-base font-bold tracking-[-0.02em] sm:text-[1.05rem]">
                        {option.title}
                      </h3>

                      <p
                        className={[
                          'mt-1 text-sm leading-snug',
                          option.primary ? 'text-white/75' : 'text-stone-500',
                        ].join(' ')}
                      >
                        {option.description}
                      </p>
                    </div>
                  </div>

                  <span
                    className={[
                      'mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full px-4 text-sm font-semibold transition',
                      option.primary
                        ? 'bg-white text-stone-950 group-hover:bg-orange-50'
                        : 'bg-stone-950 text-white group-hover:bg-stone-800',
                    ].join(' ')}
                  >
                    {option.cta}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleBrowse}
            className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full px-5 text-sm font-medium text-stone-600 underline-offset-4 transition hover:bg-white/70 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/45"
          >
            Just browsing for now
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
            We&apos;ll remember your choice for a little while so your next visit feels easier.
          </p>
        </div>
      </section>
    </div>
  );
}

export default ServiceChoiceModal;
