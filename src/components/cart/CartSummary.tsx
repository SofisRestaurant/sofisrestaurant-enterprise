import { useCart } from '@/hooks/useCart';
import { formatCurrency } from '@/utils/currency';

export function CartSummary() {
  const { subtotal, tax, deliveryFee, total } = useCart();

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Subtotal</span>
        <span className="text-gray-900">{formatCurrency(subtotal)}</span>
      </div>
      
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Tax</span>
        <span className="text-gray-900">{formatCurrency(tax)}</span>
      </div>
      
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Delivery Fee</span>
        <span className="text-gray-900">{formatCurrency(deliveryFee)}</span>
      </div>
      
      <div className="pt-2 border-t border-gray-200">
        <div className="flex justify-between text-lg font-semibold">
          <span>Total</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}