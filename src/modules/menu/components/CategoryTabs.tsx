import type { MenuCategory } from '@/domain/menu/menu.types';

/* =========================================================
   MASTER CATEGORY LIST
   single source of truth for UI labels
========================================================= */

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

/* =========================================================
   PROPS
========================================================= */

interface CategoryTabsProps {
  selectedCategory: MenuCategory | 'all';
  onSelectCategory: (category: MenuCategory | 'all') => void;

  /**
   * If provided → hide empty categories
   */
  availableCategories?: Set<MenuCategory>;
}

/* =========================================================
   COMPONENT
========================================================= */

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
    <div className="mb-6 flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {visibleCategories.map(({ value, label }) => {
        const active = selectedCategory === value;

        return (
          <button
            key={value}
            onClick={() => onSelectCategory(value)}
            aria-pressed={active}
            className={[
              'whitespace-nowrap rounded-full px-5 py-2 text-sm font-medium transition-all',
              active
                ? 'bg-primary text-white shadow'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            ].join(' ')}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
