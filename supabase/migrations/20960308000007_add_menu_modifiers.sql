-- 1️⃣ Ensure all menu_items have active modifier_groups
-- Only insert missing rows
INSERT INTO menu_item_modifier_groups (menu_item_id, modifier_group_id)
SELECT mi.id, mg.id
FROM menu_items mi
CROSS JOIN modifier_groups mg
WHERE mg.active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM menu_item_modifier_groups mim
    WHERE mim.menu_item_id = mi.id
      AND mim.modifier_group_id = mg.id
  );

-- 2️⃣ Add new columns safely with defaults
ALTER TABLE modifiers
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;

ALTER TABLE modifier_groups
ADD COLUMN IF NOT EXISTS min_selections INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_selections INT DEFAULT 1;

-- 3️⃣ Update the view for front-end consumption
CREATE OR REPLACE VIEW menu_items_with_modifiers AS
SELECT mi.*,
       COALESCE(
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', mg.id,
             'name', mg.name,
             'type', mg.type,
             'active', mg.active,
             'required', mg.required,
             'min_selections', mg.min_selections,
             'max_selections', mg.max_selections,
             'modifiers', (
               SELECT JSONB_AGG(
                        JSONB_BUILD_OBJECT(
                          'id', m.id,
                          'name', m.name,
                          'available', m.available,
                          'is_default', m.is_default,
                          'sort_order', m.sort_order,
                          'price_adjustment', m.price_adjustment
                        )
                      ORDER BY m.sort_order
                    )
               FROM modifiers m
               WHERE m.modifier_group_id = mg.id
             )
           ) ORDER BY mg.sort_order
         ) FILTER (WHERE mg.id IS NOT NULL), '[]'::jsonb
       ) AS modifier_groups
FROM menu_items mi
LEFT JOIN menu_item_modifier_groups mig ON mi.id = mig.menu_item_id
LEFT JOIN modifier_groups mg ON mg.id = mig.modifier_group_id
GROUP BY mi.id
ORDER BY mi.sort_order;