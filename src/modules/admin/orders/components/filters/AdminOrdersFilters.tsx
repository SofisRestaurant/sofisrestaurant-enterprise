import type { TabOption } from '../../hooks/useAdminOrdersFilters';
import type { FilterTab } from '../../utils/admin-orders.constants';

interface Props {
  tabOptions: TabOption[];
  activeTab: FilterTab;
  onSelectTab: (tab: FilterTab) => void;
}

export function AdminOrdersFilters({ tabOptions, activeTab, onSelectTab }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabOptions.map(({ key, label, count }) => {
        const isActive = activeTab === key;
        const handleClick = () => onSelectTab(key);

        return (
          <button
            key={`filter-tab-${key}`}
            type="button"
            onClick={handleClick}
            className={[
              'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
              isActive
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900',
            ].join(' ')}
            aria-pressed={isActive}
          >
            <span>{label}</span>
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px]">
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}