import { useState } from 'react';
import { MenuItem } from '@/types/menu';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/features/auth/useAuth';
import { useModal } from '@/components/ui/useModal';
import { formatCurrency } from '@/utils/currency';
import { Button } from '@/components/ui/Button';

interface MenuItemCardProps {
  item: MenuItem;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  const { addItem, isItemInCart } = useCart();
  const { user } = useAuth();
  const { openModal } = useModal();
  const [isAdding, setIsAdding] = useState(false);

  const handleAddToCart = () => {
    if (!user) {
      openModal('login');
      return;
    }

    setIsAdding(true);
    addItem(item);
    
    // Visual feedback
    setTimeout(() => setIsAdding(false), 600);
  };

  const inCart = isItemInCart(item.id);

  return (
    <article className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {item.image_url && (
        <div className="relative aspect-4/3 overflow-hidden bg-gray-100">
          <img
            src={item.image_url}
            alt={item.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {item.featured && (
            <span className="absolute top-2 right-2 bg-primary text-white text-xs font-semibold px-2 py-1 rounded shadow">
              Featured
            </span>
          )}
          {!item.available && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <span className="bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold">
                Out of Stock
              </span>
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg text-gray-900 flex-1 pr-2">
            {item.name}
          </h3>
          <span className="text-primary font-bold text-lg whitespace-nowrap">
            {formatCurrency(item.price)}
          </span>
        </div>

        {item.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
            {item.description}
          </p>
        )}

        {item.allergens && item.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {item.allergens.map((allergen) => (
              <span
                key={allergen}
                className="text-xs px-2 py-1 bg-yellow-50 text-yellow-700 rounded border border-yellow-200"
                title={`Contains ${allergen}`}
              >
                {allergen}
              </span>
            ))}
          </div>
        )}

        <Button
          onClick={handleAddToCart}
          variant={inCart ? 'secondary' : 'primary'}
          className="w-full"
          disabled={!item.available || isAdding}
          aria-label={`Add ${item.name} to cart`}
        >
          {!item.available ? (
            'Out of Stock'
          ) : isAdding ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Adding...
            </span>
          ) : inCart ? (
            '✓ In Cart'
          ) : (
            'Add to Cart'
          )}
        </Button>
      </div>
    </article>
  );
}