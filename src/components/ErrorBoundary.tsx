import React, { Component, ReactNode } from 'react';

import { recoverFromChunkLoadError } from '@/lib/runtime/chunkLoadRecovery';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const recovered = recoverFromChunkLoadError(error);

    if (recovered) {
      return;
    }

    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message ?? 'Unknown error';

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 text-center">
          <div className="w-full max-w-lg rounded-3xl border border-red-100 bg-white p-6 shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-xl">
              !
            </div>

            <h1 className="mt-4 text-xl font-black tracking-tight text-gray-950">
              Something went wrong
            </h1>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Please refresh the page. If the issue continues, contact support.
            </p>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-xl bg-gray-950 px-4 py-2.5 text-sm font-black text-white transition hover:bg-black active:scale-95"
              >
                Refresh page
              </button>

              <a
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-black text-gray-700 transition hover:bg-gray-50 active:scale-95"
              >
                Return home
              </a>
            </div>

            {this.state.error ? (
              <details className="mt-5 rounded-2xl border border-gray-100 bg-gray-50 text-left">
                <summary className="cursor-pointer px-4 py-3 text-xs font-bold text-gray-500">
                  Error details
                </summary>

                <pre className="max-h-52 overflow-auto border-t border-gray-100 p-4 text-xs leading-5 text-gray-500">
                  {errorMessage}
                </pre>
              </details>
            ) : null}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}