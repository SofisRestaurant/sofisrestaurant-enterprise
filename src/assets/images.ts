import { APP_NAME, APP_TAGLINE, BRAND_COLORS, type BrandTheme } from './logo';

export const IMAGE_NAMES = [
  'hero',
  'adminDashboard',
  'emptyOrders',
  'loyaltyCard',
  'texture',
] as const;

export type ImageName = (typeof IMAGE_NAMES)[number];

export interface GeneratedImageAsset {
  name: ImageName;
  theme: BrandTheme;
  alt: string;
  width: number;
  height: number;
  aspectRatio: number;
  svg: string;
  dataUri: string;
  blurDataUri: string;
  dominantColor: string;
}

interface ImagePalette {
  background: string;
  panel: string;
  panelAlt: string;
  border: string;
  accent: string;
  accentSoft: string;
  accentMuted: string;
  text: string;
  textMuted: string;
  success: string;
  danger: string;
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

function getPalette(theme: BrandTheme): ImagePalette {
  if (theme === 'light') {
    return {
      background: BRAND_COLORS.surfaceLight,
      panel: BRAND_COLORS.surfaceLightElevated,
      panelAlt: '#f4f4f5',
      border: BRAND_COLORS.borderLight,
      accent: BRAND_COLORS.amberMuted,
      accentSoft: BRAND_COLORS.amber,
      accentMuted: '#fef3c7',
      text: BRAND_COLORS.textOnLight,
      textMuted: BRAND_COLORS.textMutedOnLight,
      success: '#059669',
      danger: '#dc2626',
    };
  }

  return {
    background: BRAND_COLORS.surfaceDark,
    panel: BRAND_COLORS.surfaceDarkElevated,
    panelAlt: '#171a21',
    border: BRAND_COLORS.borderDark,
    accent: BRAND_COLORS.amber,
    accentSoft: BRAND_COLORS.amberSoft,
    accentMuted: '#78350f',
    text: BRAND_COLORS.textOnDark,
    textMuted: BRAND_COLORS.textMutedOnDark,
    success: '#34d399',
    danger: '#f87171',
  };
}

function createHeroSvg(theme: BrandTheme): string {
  const palette = getPalette(theme);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="820" viewBox="0 0 1440 820" fill="none" role="img" aria-label="${escapeXml(APP_NAME)} hero illustration">
  <title>${escapeXml(APP_NAME)} hero illustration</title>
  <rect width="1440" height="820" rx="40" fill="${palette.background}" />
  <circle cx="1260" cy="116" r="170" fill="${palette.accent}" opacity="0.11" />
  <circle cx="180" cy="688" r="140" fill="${palette.accentSoft}" opacity="0.08" />
  <rect x="64" y="72" width="620" height="676" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <text
    x="112"
    y="190"
    fill="${palette.accent}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="58"
    font-weight="800"
    letter-spacing="-0.05em"
  >
    Sofi&apos;s Restaurant
  </text>
  <text
    x="112"
    y="242"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="24"
    font-weight="600"
    letter-spacing="0.01em"
  >
    ${escapeXml(APP_TAGLINE)}
  </text>
  <rect x="112" y="292" width="220" height="46" rx="23" fill="${palette.accent}" opacity="0.14" />
  <text
    x="142"
    y="321"
    fill="${palette.accentSoft}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="18"
    font-weight="700"
    letter-spacing="0.06em"
  >
    ORDERS • LOYALTY • DELIVERY
  </text>
  <text
    x="112"
    y="398"
    fill="${palette.text}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="34"
    font-weight="700"
    letter-spacing="-0.03em"
  >
    A modern restaurant experience
  </text>
  <text
    x="112"
    y="438"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="22"
    font-weight="500"
  >
    Fast checkout, real-time order visibility,
  </text>
  <text
    x="112"
    y="470"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="22"
    font-weight="500"
  >
    and loyalty experiences designed for conversion.
  </text>
  <rect x="112" y="546" width="500" height="118" rx="26" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="138" y="574" width="132" height="16" rx="8" fill="${palette.textMuted}" opacity="0.18" />
  <rect x="138" y="608" width="220" height="12" rx="6" fill="${palette.textMuted}" opacity="0.14" />
  <rect x="138" y="632" width="172" height="12" rx="6" fill="${palette.textMuted}" opacity="0.14" />
  <rect x="422" y="578" width="164" height="52" rx="18" fill="${palette.accent}" opacity="0.16" />
  <text
    x="458"
    y="611"
    fill="${palette.accentSoft}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="20"
    font-weight="800"
  >
    VIEW MENU
  </text>

  <rect x="744" y="88" width="632" height="644" rx="36" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="792" y="136" width="240" height="140" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="812" y="158" width="112" height="12" rx="6" fill="${palette.textMuted}" opacity="0.2" />
  <rect x="812" y="184" width="88" height="46" rx="16" fill="${palette.accent}" opacity="0.16" />
  <text
    x="836"
    y="213"
    fill="${palette.accentSoft}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="20"
    font-weight="800"
  >
    148
  </text>
  <text
    x="812"
    y="252"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="14"
    font-weight="600"
    letter-spacing="0.12em"
  >
    ACTIVE ORDERS
  </text>

  <rect x="1060" y="136" width="268" height="140" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <path d="M1090 232h208" stroke="${palette.border}" stroke-width="4" stroke-linecap="round" />
  <path d="M1094 214 1154 176l50 18 76-68" stroke="${palette.accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="1154" cy="176" r="8" fill="${palette.accentSoft}" />
  <circle cx="1204" cy="194" r="8" fill="${palette.accentSoft}" />
  <circle cx="1280" cy="126" r="8" fill="${palette.accentSoft}" />

  <rect x="792" y="308" width="536" height="168" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="820" y="338" width="180" height="14" rx="7" fill="${palette.textMuted}" opacity="0.2" />
  <rect x="820" y="370" width="468" height="18" rx="9" fill="${palette.textMuted}" opacity="0.12" />
  <rect x="820" y="404" width="342" height="18" rx="9" fill="${palette.textMuted}" opacity="0.12" />
  <rect x="1192" y="356" width="100" height="44" rx="16" fill="${palette.success}" opacity="0.16" />
  <text
    x="1220"
    y="384"
    fill="${palette.success}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="18"
    font-weight="800"
  >
    READY
  </text>

  <rect x="792" y="504" width="254" height="176" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="1074" y="504" width="254" height="176" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="820" y="534" width="104" height="12" rx="6" fill="${palette.textMuted}" opacity="0.2" />
  <rect x="820" y="562" width="184" height="44" rx="14" fill="${palette.accent}" opacity="0.15" />
  <text
    x="846"
    y="590"
    fill="${palette.accentSoft}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="22"
    font-weight="800"
  >
    98.4%
  </text>
  <text
    x="820"
    y="632"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="15"
    font-weight="600"
    letter-spacing="0.12em"
  >
    PAYMENT SUCCESS
  </text>

  <rect x="1100" y="534" width="120" height="12" rx="6" fill="${palette.textMuted}" opacity="0.2" />
  <rect x="1100" y="564" width="42" height="70" rx="12" fill="${palette.accent}" opacity="0.16" />
  <rect x="1152" y="548" width="42" height="86" rx="12" fill="${palette.accent}" opacity="0.28" />
  <rect x="1204" y="582" width="42" height="52" rx="12" fill="${palette.accent}" opacity="0.42" />
  <rect x="1256" y="526" width="42" height="108" rx="12" fill="${palette.accent}" opacity="0.65" />
</svg>
`.trim();
}

function createAdminDashboardSvg(theme: BrandTheme): string {
  const palette = getPalette(theme);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" fill="none" role="img" aria-label="Admin dashboard illustration">
  <title>Admin dashboard illustration</title>
  <rect width="1200" height="760" rx="36" fill="${palette.background}" />
  <rect x="32" y="32" width="1136" height="696" rx="30" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="64" y="64" width="220" height="632" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="92" y="104" width="104" height="12" rx="6" fill="${palette.textMuted}" opacity="0.2" />
  <rect x="92" y="146" width="164" height="40" rx="14" fill="${palette.accent}" opacity="0.16" />
  <rect x="92" y="204" width="164" height="40" rx="14" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="92" y="262" width="164" height="40" rx="14" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="92" y="320" width="164" height="40" rx="14" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="316" y="64" width="820" height="108" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <text
    x="352"
    y="112"
    fill="${palette.text}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="28"
    font-weight="800"
  >
    ${escapeXml(APP_NAME)}
  </text>
  <text
    x="352"
    y="142"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="16"
    font-weight="600"
  >
    Admin overview • live operations • revenue visibility
  </text>

  <rect x="316" y="204" width="252" height="152" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="592" y="204" width="252" height="152" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="868" y="204" width="268" height="152" rx="24" fill="${palette.panelAlt}" stroke="${palette.border}" />

  <text x="344" y="250" fill="${palette.textMuted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="700" letter-spacing="0.12em">LIVE ORDERS</text>
  <text x="344" y="310" fill="${palette.accent}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="46" font-weight="800">32</text>

  <text x="620" y="250" fill="${palette.textMuted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="700" letter-spacing="0.12em">READY FOR PICKUP</text>
  <text x="620" y="310" fill="${palette.success}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="46" font-weight="800">11</text>

  <text x="896" y="250" fill="${palette.textMuted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="14" font-weight="700" letter-spacing="0.12em">ESCALATIONS</text>
  <text x="896" y="310" fill="${palette.danger}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="46" font-weight="800">2</text>

  <rect x="316" y="388" width="520" height="276" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="868" y="388" width="268" height="276" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <text x="350" y="430" fill="${palette.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="800">Revenue trend</text>
  <path d="M352 612h444" stroke="${palette.border}" stroke-width="4" stroke-linecap="round" />
  <path d="M360 578 426 538l56 18 66-70 70 36 74-88 76 42" stroke="${palette.accent}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="426" cy="538" r="8" fill="${palette.accentSoft}" />
  <circle cx="548" cy="486" r="8" fill="${palette.accentSoft}" />
  <circle cx="692" cy="434" r="8" fill="${palette.accentSoft}" />

  <text x="896" y="430" fill="${palette.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="800">Order feed</text>
  <rect x="896" y="456" width="212" height="54" rx="16" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="896" y="524" width="212" height="54" rx="16" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="896" y="592" width="212" height="54" rx="16" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="918" y="476" width="66" height="14" rx="7" fill="${palette.textMuted}" opacity="0.18" />
  <rect x="918" y="544" width="82" height="14" rx="7" fill="${palette.textMuted}" opacity="0.18" />
  <rect x="918" y="612" width="70" height="14" rx="7" fill="${palette.textMuted}" opacity="0.18" />
  <rect x="1012" y="468" width="76" height="28" rx="12" fill="${palette.accent}" opacity="0.16" />
  <rect x="1002" y="536" width="86" height="28" rx="12" fill="${palette.success}" opacity="0.16" />
  <rect x="1010" y="604" width="78" height="28" rx="12" fill="${palette.danger}" opacity="0.16" />
</svg>
`.trim();
}

function createEmptyOrdersSvg(theme: BrandTheme): string {
  const palette = getPalette(theme);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="720" viewBox="0 0 960 720" fill="none" role="img" aria-label="Empty orders illustration">
  <title>Empty orders illustration</title>
  <rect width="960" height="720" rx="32" fill="${palette.background}" />
  <circle cx="760" cy="120" r="90" fill="${palette.accent}" opacity="0.11" />
  <rect x="220" y="96" width="520" height="528" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="288" y="150" width="384" height="420" rx="28" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="352" y="122" width="256" height="50" rx="20" fill="${palette.accent}" opacity="0.16" />
  <text
    x="404"
    y="154"
    fill="${palette.accentSoft}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="24"
    font-weight="800"
  >
    ORDERS
  </text>

  <rect x="326" y="216" width="34" height="34" rx="10" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="326" y="292" width="34" height="34" rx="10" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="326" y="368" width="34" height="34" rx="10" fill="${palette.background}" stroke="${palette.border}" />
  <rect x="326" y="444" width="34" height="34" rx="10" fill="${palette.background}" stroke="${palette.border}" />

  <path d="m334 308 8 8 12-14" stroke="${palette.success}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  <path d="m334 384 8 8 12-14" stroke="${palette.success}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />

  <rect x="382" y="222" width="228" height="12" rx="6" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="382" y="246" width="164" height="10" rx="5" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="382" y="298" width="198" height="12" rx="6" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="382" y="322" width="188" height="10" rx="5" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="382" y="374" width="210" height="12" rx="6" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="382" y="398" width="154" height="10" rx="5" fill="${palette.textMuted}" opacity="0.1" />
  <rect x="382" y="450" width="174" height="12" rx="6" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="382" y="474" width="204" height="10" rx="5" fill="${palette.textMuted}" opacity="0.1" />

  <text
    x="314"
    y="640"
    fill="${palette.text}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="28"
    font-weight="800"
  >
    No active orders right now
  </text>
  <text
    x="250"
    y="676"
    fill="${palette.textMuted}"
    font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    font-size="18"
    font-weight="600"
  >
    New paid orders will appear here as soon as customers complete checkout.
  </text>
</svg>
`.trim();
}

function createLoyaltyCardSvg(theme: BrandTheme): string {
  const palette = getPalette(theme);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720" fill="none" role="img" aria-label="Loyalty card illustration">
  <title>Loyalty card illustration</title>
  <rect width="1200" height="720" rx="36" fill="${palette.background}" />
  <circle cx="1010" cy="122" r="120" fill="${palette.accent}" opacity="0.12" />
  <circle cx="176" cy="610" r="110" fill="${palette.accentSoft}" opacity="0.08" />
  <rect x="172" y="132" width="856" height="456" rx="36" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="220" y="180" width="760" height="360" rx="32" fill="${palette.panelAlt}" stroke="${palette.border}" />
  <rect x="270" y="232" width="176" height="176" rx="36" fill="${palette.background}" stroke="${palette.border}" />
  <circle cx="358" cy="320" r="46" fill="${palette.accentMuted}" opacity="0.35" />
  <path d="M386 278v84" stroke="${palette.text}" stroke-width="7" stroke-linecap="round" />
  <path d="M374 278v24M386 278v24M398 278v24" stroke="${palette.text}" stroke-width="5" stroke-linecap="round" />
  <path
    d="M364 288c-3-3-7.3-4.7-12.5-4.7-8.2 0-14.2 4.5-14.2 10.8 0 5.9 4 8.6 13.2 10.1 8.3 1.5 11.8 3.2 11.8 7.7 0 5.2-4.9 8.7-12.1 8.7-6.2 0-11-2.3-15.1-6.6"
    fill="none"
    stroke="${palette.accent}"
    stroke-width="6.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />

  <text x="492" y="270" fill="${palette.accent}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="800" letter-spacing="0.18em">LOYALTY MEMBER</text>
  <text x="492" y="332" fill="${palette.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="48" font-weight="800" letter-spacing="-0.04em">Sofi&apos;s Rewards</text>
  <text x="492" y="374" fill="${palette.textMuted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="600">Earn points automatically with every paid order.</text>
  <rect x="492" y="416" width="172" height="48" rx="18" fill="${palette.accent}" opacity="0.16" />
  <text x="530" y="447" fill="${palette.accentSoft}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="22" font-weight="800">240 PTS</text>

  <rect x="804" y="228" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="804" y="262" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="804" y="296" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="804" y="362" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="804" y="396" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <rect x="804" y="430" width="126" height="14" rx="7" fill="${palette.textMuted}" opacity="0.16" />
  <text x="222" y="636" fill="${palette.textMuted}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="18" font-weight="600">${escapeXml(APP_NAME)} • loyalty-first guest retention</text>
</svg>
`.trim();
}

function createTextureSvg(theme: BrandTheme): string {
  const palette = getPalette(theme);

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" fill="none" role="img" aria-label="Ambient brand texture">
  <title>Ambient brand texture</title>
  <rect width="1600" height="900" fill="${palette.background}" />
  <circle cx="210" cy="160" r="140" fill="${palette.accent}" opacity="0.05" />
  <circle cx="1410" cy="710" r="180" fill="${palette.accentSoft}" opacity="0.05" />
  <path d="M40 168h560" stroke="${palette.border}" stroke-width="2" stroke-linecap="round" opacity="0.7" />
  <path d="M1000 128h520" stroke="${palette.border}" stroke-width="2" stroke-linecap="round" opacity="0.7" />
  <path d="M160 780h640" stroke="${palette.border}" stroke-width="2" stroke-linecap="round" opacity="0.7" />
  <path d="M900 736h480" stroke="${palette.border}" stroke-width="2" stroke-linecap="round" opacity="0.7" />
  <rect x="124" y="246" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="378" y="246" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="632" y="246" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="748" y="546" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="1002" y="546" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <rect x="1256" y="546" width="220" height="220" rx="32" fill="${palette.panel}" stroke="${palette.border}" />
  <circle cx="234" cy="356" r="18" fill="${palette.accent}" opacity="0.75" />
  <circle cx="488" cy="356" r="18" fill="${palette.accent}" opacity="0.55" />
  <circle cx="742" cy="356" r="18" fill="${palette.accent}" opacity="0.35" />
  <circle cx="858" cy="656" r="18" fill="${palette.accent}" opacity="0.35" />
  <circle cx="1112" cy="656" r="18" fill="${palette.accent}" opacity="0.55" />
  <circle cx="1366" cy="656" r="18" fill="${palette.accent}" opacity="0.75" />
</svg>
`.trim();
}

function getImageMeta(name: ImageName): { alt: string; width: number; height: number } {
  switch (name) {
    case 'hero':
      return {
        alt: `${APP_NAME} hero illustration`,
        width: 1440,
        height: 820,
      };
    case 'adminDashboard':
      return {
        alt: `${APP_NAME} admin dashboard illustration`,
        width: 1200,
        height: 760,
      };
    case 'emptyOrders':
      return {
        alt: `${APP_NAME} empty orders illustration`,
        width: 960,
        height: 720,
      };
    case 'loyaltyCard':
      return {
        alt: `${APP_NAME} loyalty card illustration`,
        width: 1200,
        height: 720,
      };
    case 'texture':
      return {
        alt: `${APP_NAME} ambient texture illustration`,
        width: 1600,
        height: 900,
      };
  }
}

export function createImageSvg(name: ImageName, theme: BrandTheme = 'dark'): string {
  switch (name) {
    case 'hero':
      return createHeroSvg(theme);
    case 'adminDashboard':
      return createAdminDashboardSvg(theme);
    case 'emptyOrders':
      return createEmptyOrdersSvg(theme);
    case 'loyaltyCard':
      return createLoyaltyCardSvg(theme);
    case 'texture':
      return createTextureSvg(theme);
  }
}

export function createImageAsset(name: ImageName, theme: BrandTheme = 'dark'): GeneratedImageAsset {
  const meta = getImageMeta(name);
  const palette = getPalette(theme);
  const svg = createImageSvg(name, theme);

  return {
    name,
    theme,
    alt: meta.alt,
    width: meta.width,
    height: meta.height,
    aspectRatio: meta.width / meta.height,
    svg,
    dataUri: svgToDataUri(svg),
    blurDataUri: svgToDataUri(svg),
    dominantColor: palette.background,
  };
}

export const IMAGE_ASSETS = {
  hero: {
    dark: createImageAsset('hero', 'dark'),
    light: createImageAsset('hero', 'light'),
  },
  adminDashboard: {
    dark: createImageAsset('adminDashboard', 'dark'),
    light: createImageAsset('adminDashboard', 'light'),
  },
  emptyOrders: {
    dark: createImageAsset('emptyOrders', 'dark'),
    light: createImageAsset('emptyOrders', 'light'),
  },
  loyaltyCard: {
    dark: createImageAsset('loyaltyCard', 'dark'),
    light: createImageAsset('loyaltyCard', 'light'),
  },
  texture: {
    dark: createImageAsset('texture', 'dark'),
    light: createImageAsset('texture', 'light'),
  },
} satisfies Record<ImageName, Record<BrandTheme, GeneratedImageAsset>>;

export const HERO_IMAGE = IMAGE_ASSETS.hero.dark;
export const ADMIN_DASHBOARD_IMAGE = IMAGE_ASSETS.adminDashboard.dark;
export const EMPTY_ORDERS_IMAGE = IMAGE_ASSETS.emptyOrders.dark;
export const LOYALTY_CARD_IMAGE = IMAGE_ASSETS.loyaltyCard.dark;
export const AMBIENT_TEXTURE_IMAGE = IMAGE_ASSETS.texture.dark;
export const SOCIAL_SHARE_IMAGE = IMAGE_ASSETS.hero.dark;

export function getImageAsset(
  name: ImageName,
  theme: BrandTheme = 'dark',
): GeneratedImageAsset {
  return IMAGE_ASSETS[name][theme];
}

export function getImageSvg(name: ImageName, theme: BrandTheme = 'dark'): string {
  return getImageAsset(name, theme).svg;
}

export function getImageDataUri(name: ImageName, theme: BrandTheme = 'dark'): string {
  return getImageAsset(name, theme).dataUri;
}

export default IMAGE_ASSETS;