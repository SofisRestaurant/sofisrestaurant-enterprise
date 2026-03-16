// src/types/model-viewer.d.ts
// ─── Type declarations for @google/model-viewer custom element ────────────────
// Extends React's JSX.IntrinsicElements so <model-viewer> is valid in TSX.
// Covers the full public API surface as of model-viewer v3.x.
// Ref: https://modelviewer.dev/docs/index.html

import type * as React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Native DOM interface for imperative access via ref
// Usage: const ref = useRef<ModelViewerElement>(null);
// ─────────────────────────────────────────────────────────────────────────────
export interface ModelViewerElement extends HTMLElement {
  // ── Playback ──────────────────────────────────────────────────────────────
  play(options?: { repetitions?: number }): void;
  pause(): void;
  readonly paused: boolean;
  currentTime: number;
  readonly duration: number;
  timeScale: number;
  availableAnimations: string[];
  animationName: string;

  // ── Camera ────────────────────────────────────────────────────────────────
  cameraOrbit: string;
  cameraTarget: string;
  fieldOfView: string;
  jumpCameraToGoal(): void;
  resetTurntableRotation(theta?: number): void;
  getCameraOrbit(): { theta: number; phi: number; radius: number };
  getCameraTarget(): { x: number; y: number; z: number };
  getFieldOfView(): number;

  // ── Scene ─────────────────────────────────────────────────────────────────
  readonly model: {
    readonly hasAnimation: boolean;
    readonly boundingBox: {
      min: { x: number; y: number; z: number };
      max: { x: number; y: number; z: number };
    };
  } | null;
  readonly loaded: boolean;
  readonly src: string;

  // ── Materials ─────────────────────────────────────────────────────────────
  readonly materials: ModelViewerMaterial[];

  // ── AR ────────────────────────────────────────────────────────────────────
  readonly canActivateAR: boolean;
  activateAR(): Promise<void>;

  // ── Screenshot ────────────────────────────────────────────────────────────
  toBlob(options?: { idealAspect?: boolean; mimeType?: string; qualityArgument?: number }): Promise<Blob>;
  toDataURL(type?: string, encoderOptions?: number): string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Material / PBR types for programmatic material editing
// ─────────────────────────────────────────────────────────────────────────────
export interface ModelViewerMaterial {
  name: string;
  readonly pbrMetallicRoughness: {
    baseColorFactor: [number, number, number, number];
    metallicFactor: number;
    roughnessFactor: number;
    setBaseColorFactor(rgba: [number, number, number, number]): void;
    setMetallicFactor(value: number): void;
    setRoughnessFactor(value: number): void;
  };
  readonly normalTexture: ModelViewerTexture | null;
  readonly occlusionTexture: ModelViewerTexture | null;
  readonly emissiveTexture: ModelViewerTexture | null;
  emissiveFactor: [number, number, number];
  setEmissiveFactor(rgb: [number, number, number]): void;
  setAlphaCutoff(value: number): void;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  doubleSided: boolean;
}

export interface ModelViewerTexture {
  readonly texture: { source: { currentSrc: string } } | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Custom event detail types
// ─────────────────────────────────────────────────────────────────────────────
export interface ModelViewerProgressEvent extends CustomEvent {
  detail: { totalProgress: number };
}

export interface ModelViewerArStatusEvent extends CustomEvent {
  detail: { status: 'not-presenting' | 'session-started' | 'object-placed' | 'failed' };
}

export interface ModelViewerCameraChangeEvent extends CustomEvent {
  detail: {
    source: 'user-interaction' | 'none';
    orbit: { theta: number; phi: number; radius: number };
  };
}

export interface ModelViewerModelVisibilityEvent extends CustomEvent {
  detail: { visible: boolean };
}

// ─────────────────────────────────────────────────────────────────────────────
// JSX attribute type — used in the IntrinsicElements declaration below
// ─────────────────────────────────────────────────────────────────────────────
type BoolAttr = boolean | string;

interface ModelViewerJSXProps {
  // ── Source & display ──────────────────────────────────────────────────────
  src?: string;
  alt?: string;
  poster?: string;
  /** Show the loading UI while src is fetching. Default: 'auto' */
  loading?: 'auto' | 'lazy' | 'eager';
  /** Reveal strategy once loaded. Default: 'auto' */
  reveal?: 'auto' | 'interaction' | 'manual';

  // ── Animation ─────────────────────────────────────────────────────────────
  autoplay?: BoolAttr;
  'animation-name'?: string;
  'animation-crossfade-duration'?: string | number;

  // ── Auto-rotate ───────────────────────────────────────────────────────────
  'auto-rotate'?: BoolAttr;
  /** Delay in ms before auto-rotation starts. Default: 3000 */
  'auto-rotate-delay'?: string | number;
  /** Degrees per second. Default: '1.5rad/s' */
  'rotation-per-second'?: string;

  // ── Camera controls ───────────────────────────────────────────────────────
  'camera-controls'?: BoolAttr;
  'camera-target'?: string;
  'camera-orbit'?: string;
  'field-of-view'?: string;
  'min-camera-orbit'?: string;
  'max-camera-orbit'?: string;
  'min-field-of-view'?: string;
  'max-field-of-view'?: string;
  'disable-zoom'?: BoolAttr;
  'disable-pan'?: BoolAttr;
  'disable-tap'?: BoolAttr;
  'touch-action'?: 'none' | 'pan-x' | 'pan-y';
  /** Prompt style. Default: 'auto' */
  'interaction-prompt'?: 'auto' | 'none' | 'when-focused';
  'interaction-prompt-style'?: 'basic' | 'wiggle';
  'interaction-prompt-threshold'?: string | number;
  'orbit-sensitivity'?: string | number;
  'interpolation-decay'?: string | number;
  /** Duration of bounds-fitting transition in ms */
  'bounds'?: string;

  // ── Lighting & environment ────────────────────────────────────────────────
  'environment-image'?: string;
  'skybox-image'?: string;
  'skybox-height'?: string;
  'shadow-intensity'?: string | number;
  'shadow-softness'?: string | number;
  exposure?: string | number;
  'tone-mapping'?: 'auto' | 'aces' | 'agx' | 'commerce' | 'neutral' | 'reinhard' | 'none';

  // ── Scale & orientation ───────────────────────────────────────────────────
  scale?: string;
  orientation?: string;

  // ── AR ────────────────────────────────────────────────────────────────────
  ar?: BoolAttr;
  'ar-modes'?: string;
  'ar-scale'?: 'auto' | 'fixed';
  'ar-placement'?: 'floor' | 'wall';
  'ios-src'?: string;
  'xr-environment'?: BoolAttr;

  // ── Annotations / hotspots ────────────────────────────────────────────────
  'enable-pan'?: BoolAttr;

  // ── Variant / materials ───────────────────────────────────────────────────
  'variant-name'?: string;

  // ── React-style event handlers ────────────────────────────────────────────
  onLoad?: React.ReactEventHandler<HTMLElement>;
  onError?: React.ReactEventHandler<HTMLElement>;
  onProgress?: (event: ModelViewerProgressEvent) => void;
  onArStatus?: (event: ModelViewerArStatusEvent) => void;
  onArTracking?: React.ReactEventHandler<HTMLElement>;
  onCameraChange?: (event: ModelViewerCameraChangeEvent) => void;
  onModelVisibility?: (event: ModelViewerModelVisibilityEvent) => void;
  onPlay?: React.ReactEventHandler<HTMLElement>;
  onPause?: React.ReactEventHandler<HTMLElement>;
  onAnimationFinish?: React.ReactEventHandler<HTMLElement>;
  onQuickLookButtonTapped?: React.ReactEventHandler<HTMLElement>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge with standard HTML element props and register in JSX
// ─────────────────────────────────────────────────────────────────────────────
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > &
        ModelViewerJSXProps & {
          // Ref support for imperative access
          ref?: React.Ref<ModelViewerElement>;
          // Pass-through for any undocumented or future attributes
          [key: string]: unknown;
        };
    }
  }
}

export {};