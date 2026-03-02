// =============================================================================
// src/features/admin/menu/ModifierEmptyState.tsx
// =============================================================================

export function ModifierEmptyState({
  onAdd,
  groupName,
}: {
  onAdd: () => void;
  groupName?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 py-8">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800/60">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="#52525b" strokeWidth="1.6">
          <circle cx="9" cy="9" r="7" />
          <path d="M9 6v6M6 9h6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-zinc-400">
          {groupName ? `No options in "${groupName}"` : 'No modifiers yet'}
        </p>
        <p className="mt-0.5 font-mono text-[10px] text-zinc-700">
          Add options customers can choose from
        </p>
      </div>
      <button
        onClick={onAdd}
        className="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-amber-500/30 hover:text-amber-400"
      >
        + Add First Option
      </button>
    </div>
  );
}