// src/modules/checkout/components/page/AuthContactStrip.tsx

export function AuthContactStrip({
  email,
  name,
}: {
  email: string;
  name: string | null;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50)">
        <span className="text-base font-bold text-(--color-ember-600)">
          {(name ?? email).charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="min-w-0">
        {name && <p className="text-sm font-semibold text-(--color-ink-900) truncate">{name}</p>}
        <p className="text-xs text-(--color-ink-400) truncate">{email}</p>
      </div>
      <span className="ml-auto shrink-0 flex items-center gap-1 rounded-full bg-(--color-success-bg) px-2.5 py-1 text-[11px] font-semibold text-(--color-success)">
        ✓ Saved
      </span>
    </div>
  );
}