// src/modules/checkout/components/page/SectionHeader.tsx

export function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-(--color-cream-200) px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-(--color-ink-900)">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-(--color-ink-400)">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}