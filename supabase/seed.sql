-- ============================================
-- SOFI'S RESTAURANT – REAL LOCAL SEED
-- PRODUCTION MATCH
-- ============================================

-- ============================================
-- CLEAN TABLES (schema required locally)
-- ============================================

truncate table public.contact_messages cascade;
truncate table public.orders cascade;
truncate table public.menu_items cascade;
truncate table public.admins cascade;
truncate table public.profiles cascade;

-- ============================================
-- MENU ITEMS
-- ============================================

insert into public.menu_items (name, description, price, category)
values
('Carne Asada Taco', 'Fresh grilled steak with onions & cilantro', 2.99, 'tacos'),
('Al Pastor Taco', 'Marinated pork with pineapple', 2.79, 'tacos'),
('Huevos Rancheros', 'Eggs with ranchera sauce & beans', 12.99, 'breakfast'),
('Breakfast Burrito', 'Eggs, potato & cheese', 10.49, 'breakfast'),
('Horchata', 'Sweet rice drink', 3.49, 'drinks'),
('Jamaica', 'Hibiscus iced tea', 3.49, 'drinks');

-- ============================================
-- IMPORTANT ABOUT USERS
-- ============================================
-- auth.users are NOT created via seed.
-- you must sign up manually in the app.
-- after signup, profiles can be inserted.

-- ============================================
-- PROFILES
-- ============================================

-- these WILL FAIL if user does not exist in auth.users
-- replace after signup if needed

-- Example format:
-- insert into public.profiles (id, full_name, role)
-- values ('REAL_AUTH_ID', 'Sofi Admin', 'admin');

-- ============================================
-- ADMINS
-- ============================================

-- Example format:
-- insert into public.admins (user_id)
-- values ('REAL_AUTH_ID');

-- ============================================
-- SAMPLE ORDER
-- ============================================

-- Optional – comment out until users exist
/*
insert into public.orders (
  stripe_session_id,
  order_type,
  customer_uid,
  customer_email,
  customer_name,
  amount_total,
  currency,
  payment_status,
  status
)
values (
  'cs_test_local',
  'food',
  'USER_ID_HERE',
  'customer@test.com',
  'Test Customer',
  2599,
  'usd',
  'paid',
  'confirmed'
);
*/

select '🌮 Sofi local seed complete' as message;