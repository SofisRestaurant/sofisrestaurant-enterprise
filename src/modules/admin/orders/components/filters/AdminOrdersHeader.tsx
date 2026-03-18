// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersHeader.tsx
// =============================================================================
// Page-level header: title, subtitle, sound toggle, and manual refresh button.
// Pure rendering — all state is passed via props.
// =============================================================================

interface Props {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onRefresh: () => void;
}

export function AdminOrdersHeader({ soundEnabled, onToggleSound, onRefresh }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-white">Admin Orders</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Live order queue with secure status progression through the hardened RPC path.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSound}
          className={[
            'rounded-xl border px-3 py-2 text-sm font-semibold transition',
            soundEnabled
              ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
              : 'border-zinc-700 bg-zinc-900 text-zinc-300',
          ].join(' ')}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? '🔔 Sound on' : '🔕 Muted'}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          className="rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}