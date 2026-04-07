import type { MenuItemAdminRow } from './menu.db.types';
import type { MenuItemPublicRow } from './menu.db.types';
import type { MenuItemAdmin } from './menu.types';
import { MenuPublicMapper } from '@/domain/menu/menu.public.mapper';

// The generated menu_items_admin_full view type may be stale and missing these
// admin-only columns. Extend locally until types are regenerated.
type MenuItemAdminRowExtended = MenuItemAdminRow & {
  inventory_count?: number | null;
  low_stock_threshold?: number | null;
  popularity_score?: number | null;
};

export class MenuAdminMapper {
  static map(row: MenuItemAdminRow): MenuItemAdmin {
    const r = row as MenuItemAdminRowExtended;
    return {
      ...MenuPublicMapper.map(row as unknown as MenuItemPublicRow),
      inventory_count: r.inventory_count ?? null,
      low_stock_threshold: r.low_stock_threshold ?? 0,
      popularity_score: r.popularity_score ?? null,
    };
  }

  static mapMany(rows: MenuItemAdminRow[]): MenuItemAdmin[] {
    return rows.map((row) => this.map(row));
  }
}