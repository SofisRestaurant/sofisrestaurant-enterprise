// src/components/cart/CartItem.tsx
import { Trash2, Minus, Plus } from 'lucide-react';
import type { CartItem as CartItemType } from '@/features/cart/cart.types';
import { useCartStore } from '@/features/cart/cart.store';

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeItem } = useCartStore();

  const handleIncrement = () => {
    updateQuantity(item.id, item.quantity + 1);
  };

  const handleDecrement = () => {
    if (item.quantity > 1) {
      updateQuantity(item.id, item.quantity - 1);
    }
  };

  const handleRemove = () => {
    removeItem(item.id);
  };

  const itemTotal = item.base_price * item.quantity;

  return (
    <div className="flex gap-4 py-4 border-b border-gray-200">
      {/* Image */}
      {item.image_url && (
        <img src={item.image_url} alt={item.name} className="w-20 h-20 object-cover rounded-lg" />
      )}

      {/* Details */}
      <div className="flex-1">
        <div className="flex justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">{item.name}</h3>
            <p className="text-sm text-gray-600">${item.base_price.toFixed(2)}</p>
          </div>
          <button
            onClick={handleRemove}
            className="text-red-500 hover:text-red-700 transition-colors"
            aria-label="Remove item"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>

        {/* Customizations */}
        {item.modifiers?.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            <span className="font-medium">Options:</span>
            <ul className="mt-1 space-y-1">
              {item.modifiers.map((group) =>
                group.selections.map((sel) => (
                  <li key={`${group.group_id}-${sel.id}`}>{sel.name}</li>
                )),
              )}
            </ul>
          </div>
        )}

        {/* Special Instructions */}
        {item.special_instructions && (
          <div className="mt-1 text-sm text-gray-600">
            <span className="font-medium">Note:</span> {item.special_instructions}
          </div>
        )}

        {/* Quantity Controls */}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDecrement}
              disabled={item.quantity <= 1}
              className="p-1 rounded-full hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-8 text-center font-medium">{item.quantity}</span>
            <button
              onClick={handleIncrement}
              className="p-1 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <span className="font-semibold text-gray-900">${itemTotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}