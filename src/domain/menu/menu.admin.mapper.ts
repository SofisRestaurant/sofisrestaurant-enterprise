import type { MenuItemAdminRow } from './menu.db.types'
import type { MenuItemAdmin } from './menu.types'
import { MenuPublicMapper } from '@/domain/menu/menu.public.mapper'

export class MenuAdminMapper {

  static map(row: MenuItemAdminRow): MenuItemAdmin {
    return {
      ...MenuPublicMapper.map(row),

      // src/domain/menu/menu.admin.mapper.ts
      inventory_count: row.inventory_count ?? null,
      low_stock_threshold: row.low_stock_threshold ?? 0,
      popularity_score: row.popularity_score ?? null,
    }
  }

  static mapMany(rows: MenuItemAdminRow[]): MenuItemAdmin[] {
    return rows.map((row) => this.map(row))
  }
}