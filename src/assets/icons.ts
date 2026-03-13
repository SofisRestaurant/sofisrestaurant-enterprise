import { BRAND_COLORS, type BrandTheme } from './logo';

export const ICON_NAMES = [
  'orders',
  'menu',
  'loyalty',
  'analytics',
  'customers',
  'checkout',
  'delivery',
  'search',
  'refresh',
  'notification',
  'alert',
  'success',
  'settings',
  'revenue',
] as const;

export type IconName = (typeof ICON_NAMES)[number];
export type IconTone = BrandTheme | 'brand';

export interface IconDefinition {
  title: string;
  viewBox: string;
  body: string;
}

export interface IconRenderOptions {
  size?: number;
  strokeWidth?: number;
  title?: string;
  tone?: IconTone;
  decorative?: boolean;
}

export interface IconAsset {
  name: IconName;
  svg: string;
  dataUri: string;
}

interface IconPalette {
  stroke: string;
  background: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function clampSize(size: number | undefined, fallback: number): number {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    return fallback;
  }

  return Math.round(size);
}

function clampStrokeWidth(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Number(value.toFixed(2));
}

function getIconPalette(tone: IconTone): IconPalette {
  if (tone === 'light') {
    return {
      stroke: BRAND_COLORS.textOnLight,
      background: BRAND_COLORS.surfaceLight,
    };
  }

  if (tone === 'brand') {
    return {
      stroke: BRAND_COLORS.amber,
      background: BRAND_COLORS.surfaceDark,
    };
  }

  return {
    stroke: BRAND_COLORS.textOnDark,
    background: BRAND_COLORS.surfaceDark,
  };
}

export const ICON_DEFINITIONS = {
  orders: {
    title: 'Orders',
    viewBox: '0 0 24 24',
    body: `
      <rect x="5" y="4" width="14" height="16" rx="2.5" />
      <path d="M8 8.25h8M8 12h8M8 15.75h5.5" />
      <path d="M15.5 4v3" />
    `,
  },
  menu: {
    title: 'Menu',
    viewBox: '0 0 24 24',
    body: `
      <path d="M6 3.5v7.25a2 2 0 0 0 4 0V3.5" />
      <path d="M4.25 3.5v4.25M6 3.5v4.25M7.75 3.5v4.25" />
      <path d="M16.75 3.5v17" />
      <path d="M16.75 3.5c2 0 3 1.8 3 4v1.5h-3" />
    `,
  },
  loyalty: {
    title: 'Loyalty',
    viewBox: '0 0 24 24',
    body: `
      <rect x="3.5" y="6" width="17" height="12" rx="3" />
      <path d="M7 10h1M7 14h3" />
      <path d="M13 9.2l.95 1.95 2.15.31-1.55 1.51.36 2.13L13 14.1l-1.91 1.02.36-2.13-1.55-1.51 2.15-.31L13 9.2Z" />
    `,
  },
  analytics: {
    title: 'Analytics',
    viewBox: '0 0 24 24',
    body: `
      <path d="M4 19.5h16" />
      <path d="M7 16v-4.5M12 16V7.5M17 16v-7" />
      <path d="M6 9.5 10.25 6 13.25 9l4.75-4" />
    `,
  },
  customers: {
    title: 'Customers',
    viewBox: '0 0 24 24',
    body: `
      <path d="M12 13.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z" />
      <path d="M5 19.25c1.35-2.7 4.06-4.25 7-4.25s5.65 1.55 7 4.25" />
      <path d="M5.25 11.5a2.5 2.5 0 1 0-1.5-4.5" />
      <path d="M18.75 11.5a2.5 2.5 0 1 1 1.5-4.5" />
    `,
  },
  checkout: {
    title: 'Checkout',
    viewBox: '0 0 24 24',
    body: `
      <rect x="3.5" y="6" width="17" height="12" rx="2.5" />
      <path d="M3.5 10h17" />
      <path d="M7 14.5h3.5M13.5 14.5h3.5" />
    `,
  },
  delivery: {
    title: 'Delivery',
    viewBox: '0 0 24 24',
    body: `
      <path d="M4 8.5h10v7H4Z" />
      <path d="M14 10.5h2.5l2 2.5v2.5H14" />
      <path d="M7 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    `,
  },
  search: {
    title: 'Search',
    viewBox: '0 0 24 24',
    body: `
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    `,
  },
  refresh: {
    title: 'Refresh',
    viewBox: '0 0 24 24',
    body: `
      <path d="M19 8.5A7.5 7.5 0 0 0 6.2 5.9" />
      <path d="M5 3.75v4.5h4.5" />
      <path d="M5 15.5A7.5 7.5 0 0 0 17.8 18.1" />
      <path d="M19 20.25v-4.5h-4.5" />
    `,
  },
  notification: {
    title: 'Notification',
    viewBox: '0 0 24 24',
    body: `
      <path d="M8.5 18.5h7" />
      <path d="M12 5a4 4 0 0 1 4 4v2.75c0 .75.24 1.48.68 2.09L18 15.75H6l1.32-1.91A3.6 3.6 0 0 0 8 11.75V9a4 4 0 0 1 4-4Z" />
      <path d="M10 18.5a2 2 0 0 0 4 0" />
    `,
  },
  alert: {
    title: 'Alert',
    viewBox: '0 0 24 24',
    body: `
      <path d="M12 4.5 20 18.5H4L12 4.5Z" />
      <path d="M12 9v4.5M12 16.5h.01" />
    `,
  },
  success: {
    title: 'Success',
    viewBox: '0 0 24 24',
    body: `
      <circle cx="12" cy="12" r="8" />
      <path d="m8.75 12.25 2.25 2.25 4.5-5" />
    `,
  },
  settings: {
    title: 'Settings',
    viewBox: '0 0 24 24',
    body: `
      <circle cx="12" cy="12" r="3" />
      <path d="M12 4.5v2.25M12 17.25v2.25M4.5 12h2.25M17.25 12h2.25" />
      <path d="m6.7 6.7 1.6 1.6m7.4 7.4 1.6 1.6m0-10.6-1.6 1.6M8.3 15.7l-1.6 1.6" />
      <circle cx="12" cy="12" r="7.25" />
    `,
  },
  revenue: {
    title: 'Revenue',
    viewBox: '0 0 24 24',
    body: `
      <path d="M4.5 18.5h15" />
      <path d="M7 15.5 10.25 11l3 2.75 5.25-6.25" />
      <path d="M16.5 7.5h2v2" />
      <path d="M12 6.5v11" />
      <path d="M9.75 9.25c0-1.4 1.03-2.25 2.5-2.25 1.3 0 2.26.56 2.26 1.72 0 1.06-.71 1.46-2.31 1.84-1.45.34-2.2.7-2.2 1.77 0 1.12 1.01 1.92 2.55 1.92 1.15 0 2.21-.43 3.02-1.26" />
    `,
  },
} satisfies Record<IconName, IconDefinition>;

export function getIconDefinition(name: IconName): IconDefinition {
  return ICON_DEFINITIONS[name];
}

export function createIconSvg(name: IconName, options: IconRenderOptions = {}): string {
  const definition = getIconDefinition(name);
  const size = clampSize(options.size, 24);
  const strokeWidth = clampStrokeWidth(options.strokeWidth, 1.8);
  const title = options.title ?? definition.title;
  const decorative = options.decorative ?? false;
  const safeTitle = escapeXml(title);
  const palette = getIconPalette(options.tone ?? 'dark');
  const ariaMarkup = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${safeTitle}"`;
  const titleMarkup = decorative ? '' : `<title>${safeTitle}</title>`;

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="${size}"
  height="${size}"
  viewBox="${definition.viewBox}"
  fill="none"
  stroke="${palette.stroke}"
  stroke-width="${strokeWidth}"
  stroke-linecap="round"
  stroke-linejoin="round"
  ${ariaMarkup}
>
  ${titleMarkup}
  <rect x="0.75" y="0.75" width="${size - 1.5}" height="${size - 1.5}" rx="${Math.max(4, Math.round(size * 0.2))}" fill="${palette.background}" opacity="0" stroke="none" />
  ${definition.body}
</svg>
`.trim();
}

export function createIconDataUri(name: IconName, options: IconRenderOptions = {}): string {
  return svgToDataUri(createIconSvg(name, options));
}

export function createIconAsset(name: IconName, options: IconRenderOptions = {}): IconAsset {
  const svg = createIconSvg(name, options);

  return {
    name,
    svg,
    dataUri: svgToDataUri(svg),
  };
}

export const ICON_ASSETS = {
  orders: createIconAsset('orders', { tone: 'dark' }),
  menu: createIconAsset('menu', { tone: 'dark' }),
  loyalty: createIconAsset('loyalty', { tone: 'dark' }),
  analytics: createIconAsset('analytics', { tone: 'dark' }),
  customers: createIconAsset('customers', { tone: 'dark' }),
  checkout: createIconAsset('checkout', { tone: 'dark' }),
  delivery: createIconAsset('delivery', { tone: 'dark' }),
  search: createIconAsset('search', { tone: 'dark' }),
  refresh: createIconAsset('refresh', { tone: 'dark' }),
  notification: createIconAsset('notification', { tone: 'dark' }),
  alert: createIconAsset('alert', { tone: 'brand' }),
  success: createIconAsset('success', { tone: 'brand' }),
  settings: createIconAsset('settings', { tone: 'dark' }),
  revenue: createIconAsset('revenue', { tone: 'brand' }),
} satisfies Record<IconName, IconAsset>;

export default ICON_ASSETS;