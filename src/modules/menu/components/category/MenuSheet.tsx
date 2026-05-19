import { AnimatePresence, m } from 'framer-motion';
import { X, Check } from 'lucide-react';

import type { MenuCategory } from '@/domain/menu/menu.types';

const EASE = [0.16, 1, 0.3, 1] as const;

type CategoryOption = {
  value: MenuCategory | 'all';
  label: string;
  mobileLabel: string;
};

interface CategoryMenuSheetProps {
  open: boolean;
  categories: ReadonlyArray<CategoryOption>;
  selectedCategory: MenuCategory | 'all';
  onSelectCategory: (category: MenuCategory | 'all') => void;
  onClose: () => void;
}

export function CategoryMenuSheet({
  open,
  categories,
  selectedCategory,
  onSelectCategory,
  onClose,
}: CategoryMenuSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <m.button
            type="button"
            aria-label="Close menu categories"
            className="fixed inset-0 z-[9997] bg-black/35 backdrop-blur-[2px] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={onClose}
          />

          <m.div
            role="dialog"
            aria-modal="true"
            aria-label="Menu categories"
            className={[
              'fixed inset-x-3 bottom-3 z-[9998] overflow-hidden rounded-[1.75rem]',
              'border border-[#eadfcb]/90 bg-[#fffaf1] shadow-[0_24px_80px_rgba(0,0,0,0.28)]',
              'dark:border-white/10 dark:bg-[#111513]',
              'md:hidden',
            ].join(' ')}
            initial={{ opacity: 0, y: 28, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <div className="flex items-center justify-between border-b border-[#eadfcb]/80 px-5 py-4 dark:border-white/10">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#0f7a55] dark:text-[#7ee0b4]">
                  Browse menu
                </p>
                <h2 className="mt-0.5 text-lg font-black tracking-tight text-[#17221d] dark:text-white">
                  Categories
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-full',
                  'border border-[#eadfcb] bg-white text-[#17221d] shadow-sm transition',
                  'hover:bg-[#fff6df] active:scale-95',
                  'dark:border-white/10 dark:bg-white/[0.07] dark:text-white',
                ].join(' ')}
                aria-label="Close categories"
              >
                <X className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>

            <div className="max-h-[55dvh] overflow-y-auto px-3 py-3 [-webkit-overflow-scrolling:touch]">
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
                      className={[
                        'flex min-h-14 items-center justify-between gap-3 rounded-2xl px-4 text-left transition',
                        active
                          ? 'bg-[#0f7a55] text-white shadow-[0_12px_28px_rgba(15,122,85,0.24)]'
                          : [
                              'border border-[#eadfcb]/80 bg-white/80 text-[#25352e]',
                              'hover:bg-[#fff6df] active:scale-[0.99]',
                              'dark:border-white/10 dark:bg-white/[0.055] dark:text-white/78 dark:hover:bg-white/[0.09]',
                            ].join(' '),
                      ].join(' ')}
                    >
                      <span className="font-black tracking-tight">{category.label}</span>

                      {active ? (
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/18">
                          <Check className="h-4 w-4" strokeWidth={2.6} />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[#eadfcb]/80 bg-white/45 px-5 py-3 dark:border-white/10 dark:bg-white/[0.035]">
              <p className="text-center text-[11px] font-semibold text-[#68756d] dark:text-white/45">
                Tap a category to jump through Sofi’s menu.
              </p>
            </div>
          </m.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}