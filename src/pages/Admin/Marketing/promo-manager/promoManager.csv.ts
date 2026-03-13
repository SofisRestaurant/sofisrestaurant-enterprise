import type { EnrichedPromo } from './promoManager.types';
import { discountLabel } from './promoManager.formatters';

function escapeCsv(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n')) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function buildPromoCsv(rows: EnrichedPromo[]): string {
  const header = [
    'Code',
    'Name',
    'Lifecycle',
    'Active',
    'Type',
    'Discount',
    'Current Uses',
    'Max Uses',
    'Revenue',
    'Min Order',
    'Per User Limit',
    'Starts',
    'Ends',
  ];

  const lines = rows.map((promo) => [
    promo.codeSafe,
    promo.nameSafe ?? '',
    promo.lifecycle,
    promo.isActive ? 'true' : 'false',
    promo.discountTypeSafe ?? '',
    discountLabel(promo),
    String(promo.currentUses),
    promo.maxUses !== null ? String(promo.maxUses) : '',
    String(Math.max(0, promo.revenueCents)),
    promo.minOrderCents !== null ? String(promo.minOrderCents) : '',
    promo.perUserLimit !== null ? String(promo.perUserLimit) : '',
    promo.startsAtSafe ? promo.startsAtSafe.toISOString() : '',
    promo.endsAtSafe ? promo.endsAtSafe.toISOString() : '',
  ]);

  return [header, ...lines]
    .map((cols) => cols.map((col) => escapeCsv(col)).join(','))
    .join('\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}