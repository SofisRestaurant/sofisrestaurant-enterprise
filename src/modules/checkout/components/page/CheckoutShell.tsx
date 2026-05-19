import type { ReactNode } from 'react';

export function CheckoutShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden bg-cream-50">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(244,196,48,0.16),transparent_38%),radial-gradient(circle_at_88%_0%,rgba(168,69,32,0.08),transparent_32%)]"
      />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:py-10 lg:px-6">{children}</div>
    </main>
  );
}
