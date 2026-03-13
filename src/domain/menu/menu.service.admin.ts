import { invokeEdge } from '@/lib/supabase/invoke';
import type { Database } from '@/types/supabase';
import { MenuAdminMapper } from './menu.admin.mapper';
import type { MenuItemAdmin } from './menu.types';

type MenuItemsAdminFullRow = Database['public']['Views']['menu_items_admin_full']['Row'];

type AdminGatewayMenuFullResponse = MenuItemsAdminFullRow[];

type AdminGatewayEnvelope<T> = {
  data: T;
  meta: {
    requestedBy: string;
    requestId: string;
    ts: number;
  };
};

function isMenuItemsAdminFullRow(value: unknown): value is MenuItemsAdminFullRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  return (
    typeof row.id === 'string' &&
    (typeof row.name === 'string' || row.name === null) &&
    (typeof row.price === 'number' || row.price === null) &&
    (typeof row.category === 'string' || row.category === null)
  );
}

function extractRows(
  response: AdminGatewayEnvelope<AdminGatewayMenuFullResponse>,
): MenuItemsAdminFullRow[] {
  return Array.isArray(response.data) ? response.data.filter(isMenuItemsAdminFullRow) : [];
}

export class MenuAdminService {
  static async getAllItems(): Promise<MenuItemAdmin[]> {
    const response = await invokeEdge<AdminGatewayEnvelope<AdminGatewayMenuFullResponse>>(
      'admin-gateway',
      {
        action: 'menu:full',
        payload: {
          page: 0,
          pageSize: 500,
        },
      },
    );

    return MenuAdminMapper.mapMany(extractRows(response));
  }
}