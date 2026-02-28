import { MenuItem } from '@/domain/menu/menu.types';
import { useAuth } from '@/features/auth/useAuth';
import { useModal } from '@/components/ui/useModal';
import { formatCurrency } from '@/utils/currency';
import { Button } from '@/components/ui/Button';

interface MenuItemCardProps {
  item: MenuItem;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  const { user } = useAuth();
  const { openModal } = useModal();

  const handleOpenItem = () => {
    if (!user) {
      openModal('login');
      return;
    }

    openModal('menu-item', {
      data: { item },
    });
  };

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
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg text-gray-900 flex-1 pr-2">{item.name}</h3>
          <span className="text-primary font-bold text-lg whitespace-nowrap">
            {formatCurrency(item.price)}
          </span>
        </div>

        {item.description && (
          <p className="text-gray-600 text-sm mb-3 line-clamp-2">{item.description}</p>
        )}

        <Button onClick={handleOpenItem} className="w-full" disabled={!item.available}>
          {!item.available ? 'Out of Stock' : 'Customize'}
        </Button>
      </div>
    </article>
  );
}
