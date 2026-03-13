import '@google/model-viewer';
import { useMemo, useState } from 'react';

type BootSplash3DProps = {
  visible: boolean;
  fadingOut?: boolean;
  modelSrc: string;
  title?: string;
  subtitle?: string;
};

export default function BootSplash3D({
  visible,
  fadingOut = false,
  modelSrc,
  title = "SOFI'S RESTAURANT",
  subtitle = 'Preparing your experience...',
}: BootSplash3DProps) {
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const containerClass = useMemo(() => {
    const base = 'fixed inset-0 z-[9999] transition-all duration-300 ease-out pointer-events-none';
    if (visible) return `${base} opacity-100 scale-100`;
    if (fadingOut) return `${base} opacity-0 scale-[1.015]`;
    return `${base} opacity-0`;
  }, [visible, fadingOut]);

  const modelFailed = modelStatus === 'error';
  const showFallbackSpinner = modelStatus !== 'ready';

  return (
    <div className={containerClass} aria-hidden={!visible && !fadingOut}>
      <div className="absolute inset-0 bg-black" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(249,115,22,0.18),transparent_42%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_35%)]" />

      <div className="relative flex h-full w-full flex-col items-center justify-center px-6">
        <div className="relative mb-8 h-280px w-280px sm:h-360px sm:w-360px">
          <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute inset-0 rounded-full border border-white/10" />

          <model-viewer
            src={modelSrc}
            alt="Sofi's Restaurant 3D logo"
            auto-rotate
            auto-rotate-delay="0"
            autoplay
            camera-controls
            interaction-prompt="none"
            shadow-intensity="1"
            environment-image="neutral"
            exposure="1.05"
            camera-target="30m 60m 90m"
            camera-orbit="45deg 7deg -80m"
            rotation-per-second="10deg"
            disable-zoom
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              background: 'transparent',
              opacity: modelFailed ? 0 : 1,
              filter: 'drop-shadow(0 0 28px rgba(249,115,22,0.20))',
            }}
            onLoad={() => {
              setModelStatus((prev) => (prev === 'ready' ? prev : 'ready'));
            }}
            onError={() => {
              setModelStatus((prev) => (prev === 'error' ? prev : 'error'));
            }}
          />

          {showFallbackSpinner && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-24 animate-spin rounded-full border-2 border-orange-400/25 border-t-orange-400" />
            </div>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-[0.18em] text-white sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 text-sm text-white/65 sm:text-base">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
