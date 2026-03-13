import type { CSSProperties, SVGProps } from 'react';

type SvgIconProps = SVGProps<SVGSVGElement>;

const BASE_ICON_PROPS: Readonly<SvgIconProps> = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

type IconRefreshProps = {
  spinning?: boolean;
} & SvgIconProps;

export function IconBell(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" {...BASE_ICON_PROPS} {...props}>
      <path d="M5.5 11.5a1.5 1.5 0 0 0 3 0" />
      <path d="M7 2a3.5 3.5 0 0 1 3.5 3.5c0 2.5 1 3.5 1 3.5H2.5s1-1 1-3.5A3.5 3.5 0 0 1 7 2Z" />
    </svg>
  );
}

export function IconLogout(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" {...BASE_ICON_PROPS} {...props}>
      <path d="M8.5 2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h5.5" />
      <path d="M9.5 9.5l3-3-3-3" />
      <path d="M5.5 6.5h7" />
    </svg>
  );
}

export function IconBurger(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 18 18" width="18" height="18" {...BASE_ICON_PROPS} {...props}>
      <path d="M2 4h14" />
      <path d="M2 9h14" />
      <path d="M2 14h14" />
    </svg>
  );
}

export function IconClose(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" {...BASE_ICON_PROPS} {...props}>
      <path d="M2 2l10 10" />
      <path d="M12 2L2 12" />
    </svg>
  );
}

export function IconFraud(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 14 14" width="14" height="14" {...BASE_ICON_PROPS} {...props}>
      <path d="M7 1 1 13h12L7 1Z" />
      <path d="M7 5.5v3" />
      <path d="M7 10.5v.5" />
    </svg>
  );
}

export function IconRefresh({ spinning = false, style, ...props }: IconRefreshProps) {
  const mergedStyle: CSSProperties = {
    animation: spinning ? 'spin 1s linear infinite' : 'none',
    ...style,
  };

  return (
    <svg
      viewBox="0 0 12 12"
      width="12"
      height="12"
      style={mergedStyle}
      {...BASE_ICON_PROPS}
      {...props}
    >
      <path d="M10 6A4 4 0 1 1 2 4.2" />
      <path d="M2 1.5v2.8h2.8" />
    </svg>
  );
}

export function IconCart(props: SvgIconProps) {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" {...BASE_ICON_PROPS} {...props}>
      <path d="M1 1h1.5l1.3 5.5h5.5l.9-3.5H3.5" />
      <circle cx="5" cy="10" r=".9" />
      <circle cx="9.5" cy="10" r=".9" />
    </svg>
  );
}