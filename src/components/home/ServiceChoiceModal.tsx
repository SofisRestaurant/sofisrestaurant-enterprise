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
  href: string;
  icon: string;
  primary?: boolean;
};

const SHOW_DELAY_MS = 1100;

const OPTIONS: ServiceOption[] = [
  {
    mode: 'pickup',
    eyebrow: 'Fastest choice',
    title: 'Pickup from Sofi’s',
    description: 'Order fresh and pick it up when it’s ready.',
    href: '/menu',
    icon: '🛍️',
    primary: true,
  },
  {
    mode: 'delivery',
    eyebrow: 'Delivery options',
    title: 'Delivery',
    description: 'Choose your preferred delivery partner.',
    href: '#delivery',
    icon: '🚗',
  },
];

function emitServiceChoiceEvent(eventName: ServiceChoiceEventName, metadata?: Record<string, unknown>) {
  // Safe analytics hook.
  // Later you can replace this with:
  // await supabase.from('analytics_events').insert({ event_name: eventName, metadata });
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
        const target = document.querySelector(option.href);

        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

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
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/45 px-3 pb-3 pt-16 backdrop-blur-sm sm:items-center sm:p-6"
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
        className="relative w-full max-w-[560px] overflow-hidden rounded-[2rem] bg-[#faf6ef] shadow-[0_24px_90px_rgba(0,0,0,0.32)] ring-1 ring-white/50 sm:rounded-[2.25rem]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-orange-300/30 blur-3xl"
          aria-hidden="true"
        />

        <div
          className="pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-amber-200/40 blur-3xl"
          aria-hidden="true"
        />

        <button
          ref={closeButtonRef}
          type="button"
          onClick={handleBrowse}
          aria-label="Close service choice"
          className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-lg font-black text-stone-500 shadow-sm ring-1 ring-black/5 transition hover:bg-white hover:text-stone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50"
        >
          ×
        </button>

        <div className="relative p-5 sm:p-7">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-950 text-2xl text-white shadow-[0_14px_34px_rgba(28,25,21,0.22)]">
            🌮
          </div>

          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-700">
              Sofi&apos;s Restaurant · Surprise, AZ
            </p>

            <h2
              id="service-choice-title"
              className="mt-3 text-3xl font-black leading-[0.95] tracking-[-0.055em] text-stone-950 sm:text-4xl"
            >
              How would you like to enjoy Sofi&apos;s today?
            </h2>

            <p
              id="service-choice-description"
              className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-stone-600 sm:text-base"
            >
              Choose what fits your visit. You can still browse the menu without picking right now.
            </p>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                onClick={() => handleChoose(option)}
                className={[
                  'group rounded-[1.35rem] p-4 text-left shadow-sm ring-1 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50',
                  option.primary
                    ? 'bg-stone-950 text-white ring-stone-950 hover:-translate-y-0.5 hover:bg-stone-900'
                    : 'bg-white text-stone-950 ring-black/5 hover:-translate-y-0.5 hover:bg-orange-50',
                ].join(' ')}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={[
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl',
                      option.primary ? 'bg-white/12' : 'bg-[#f5f1ef]',
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {option.icon}
                  </div>

                  <div className="min-w-0">
                    <p
                      className={[
                        'text-[10px] font-black uppercase tracking-[0.16em]',
                        option.primary ? 'text-orange-200' : 'text-orange-700',
                      ].join(' ')}
                    >
                      {option.eyebrow}
                    </p>

                    <h3 className="mt-1 text-lg font-black tracking-[-0.035em]">
                      {option.title}
                    </h3>

                    <p
                      className={[
                        'mt-1 text-sm leading-relaxed',
                        option.primary ? 'text-white/72' : 'text-stone-500',
                      ].join(' ')}
                    >
                      {option.description}
                    </p>
                  </div>
                </div>

                <div
                  className={[
                    'mt-4 inline-flex h-9 items-center justify-center rounded-full px-4 text-xs font-black transition',
                    option.primary
                      ? 'bg-white text-stone-950 group-hover:bg-orange-50'
                      : 'bg-stone-950 text-white group-hover:bg-stone-800',
                  ].join(' ')}
                >
                  Continue
                  <span className="ml-1.5" aria-hidden="true">
                    →
                  </span>
                </div>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleBrowse}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-transparent px-5 text-sm font-black text-stone-500 transition hover:bg-white/60 hover:text-stone-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/40"
          >
            Just browsing for now
          </button>

          <p className="mt-3 text-center text-[11px] leading-relaxed text-stone-400">
            We&apos;ll remember your choice for a few days so you don&apos;t have to pick every visit.
          </p>
        </div>
      </section>
    </div>
  );
}

export default ServiceChoiceModal;