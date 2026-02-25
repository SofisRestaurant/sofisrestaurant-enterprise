import type { MenuItemRow, MenuItem } from '@/types/menu'

export function mapProductToMenuItem(row: MenuItemRow): MenuItem {
  return {
    ...row,

    // defaults until real inventory system exists
    available: true,
    featured: false,
    dietary_info: undefined,
  }
}