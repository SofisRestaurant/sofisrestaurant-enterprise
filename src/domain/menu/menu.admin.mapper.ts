import type { MenuItemAdminRow } from './menu.db.types';
import type { MenuItemAdmin } from './menu.types';
import { MenuPublicMapper } from '@/domain/menu/menu.public.mapper';

// Type cast needed because database.types.ts may be stale (generated before
// inventory_count, low_stock_threshold, and popularity_score were added to the DB).
// Run `supabase gen types typescript --linked` to remove this cast.
type MenuItemAdminRowExtended = MenuItemAdminRow & {
  inventory_count?: number | null;
  low_stock_threshold?: number | null;
  popularity_score?: number | null;
};

export class MenuAdminMapper {
  static map(row: MenuItemAdminRow): MenuItemAdmin {
    const r = row as MenuItemAdminRowExtended;
    return {
      ...MenuPublicMapper.map(row),
      inventory_count: r.inventory_count ?? null,
      low_stock_threshold: r.low_stock_threshold ?? 0,
      popularity_score: r.popularity_score ?? null,
    };
  }

  static mapMany(rows: MenuItemAdminRow[]): MenuItemAdmin[] {
    return rows.map((row) => this.map(row));
  }
}