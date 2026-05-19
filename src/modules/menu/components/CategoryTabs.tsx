import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'framer-motion';
import { Check, ChevronRight, X } from 'lucide-react';

import type { MenuCategory } from '@/domain/menu/menu.types';

const EL = [0.16, 1, 0.3, 1] as const;
const ES = [0.34, 1.56, 0.64, 1] as const;

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
}

type VisibleCategory = (typeof CATEGORIES)[number];

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

function CategorySheet({
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

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;

    const bodyOverflow = document.body.style.overflow;
    const bodyTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.body.style.touchAction = bodyTouchAction;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <m.button
            type="button"
            className="fixed inset-0 z-9997 bg-ink-950/45 backdrop-blur-[2px]"
            aria-label="Close category menu"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EL }}
          />

          <m.section
            id={sheetId}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className={[
              'fixed inset-x-3 bottom-3 z-9998 mx-auto max-w-md overflow-hidden rounded-[1.8rem]',
              'border border-cream-200/80',
              'bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,235,0.96))]',
              'shadow-[0_28px_90px_rgba(46,24,12,0.30)] backdrop-blur-2xl',
              'dark:border-white/10',
              'dark:bg-[linear-gradient(180deg,rgba(20,16,14,0.98),rgba(10,10,10,0.98))]',
              'dark:shadow-[0_28px_90px_rgba(0,0,0,0.55)]',
            ].join(' ')}
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EL }}
          >
            <div
              className="pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-gold-300/80 to-transparent dark:via-gold-300/35"
              aria-hidden="true"
            />

            <div
              className="pointer-events-none absolute -left-12 -top-16 h-36 w-36 rounded-full bg-gold-200/20 blur-3xl dark:bg-ember-400/12"
              aria-hidden="true"
            />

            <div
              className="pointer-events-none absolute -right-14 -bottom-20 h-40 w-40 rounded-full bg-ember-200/14 blur-3xl dark:bg-gold-300/10"
              aria-hidden="true"
            />

            <div className="relative z-10 flex items-center justify-between gap-4 border-b border-cream-200/70 px-5 py-4 dark:border-white/10">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ember-700 dark:text-ember-300">
                  Browse Sofi&apos;s
                </p>

                <h2
                  id={titleId}
                  className="mt-0.5 text-xl font-black tracking-tight text-ink-950 dark:text-white"
                >
                  Menu categories
                </h2>

                <p className="mt-1 truncate text-xs font-semibold text-ink-500 dark:text-white/50">
                  Currently viewing {selectedLabel}
                </p>
              </div>

              <button
                ref={closeButtonRef}
                type="button"
                onClick={onClose}
                className={[
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                  'border border-cream-200 bg-white/90 text-ink-900 shadow-sm transition',
                  'hover:bg-cream-100 active:scale-95',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/35',
                  'dark:border-white/10 dark:bg-white/7 dark:text-white dark:hover:bg-white/11',
                ].join(' ')}
                aria-label="Close categories"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="relative z-10 max-h-[58dvh] overflow-y-auto px-3 py-3 [-webkit-overflow-scrolling:touch]">
              <div className="grid gap-2">
                {categories.map((category, index) => {
                  const active = selectedCategory === category.value;

                  return (
                    <m.button
                      key={category.value}
                      type="button"
                      onClick={() => {
                        onSelectCategory(category.value);
                        onClose();
                      }}
                      className={[
                        'group flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 text-left transition',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/35',
                        active
                          ? 'bg-linear-to-r from-ember-800 via-ember-600 to-gold-500 text-white shadow-[0_14px_34px_rgba(168,69,32,0.28)]'
                          : [
                              'border border-cream-200/75 bg-white/82 text-ink-800 shadow-sm',
                              'hover:border-gold-200 hover:bg-cream-50 active:scale-[0.99]',
                              'dark:border-white/10 dark:bg-white/6 dark:text-white/78 dark:hover:bg-white/9',
                            ].join(' '),
                      ].join(' ')}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.26, ease: EL, delay: index * 0.035 }}
                    >
                      <span>
                        <span className="block text-sm font-black tracking-tight">
                          {category.label}
                        </span>

                        {active ? (
                          <span className="mt-0.5 block text-[11px] font-bold text-white/75">
                            Selected
                          </span>
                        ) : null}
                      </span>

                      {active ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/18">
                          <Check className="h-4 w-4" strokeWidth={2.6} />
                        </span>
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-ember-700 dark:text-white/35 dark:group-hover:text-white/70"
                          strokeWidth={2.5}
                          aria-hidden="true"
                        />
                      )}
                    </m.button>
                  );
                })}
              </div>
            </div>

            <div className="relative z-10 border-t border-cream-200/70 bg-cream-50/55 px-5 py-3 dark:border-white/10 dark:bg-white/4">
              <p className="text-center text-[11px] font-semibold text-ink-500 dark:text-white/45">
                Tap a category to filter the menu instantly.
              </p>
            </div>
          </m.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}

export function CategoryTabs({
  selectedCategory,
  onSelectCategory,
  availableCategories,
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

  if (visibleCategories.length <= 1) return null;

  const selectedLabel =
    visibleCategories.find((category) => category.value === selectedCategory)?.label ?? 'Menu';

  return (
    <>
      <m.nav
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: EL }}
        className={[
          'sticky top-[calc(var(--site-header-height,4rem)+0.35rem)] z-30 mb-5',
          '-mx-4 px-4 sm:mx-0 sm:px-0',
        ].join(' ')}
        aria-label="Menu categories"
      >
        <div
          className={[
            'relative overflow-hidden rounded-[1.55rem]',
            'border border-cream-200/65',
            'bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,248,235,0.68))]',
            'shadow-[0_14px_34px_rgba(46,24,12,0.09)] backdrop-blur-2xl',
            'ring-1 ring-white/55',
            'dark:border-white/10',
            'dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.075),rgba(255,255,255,0.045))]',
            'dark:shadow-[0_18px_44px_rgba(0,0,0,0.34)] dark:ring-white/5',
          ].join(' ')}
        >
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/90 to-transparent dark:via-white/20"
            aria-hidden="true"
          />

          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-gold-200/55 to-transparent dark:via-gold-300/15"
            aria-hidden="true"
          />

          <div
            className="pointer-events-none absolute -left-16 -top-16 h-32 w-32 rounded-full bg-gold-200/18 blur-3xl dark:bg-ember-400/8"
            aria-hidden="true"
          />

          <div
            className="pointer-events-none absolute -right-20 -bottom-20 h-36 w-36 rounded-full bg-ember-200/10 blur-3xl dark:bg-gold-300/8"
            aria-hidden="true"
          />

          <div className="relative z-10 flex items-center gap-2 p-2">
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className={[
                'group flex h-11 shrink-0 items-center gap-2 rounded-full px-3',
                'border border-cream-200/80 bg-white/82 text-ink-900 shadow-[0_7px_18px_rgba(46,24,12,0.075)] backdrop-blur-xl transition',
                'hover:border-gold-200 hover:bg-cream-50 hover:text-ember-700 hover:shadow-[0_10px_24px_rgba(168,69,32,0.12)]',
                'active:scale-[0.97]',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/35 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
                'dark:border-white/10 dark:bg-white/8 dark:text-white/85 dark:hover:bg-white/12 dark:hover:text-white dark:focus-visible:ring-offset-ink-950',
              ].join(' ')}
              aria-label="Show menu categories"
              aria-expanded={sheetOpen}
              aria-controls={sheetId}
              title={selectedLabel}
            >
              <MenuListIcon />

              <span className="hidden text-xs font-black tracking-tight xs:inline">Menu</span>
            </button>

            <div className="relative min-w-0 flex-1">
              <div
                className={[
                  'scrollbar-hide flex gap-1.5 overflow-x-auto overscroll-x-contain px-1',
                  'snap-x snap-mandatory [-webkit-overflow-scrolling:touch]',
                ].join(' ')}
                role="tablist"
                aria-orientation="horizontal"
              >
                {visibleCategories.map(({ value, label, mobileLabel }, index) => {
                  const active = selectedCategory === value;

                  return (
                    <m.button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      aria-pressed={active}
                      aria-label={`Show ${label}`}
                      onClick={() => onSelectCategory(value)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.32, ease: EL, delay: index * 0.035 }}
                      whileHover={{ y: active ? 0 : -1 }}
                      whileTap={{ scale: 0.965 }}
                      className={[
                        'group relative min-h-11 shrink-0 snap-start overflow-hidden whitespace-nowrap rounded-full',
                        'px-4 py-2.5 text-sm font-black tracking-tight',
                        'transition-[color,background-color,border-color,box-shadow,transform] duration-200',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/35 focus-visible:ring-offset-2',
                        'focus-visible:ring-offset-cream-50 dark:focus-visible:ring-offset-ink-950',
                        active
                          ? 'text-white shadow-[0_12px_28px_rgba(168,69,32,0.24)]'
                          : [
                              'border border-transparent bg-white/38 text-ink-600',
                              'hover:border-cream-200 hover:bg-white/80 hover:text-ember-700 hover:shadow-[0_8px_18px_rgba(46,24,12,0.065)]',
                              'dark:bg-white/4 dark:text-white/65 dark:hover:border-white/10 dark:hover:bg-white/9 dark:hover:text-white',
                            ].join(' '),
                      ].join(' ')}
                    >
                      <AnimatePresence initial={false}>
                        {active ? (
                          <m.span
                            key="category-active-pill"
                            layoutId="category-active-pill"
                            className={[
                              'absolute inset-0 rounded-full',
                              'bg-linear-to-r from-ember-800 via-ember-600 to-gold-500',
                              'shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]',
                            ].join(' ')}
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.94 }}
                            transition={{ duration: 0.26, ease: ES }}
                            aria-hidden="true"
                          />
                        ) : null}
                      </AnimatePresence>

                      {active ? (
                        <span
                          className="pointer-events-none absolute inset-x-3 top-0 h-px bg-linear-to-r from-transparent via-white/65 to-transparent"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={[
                            'pointer-events-none absolute inset-0 rounded-full opacity-0',
                            'bg-linear-to-r from-cream-50 via-white/85 to-gold-50',
                            'transition-opacity duration-200 group-hover:opacity-100',
                            'dark:from-ember-400/10 dark:via-white/4 dark:to-gold-300/10',
                          ].join(' ')}
                          aria-hidden="true"
                        />
                      )}

                      <span className="relative z-10">
                        <span className="sm:hidden">{mobileLabel}</span>
                        <span className="hidden sm:inline">{label}</span>
                      </span>
                    </m.button>
                  );
                })}
              </div>
            </div>

            <div
              className={[
                'hidden h-11 w-9 shrink-0 items-center justify-center rounded-full sm:flex',
                'text-ink-300 dark:text-white/35',
              ].join(' ')}
              aria-hidden="true"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2.4} />
            </div>
          </div>

          <div
            className={[
              'border-t border-cream-200/50 px-4 py-2 sm:hidden',
              'bg-[linear-gradient(90deg,rgba(255,255,255,0.34),rgba(255,248,235,0.55),rgba(255,255,255,0.28))]',
              'dark:border-white/10 dark:bg-white/3',
            ].join(' ')}
          >
            <p className="truncate text-[11px] font-bold text-ink-500 dark:text-white/50">
              Viewing{' '}
              <span className="font-black text-ember-700 dark:text-ember-300">{selectedLabel}</span>
            </p>
          </div>
        </div>
      </m.nav>

      <CategorySheet
        open={sheetOpen}
        sheetId={sheetId}
        titleId={titleId}
        categories={visibleCategories}
        selectedCategory={selectedCategory}
        selectedLabel={selectedLabel}
        onSelectCategory={onSelectCategory}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}
