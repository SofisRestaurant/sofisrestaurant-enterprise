// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersSearch.tsx
// =============================================================================
// Search input for the orders list. No logic — value and onChange from props.
// =============================================================================

interface Props {
  value: string;
  onChange: (query: string) => void;
}

export function AdminOrdersSearch({ value, onChange }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4">
      <label
        htmlFor="admin-orders-search"
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500"
      >
        Search orders
      </label>
      <input
        id="admin-orders-search"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Order #, customer, email, phone, or order id"
        className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/40"
      />
    </div>
  );
}