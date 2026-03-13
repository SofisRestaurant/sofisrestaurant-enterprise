export const APP_NAME = "Sofi's Restaurant";
export const APP_SHORT_NAME = "Sofi's";
export const APP_TAGLINE = 'Legacy flavors • modern hospitality';

export const BRAND_COLORS = {
  amber: '#f59e0b',
  amberSoft: '#fbbf24',
  amberMuted: '#d97706',
  surfaceDark: '#050509',
  surfaceDarkElevated: '#111318',
  surfaceLight: '#fafaf9',
  surfaceLightElevated: '#ffffff',
  borderDark: '#27272a',
  borderLight: '#d4d4d8',
  textOnDark: '#f4f4f5',
  textMutedOnDark: '#a1a1aa',
  textOnLight: '#18181b',
  textMutedOnLight: '#52525b',
} as const;

export type BrandTheme = 'dark' | 'light';
export type LogoKind = 'mark' | 'wordmark' | 'lockup';

export interface LogoAsset {
  kind: LogoKind;
  theme: BrandTheme;
  name: string;
  alt: string;
  width: number;
  height: number;
  viewBox: string;
  svg: string;
  dataUri: string;
}

interface ThemePalette {
  background: string;
  panel: string;
  border: string;
  ring: string;
  accent: string;
  accentSoft: string;
  accentMuted: string;
  text: string;
  textMuted: string;
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

function getThemePalette(theme: BrandTheme): ThemePalette {
  if (theme === 'light') {
    return {
      background: BRAND_COLORS.surfaceLight,
      panel: BRAND_COLORS.surfaceLightElevated,
      border: BRAND_COLORS.borderLight,
      ring: '#e7e5e4',
      accent: BRAND_COLORS.amberMuted,
      accentSoft: BRAND_COLORS.amber,
      accentMuted: '#fef3c7',
      text: BRAND_COLORS.textOnLight,
      textMuted: BRAND_COLORS.textMutedOnLight,
    };
  }

  return {
    background: BRAND_COLORS.surfaceDark,
    panel: BRAND_COLORS.surfaceDarkElevated,
    border: BRAND_COLORS.borderDark,
    ring: '#3f3f46',
    accent: BRAND_COLORS.amber,
    accentSoft: BRAND_COLORS.amberSoft,
    accentMuted: '#78350f',
    text: BRAND_COLORS.textOnDark,
    textMuted: BRAND_COLORS.textMutedOnDark,
  };
}

function renderMarkGraphic(theme: BrandTheme): string {
  const palette = getThemePalette(theme);

  return `
    <rect x="8" y="8" width="112" height="112" rx="28" fill="${palette.background}" />
    <rect x="8.5" y="8.5" width="111" height="111" rx="27.5" fill="none" stroke="${palette.border}" />
    <circle cx="52" cy="64" r="28" fill="${palette.accentMuted}" opacity="0.32" />
    <circle cx="52" cy="64" r="24" fill="none" stroke="${palette.ring}" stroke-width="5" />
    <path
      d="M61 44.5c-3.5-3.5-8.5-5.5-14.5-5.5-9.8 0-17 5.4-17 12.9 0 7.1 4.9 10.3 15.8 12.2 10 1.7 14.2 3.8 14.2 9.2 0 6.2-5.8 10.4-14.5 10.4-7.4 0-13.2-2.8-18.1-8"
      fill="none"
      stroke="${palette.accent}"
      stroke-width="7"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path d="M87 34v61" fill="none" stroke="${palette.text}" stroke-width="5" stroke-linecap="round" />
    <path d="M79 34v18M87 34v18M95 34v18" fill="none" stroke="${palette.text}" stroke-width="4" stroke-linecap="round" />
    <path d="M30 95h66" fill="none" stroke="${palette.border}" stroke-width="4" stroke-linecap="round" opacity="0.8" />
    <circle cx="99" cy="29" r="6" fill="${palette.accentSoft}" opacity="0.9" />
  `;
}

function createMarkSvg(theme: BrandTheme, title: string): string {
  const safeTitle = escapeXml(title);

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="128"
  height="128"
  viewBox="0 0 128 128"
  role="img"
  aria-label="${safeTitle}"
  fill="none"
>
  <title>${safeTitle}</title>
  ${renderMarkGraphic(theme)}
</svg>
`.trim();
}

function createWordmarkSvg(theme: BrandTheme, title: string): string {
  const palette = getThemePalette(theme);
  const safeTitle = escapeXml(title);
  const safeName = escapeXml(APP_NAME);
  const safeTagline = escapeXml(APP_TAGLINE);

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="560"
  height="140"
  viewBox="0 0 560 140"
  role="img"
  aria-label="${safeTitle}"
  fill="none"
>
  <title>${safeTitle}</title>
  <rect x="0.5" y="0.5" width="559" height="139" rx="24" fill="${palette.background}" stroke="${palette.border}" />
  <circle cx="42" cy="42" r="10" fill="${palette.accentSoft}" opacity="0.85" />
  <rect x="28" y="96" width="160" height="6" rx="3" fill="${palette.accent}" opacity="0.9" />
  <text
    x="28"
    y="58"
    fill="${palette.accent}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="42"
    font-weight="800"
    letter-spacing="-0.04em"
  >
    Sofi&apos;s
  </text>
  <text
    x="28"
    y="98"
    fill="${palette.text}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="34"
    font-weight="700"
    letter-spacing="-0.03em"
  >
    Restaurant
  </text>
  <text
    x="206"
    y="101"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="15"
    font-weight="600"
    letter-spacing="0.16em"
  >
    ${safeTagline.toUpperCase()}
  </text>
  <text
    x="28"
    y="124"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="12"
    font-weight="500"
    letter-spacing="0.08em"
  >
    ${safeName}
  </text>
</svg>
`.trim();
}

function createLockupSvg(theme: BrandTheme, title: string): string {
  const palette = getThemePalette(theme);
  const safeTitle = escapeXml(title);
  const safeTagline = escapeXml(APP_TAGLINE);

  return `
<svg
  xmlns="http://www.w3.org/2000/svg"
  width="640"
  height="180"
  viewBox="0 0 640 180"
  role="img"
  aria-label="${safeTitle}"
  fill="none"
>
  <title>${safeTitle}</title>
  <rect x="0.5" y="0.5" width="639" height="179" rx="28" fill="${palette.background}" stroke="${palette.border}" />
  <g transform="translate(24 26)">
    ${renderMarkGraphic(theme)}
  </g>
  <circle cx="590" cy="42" r="12" fill="${palette.accentSoft}" opacity="0.9" />
  <text
    x="184"
    y="78"
    fill="${palette.accent}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="42"
    font-weight="800"
    letter-spacing="-0.04em"
  >
    Sofi&apos;s
  </text>
  <text
    x="184"
    y="118"
    fill="${palette.text}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="34"
    font-weight="700"
    letter-spacing="-0.03em"
  >
    Restaurant
  </text>
  <text
    x="184"
    y="147"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="15"
    font-weight="600"
    letter-spacing="0.16em"
  >
    ${safeTagline.toUpperCase()}
  </text>
  <rect x="184" y="158" width="224" height="6" rx="3" fill="${palette.accent}" opacity="0.9" />
</svg>
`.trim();
}

function getAssetDimensions(kind: LogoKind): { width: number; height: number; viewBox: string } {
  switch (kind) {
    case 'mark':
      return { width: 128, height: 128, viewBox: '0 0 128 128' };
    case 'wordmark':
      return { width: 560, height: 140, viewBox: '0 0 560 140' };
    case 'lockup':
      return { width: 640, height: 180, viewBox: '0 0 640 180' };
  }
}

export function createLogoSvg(kind: LogoKind, theme: BrandTheme = 'dark'): string {
  const title =
    kind === 'mark'
      ? `${APP_NAME} brand mark`
      : kind === 'wordmark'
        ? `${APP_NAME} wordmark`
        : `${APP_NAME} logo lockup`;

  switch (kind) {
    case 'mark':
      return createMarkSvg(theme, title);
    case 'wordmark':
      return createWordmarkSvg(theme, title);
    case 'lockup':
      return createLockupSvg(theme, title);
  }
}

export function createLogoAsset(kind: LogoKind, theme: BrandTheme = 'dark'): LogoAsset {
  const dimensions = getAssetDimensions(kind);
  const svg = createLogoSvg(kind, theme);

  return {
    kind,
    theme,
    name: APP_NAME,
    alt:
      kind === 'mark'
        ? `${APP_NAME} brand mark`
        : kind === 'wordmark'
          ? `${APP_NAME} wordmark`
          : `${APP_NAME} logo`,
    width: dimensions.width,
    height: dimensions.height,
    viewBox: dimensions.viewBox,
    svg,
    dataUri: svgToDataUri(svg),
  };
}

export const LOGO_ASSETS = {
  mark: {
    dark: createLogoAsset('mark', 'dark'),
    light: createLogoAsset('mark', 'light'),
  },
  wordmark: {
    dark: createLogoAsset('wordmark', 'dark'),
    light: createLogoAsset('wordmark', 'light'),
  },
  lockup: {
    dark: createLogoAsset('lockup', 'dark'),
    light: createLogoAsset('lockup', 'light'),
  },
} satisfies Record<LogoKind, Record<BrandTheme, LogoAsset>>;

export const BRAND_LOGO = LOGO_ASSETS.lockup.dark;
export const BRAND_MARK = LOGO_ASSETS.mark.dark;
export const FAVICON_ASSET = LOGO_ASSETS.mark.dark;

export function getLogoAsset(kind: LogoKind = 'lockup', theme: BrandTheme = 'dark'): LogoAsset {
  return LOGO_ASSETS[kind][theme];
}

export function getLogoSvg(kind: LogoKind = 'lockup', theme: BrandTheme = 'dark'): string {
  return getLogoAsset(kind, theme).svg;
}

export function getLogoDataUri(kind: LogoKind = 'lockup', theme: BrandTheme = 'dark'): string {
  return getLogoAsset(kind, theme).dataUri;
}

export default LOGO_ASSETS;