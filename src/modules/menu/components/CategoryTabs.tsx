import { m, AnimatePresence } from 'framer-motion';
import type { MenuCategory } from '@/domain/menu/menu.types';

// ── Animation constants ───────────────────────────────────────────────────────

const EL = [0.16, 1, 0.3, 1] as const;
const ES = [0.34, 1.56, 0.64, 1] as const;

// ── Master category list — unchanged ─────────────────────────────────────────

const CATEGORIES: ReadonlyArray<{
  value: MenuCategory | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'appetizers', label: 'Appetizers' },
  { value: 'entrees', label: 'Entrees' },
  { value: 'desserts', label: 'Desserts' },
  { value: 'drinks', label: 'Drinks' },
];

// ── Props — unchanged ─────────────────────────────────────────────────────────

interface CategoryTabsProps {
  selectedCategory: MenuCategory | 'all';
  onSelectCategory: (category: MenuCategory | 'all') => void;
  availableCategories?: Set<MenuCategory>;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CategoryTabs({
  selectedCategory,
  onSelectCategory,
  availableCategories,
}: CategoryTabsProps) {
  const visibleCategories = CATEGORIES.filter(({ value }) => {
    if (value === 'all') return true;
    if (!availableCategories) return true;
    return availableCategories.has(value);
  });

  return (
    // Entrance: tabs fade up on mount
    <m.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EL }}
      className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
    >
      {visibleCategories.map(({ value, label }, i) => {
        const active = selectedCategory === value;

        return (
          <m.button
            key={value}
            onClick={() => onSelectCategory(value)}
            aria-pressed={active}
            // Entrance stagger
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EL, delay: i * 0.05 }}
            // Hover / tap micro-interactions
            whileHover={{ scale: active ? 1 : 1.05, y: -1 }}
            whileTap={{ scale: 0.95 }}
            className={[
              'relative whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-colors duration-200',
              active ? 'text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ].join(' ')}
            style={active ? {} : undefined}
          >
            {/* Animated pill background for active state */}
            <AnimatePresence>
              {active && (
                <m.span
                  key="pill"
                  layoutId="category-active-pill"
                  className="absolute inset-0 rounded-full bg-primary shadow"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.28, ease: ES }}
                  aria-hidden="true"
                />
              )}
            </AnimatePresence>

            {/* Label sits above the animated background */}
            <span className="relative z-10">{label}</span>
          </m.button>
        );
      })}
    </m.div>
  );
}
