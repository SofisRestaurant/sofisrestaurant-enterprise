import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, SlidersHorizontal, X } from 'lucide-react';

import type { MenuCategory } from '@/domain/menu/menu.types';

const CATEGORIES: ReadonlyArray<{
  value: MenuCategory | 'all';
  label: string;
  mobileLabel: string;
}> = [
  { value: 'all', label: 'All', mobileLabel: 'All' },
  { value: 'appetizers', label: 'Appetizers', mobileLabel: 'Apps' },
  { value: 'entrees', label: 'Entrees', mobileLabel: 'Entrees' },
  { value: 'desserts', label: 'Desserts', mobileLabel: 'Sweets' },
  { value: 'drinks', label: 'Drinks', mobileLabel: 'Drinks' },
];

interface CategoryTabsProps {
  selectedCategory: MenuCategory | 'all';
  onSelectCategory: (category: MenuCategory | 'all') => void;
  availableCategories?: Set<MenuCategory>;
  onOpenFilters?: () => void;
  filtersActive?: boolean;
}

type VisibleCategory = (typeof CATEGORIES)[number];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const surfaceClass = cx(
  'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)] text-[#4d382e]',
  'shadow-[0_8px_18px_rgba(46,24,12,0.055)] backdrop-blur-xl',
  'transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-out',
  'hover:bg-white/78 hover:text-[#2f1f18] active:scale-[0.985]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/72 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f0d0c]',
);

function MenuListIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="h-5 w-5"
    >
      <path
        d="M4 16.5C4.82843 16.5 5.5 17.1716 5.5 18C5.49993 18.8284 4.82839 19.5 4 19.5C3.17173 19.4999 2.50007 18.8283 2.5 18C2.5 17.1717 3.17169 16.5001 4 16.5Z"
        fill="currentColor"
      />
      <path
        d="M21 17C21.5523 17 22 17.4477 22 18C22 18.5523 21.5523 19 21 19H9C8.44783 18.9999 8 18.5522 8 18C8 17.4478 8.44783 17.0001 9 17H21Z"
        fill="currentColor"
      />
      <path
        d="M4 10.5C4.82843 10.5 5.5 11.1716 5.5 12C5.49993 12.8284 4.82839 13.5 4 13.5C3.17173 13.4999 2.50007 12.8283 2.5 12C2.5 11.1717 3.17169 10.5001 4 10.5Z"
        fill="currentColor"
      />
      <path
        d="M21 11C21.5523 11 22 11.4477 22 12C22 12.5523 21.5523 13 21 13H9C8.44783 12.9999 8 12.5522 8 12C8 11.4478 8.44783 11.0001 9 11H21Z"
        fill="currentColor"
      />
      <path
        d="M4 4.5C4.82843 4.5 5.5 5.17157 5.5 6C5.49993 6.82837 4.82839 7.5 4 7.5C3.17173 7.49987 2.50007 6.82829 2.5 6C2.5 5.17165 3.17169 4.50013 4 4.5Z"
        fill="currentColor"
      />
      <path
        d="M21 5C21.5523 5 22 5.44772 22 6C21.9999 6.55223 21.5522 7 21 7H9C8.44787 6.99987 8.00007 6.55215 8 6C8 5.4478 8.44783 5.00013 9 5H21Z"
        fill="currentColor"
      />
    </svg>
  );
}

const CategorySheet = memo(function CategorySheet({
  open,
  sheetId,
  titleId,
  categories,
  selectedCategory,
  selectedLabel,
  onSelectCategory,
  onClose,
}: {
  open: boolean;
  sheetId: string;
  titleId: string;
  categories: ReadonlyArray<VisibleCategory>;
  selectedCategory: MenuCategory | 'all';
  filtersActive?: boolean;
  selectedLabel: string;
  onSelectCategory: (category: MenuCategory | 'all') => void;
  onClose: () => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const bodyOverflow = document.body.style.overflow;
    const bodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.addEventListener('keydown', onKeyDown);

    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.body.style.touchAction = bodyTouchAction;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[9997] bg-[rgba(47,31,24,0.34)] backdrop-blur-[5px]"
        aria-label="Close category menu"
        onClick={onClose}
      />

      <section
        id={sheetId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(
          'fixed inset-x-3 bottom-3 z-[9998] mx-auto max-w-md overflow-hidden rounded-[1.65rem]',
          'border border-[rgba(61,42,32,0.10)] bg-[rgba(255,250,244,0.94)] text-[#2f1f18]',
          'shadow-[0_24px_70px_rgba(46,24,12,0.18)] backdrop-blur-2xl',
          'dark:border-white/10 dark:bg-[rgba(15,13,12,0.92)] dark:text-white',
          'animate-[categorySheetIn_180ms_ease-out]',
        )}
      >
        <div
          className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(199,154,59,0.58),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(244,222,192,0.28),transparent)]"
          aria-hidden="true"
        />

        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-[rgba(61,42,32,0.08)] px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7468] dark:text-white/45">
              Browse Sofi&apos;s
            </p>

            <h2
              id={titleId}
              className="mt-0.5 text-xl font-semibold tracking-tight text-[#2f1f18] dark:text-white"
            >
              Menu categories
            </h2>

            <p className="mt-1 truncate text-xs font-semibold text-[#7c6559] dark:text-white/55">
              Currently viewing {selectedLabel}
            </p>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className={cx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
              surfaceClass,
            )}
            aria-label="Close categories"
          >
            <X className="h-4 w-4" strokeWidth={2.5} />
          </button>
        </div>

        <div className="relative z-10 max-h-[58dvh] overflow-y-auto px-3 py-3 [-webkit-overflow-scrolling:touch]">
          <div className="grid gap-2">
            {categories.map((category) => {
              const active = selectedCategory === category.value;

              return (
                <button
                  key={category.value}
                  type="button"
                  onClick={() => {
                    onSelectCategory(category.value);
                    onClose();
                  }}
                  className={cx(
                    'group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 text-left',
                    'transition-[background-color,color,box-shadow,transform,border-color] duration-200 ease-out',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35',
                    active
                      ? [
                          'bg-[#3f2418] text-[#fff8ee]',
                          'shadow-[0_10px_24px_rgba(63,36,24,0.18),inset_0_1px_0_rgba(255,255,255,0.16)]',
                          'dark:bg-[#f4dec0] dark:text-[#21130d]',
                        ].join(' ')
                      : [
                          'border border-[rgba(61,42,32,0.08)] bg-white/62 text-[#4d382e]',
                          'shadow-[0_8px_18px_rgba(46,24,12,0.045)]',
                          'hover:bg-white hover:text-[#2f1f18] active:scale-[0.99]',
                          'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/72 dark:hover:bg-white/10 dark:hover:text-white',
                        ].join(' '),
                  )}
                >
                  <span>
                    <span className="block text-sm font-semibold tracking-[-0.01em]">
                      {category.label}
                    </span>

                    {active ? (
                      <span className="mt-0.5 block text-[11px] font-semibold text-current opacity-72">
                        Selected
                      </span>
                    ) : null}
                  </span>

                  {active ? (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/14 dark:bg-[#21130d]/10">
                      <Check className="h-4 w-4" strokeWidth={2.6} />
                    </span>
                  ) : (
                    <ChevronRight
                      className="h-4 w-4 text-current opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-70"
                      strokeWidth={2.5}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative z-10 border-t border-[rgba(61,42,32,0.08)] bg-white/34 px-5 py-3 dark:border-white/10 dark:bg-white/[0.045]">
          <p className="text-center text-[11px] font-semibold text-[#8a7468] dark:text-white/45">
            Tap a category to filter the menu instantly.
          </p>
        </div>
      </section>
    </>
  );
});

export function CategoryTabs({
  selectedCategory,
  onSelectCategory,
  availableCategories,
  onOpenFilters,
  filtersActive,
}: CategoryTabsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetId = useId();
  const titleId = useId();

  const visibleCategories = useMemo(
    () =>
      CATEGORIES.filter(({ value }) => {
        if (value === 'all') return true;
        if (!availableCategories) return true;
        return availableCategories.has(value);
      }),
    [availableCategories],
  );

  const openSheet = useCallback(() => setSheetOpen(true), []);
  const closeSheet = useCallback(() => setSheetOpen(false), []);

  const handleSelectCategory = useCallback(
    (category: MenuCategory | 'all') => {
      onSelectCategory(category);
    },
    [onSelectCategory],
  );

  if (visibleCategories.length <= 1) return null;

  const selectedLabel =
    visibleCategories.find((category) => category.value === selectedCategory)?.label ?? 'Menu';

  return (
    <>
      <nav
        className={cx(
          'sticky top-[calc(var(--site-header-height,4rem)+0.75rem)] z-20 mb-5',
          '-mx-4 px-4 sm:mx-0 sm:px-0',
        )}
        aria-label="Menu categories"
      >
        <div
          className={cx(
            'relative overflow-hidden rounded-[1.55rem]',
            'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,250,244,0.72)]',
            'shadow-[0_14px_34px_rgba(46,24,12,0.07)] backdrop-blur-2xl',
            'dark:border-white/10 dark:bg-white/[0.055] dark:shadow-[0_18px_44px_rgba(0,0,0,0.30)]',
          )}
        >
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.88),transparent)] dark:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]"
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-center gap-1.5 p-1.5 sm:gap-2 sm:p-2">
            <button
              type="button"
              onClick={openSheet}
              className={cx(
                'group flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 sm:h-11 sm:gap-2 sm:px-3',
                surfaceClass,
              )}
              aria-label="Show menu categories"
              aria-expanded={sheetOpen}
              aria-controls={sheetId}
              title={selectedLabel}
            >
              <MenuListIcon />
              <span className="hidden text-xs font-semibold tracking-[-0.01em] xs:inline">
                Menu
              </span>
            </button>

            <div className="relative min-w-0 flex-1">
              <div
                className="scrollbar-hide flex snap-x snap-mandatory gap-1.5 overflow-x-auto overscroll-x-contain px-1 [-webkit-overflow-scrolling:touch]"
                role="tablist"
                aria-orientation="horizontal"
              >
                {visibleCategories.map(({ value, label, mobileLabel }) => {
                  const active = selectedCategory === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-label={`Show ${label}`}
                      onClick={() => handleSelectCategory(value)}
                      className={cx(
                        'group relative min-h-10 shrink-0 snap-start overflow-hidden whitespace-nowrap rounded-full sm:min-h-11',
                        'px-3.5 py-2 text-[13px] font-semibold tracking-[-0.01em] sm:px-4 sm:py-2.5 sm:text-sm',
                        'transition-[color,background-color,border-color,box-shadow,transform] duration-200 ease-out',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2',
                        'focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f0d0c]',
                        active
                          ? [
                              'bg-[#3f2418] text-[#fff8ee]',
                              'shadow-[0_10px_24px_rgba(63,36,24,0.18),inset_0_1px_0_rgba(255,255,255,0.16)]',
                              'dark:bg-[#f4dec0] dark:text-[#21130d]',
                            ].join(' ')
                          : [
                              'border border-transparent bg-white/40 text-[#4d382e]',
                              'hover:border-[rgba(61,42,32,0.08)] hover:bg-white/78 hover:text-[#2f1f18]',
                              'active:scale-[0.985]',
                              'dark:bg-white/[0.045] dark:text-white/68 dark:hover:border-white/10 dark:hover:bg-white/10 dark:hover:text-white',
                            ].join(' '),
                      )}
                    >
                      <span className="relative z-10">
                        <span className="sm:hidden">{mobileLabel}</span>
                        <span className="hidden sm:inline">{label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Filters button ─────────────────────────────────────── */}
            {onOpenFilters ? (
              <button
                type="button"
                onClick={onOpenFilters}
                className={cx(
                  'group relative flex h-10 shrink-0 items-center gap-1.5 rounded-full px-2.5 sm:h-11 sm:gap-2 sm:px-3',
                  filtersActive
                    ? [
                        'border border-orange-500 bg-orange-50 text-orange-700',
                        'shadow-[0_8px_18px_rgba(46,24,12,0.055)]',
                        'dark:border-orange-400/40 dark:bg-orange-500/15 dark:text-orange-300',
                      ].join(' ')
                    : surfaceClass,
                )}
                aria-label="Open filters"
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={2.4} />
                <span className="hidden text-xs font-semibold tracking-[-0.01em] sm:inline">
                  Filters
                </span>
                {filtersActive && (
                  <span
                    className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-[rgba(255,250,244,0.72)] bg-orange-500 dark:border-[#0f0d0c] dark:bg-orange-400"
                    aria-hidden="true"
                  />
                )}
              </button>
            ) : (
              <div
                className="hidden h-11 w-9 shrink-0 items-center justify-center rounded-full text-[#8a7468] dark:text-white/40 sm:flex"
                aria-hidden="true"
              >
                <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
              </div>
            )}
          </div>

          <div className="border-t border-[rgba(61,42,32,0.08)] bg-white/28 px-3 py-1.5 sm:hidden dark:border-white/10 dark:bg-white/[0.04]">
            <p className="truncate text-[10px] font-semibold text-[#8a7468] dark:text-white/48">
              Viewing{' '}
              <span className="font-semibold text-[#3f2418] dark:text-[#f4dec0]">
                {selectedLabel}
              </span>
            </p>
          </div>
        </div>
      </nav>

      <CategorySheet
        open={sheetOpen}
        sheetId={sheetId}
        titleId={titleId}
        categories={visibleCategories}
        selectedCategory={selectedCategory}
        selectedLabel={selectedLabel}
        onSelectCategory={handleSelectCategory}
        onClose={closeSheet}
      />
    </>
  );
}