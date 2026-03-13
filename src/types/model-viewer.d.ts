import type * as React from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        alt?: string;
        poster?: string;
        autoplay?: boolean | string;
        'auto-rotate'?: boolean | string;
        'auto-rotate-delay'?: string | number;
        'camera-controls'?: boolean | string;
        'interaction-prompt'?: string;
        'shadow-intensity'?: string | number;
        'environment-image'?: string;
        exposure?: string | number;
        orientation?: string;
        'camera-target'?: string;
        'camera-orbit'?: string;
        'min-camera-orbit'?: string;
        'max-camera-orbit'?: string;
        'rotation-per-second'?: string;
        'disable-zoom'?: boolean | string;
        ar?: boolean | string;
        onLoad?: React.ReactEventHandler<HTMLElement>;
        onError?: React.ReactEventHandler<HTMLElement>;
      };
    }
  }
}

export {};
