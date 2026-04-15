import type { MenuItemPublicRow } from './menu.db.types';
import type { MenuItemPublic } from './menu.types';
import { toMenuItemBase } from './menu.gateway';

// MenuItemPublicRow is now an alias for MenuItemTableRow (menu_items_public
// view was dropped and replaced with get_menu_public / get_menu_item_public RPCs).
// The table row does not have a modifier_groups column — that field is hydrated
// at the service layer by parseModifierGroupsFromJson on the RPC response.
// This mapper is kept for any code that builds a MenuItemPublic from a raw
// table row (e.g. admin read-back after create/update).
//
// All validation and normalization live in menu.gateway.ts.
// This file is a typed adapter: it accepts a DB row and delegates to the gateway.
// The gateway throws if any required field is missing or invalid.

export class MenuPublicMapper {
  static map(this: void, row: MenuItemPublicRow): MenuItemPublic {
    // modifier_groups is absent on table rows — gateway defaults to [].
    return toMenuItemBase(row);
  }

  static mapMany(rows: MenuItemPublicRow[]): MenuItemPublic[] {
    return rows.map((row) => MenuPublicMapper.map(row));
  }
}