// Shared Admin Actions (single source of truth)

export type AdminAction =
  // Core
  | 'metrics'
  | 'layout'
  | 'orders:list'
  | 'menu:full'

  // Menu CRUD
  | 'menu:create'
  | 'menu:update'
  | 'menu:delete'

  // Modifier groups
  | 'menu:modifier-groups:list'
  | 'menu:modifier-groups:list-for-item'
  | 'menu:modifier-groups:get'
  | 'menu:modifier-groups:item-count'
  | 'menu:modifier-groups:create'
  | 'menu:modifier-groups:update'
  | 'menu:modifier-groups:attach'
  | 'menu:modifier-groups:detach'
  | 'menu:modifier-groups:toggle-active'
  | 'menu:modifier-groups:reorder'
  | 'menu:modifier-groups:reorder-for-item'
  | 'menu:modifier-groups:set-item-groups'
  | 'menu:modifier-groups:delete'

  // Modifiers
  | 'menu:modifiers:list-for-group'
  | 'menu:modifiers:list-available-for-group'
  | 'menu:modifiers:get'
  | 'menu:modifiers:create'
  | 'menu:modifiers:create-batch'
  | 'menu:modifiers:update'
  | 'menu:modifiers:toggle-availability'
  | 'menu:modifiers:toggle-group-availability'
  | 'menu:modifiers:delete'
  | 'menu:modifiers:delete-all-in-group'
  | 'menu:modifiers:reorder'

  // Campaigns
  | 'campaigns:list'
  | 'campaigns:create'
  | 'campaigns:update'
  | 'campaigns:pin-featured'
  | 'campaigns:toggle'
  | 'campaigns:run-rotation'

  // Promos
  | 'promos:list'
  | 'promos:toggle'
  | 'promos:create';