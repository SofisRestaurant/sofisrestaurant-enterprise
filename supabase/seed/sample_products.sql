INSERT INTO products (name, description, price, category, available) VALUES
  ('Margherita Pizza', 'Fresh mozzarella, tomato sauce, and basil', 12.99, 'Main Courses', true),
  ('Caesar Salad', 'Romaine lettuce, parmesan, croutons, caesar dressing', 8.99, 'Appetizers', true),
  ('Pasta Carbonara', 'Creamy pasta with bacon and parmesan', 14.99, 'Main Courses', true),
  ('Tiramisu', 'Classic Italian dessert with coffee and mascarpone', 6.99, 'Desserts', true),
  ('Bruschetta', 'Toasted bread with tomatoes, garlic, and basil', 7.99, 'Appetizers', true),
  ('Lemonade', 'Fresh squeezed lemonade', 3.99, 'Beverages', true)
ON CONFLICT DO NOTHING;