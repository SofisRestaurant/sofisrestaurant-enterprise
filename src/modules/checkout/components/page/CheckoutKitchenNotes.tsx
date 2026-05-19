import { CHECKOUT_LIMITS } from '@/modules/checkout/utils/checkoutPageStorage';

type CheckoutKitchenNotesProps = {
  notes: string;
  onNotesChange: (notes: string) => void;
};

export function CheckoutKitchenNotes({ notes, onNotesChange }: CheckoutKitchenNotesProps) {
  return (
    <div>
      <label
        htmlFor="checkout-notes"
        className="mb-2 block text-[11px] font-black uppercase tracking-[0.14em] text-ink-400"
      >
        Kitchen notes{' '}
        <span className="font-normal normal-case tracking-normal text-ink-300">optional</span>
      </label>

      <textarea
        id="checkout-notes"
        value={notes}
        onChange={(event) =>
          onNotesChange(String(event.target.value).slice(0, CHECKOUT_LIMITS.NOTES_MAX))
        }
        rows={3}
        placeholder="No onions, mild salsa, sauce on the side..."
        className="input w-full resize-none rounded-2xl border-cream-300 bg-white"
      />

      <div className="mt-1 flex justify-end">
        <span className="text-[11px] tabular-nums text-ink-300">
          {notes.length}/{CHECKOUT_LIMITS.NOTES_MAX}
        </span>
      </div>
    </div>
  );
}
