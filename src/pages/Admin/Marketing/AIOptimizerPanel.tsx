// =============================================================================
// src/pages/Admin/Marketing/AIOptimizerPanel.tsx
// =============================================================================
// AI Optimizer — production-grade shell
// - No EmptyChart usage (not exported in your primitives)
// - EmptyState used with supported props only
// - Retry button is a normal button (no actionLabel/onAction prop mismatch)
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Panel, SectionHeader, EmptyState, Badge } from '@/features/admin/ui';

// If you already have a typed service, swap this out.
// For now this keeps the file compiling and “wired”.
type AIInsight = {
  id: string;
  category: string;
  title: string;
  body: string;
  confidence?: number | null;
  impactPct?: number | null;
  applied?: boolean | null;
  createdAt?: string | null;
};

type ViewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: AIInsight[] };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function toneForInsight(i: AIInsight): NonNullable<React.ComponentProps<typeof Badge>['tone']> {
  const impact = i.impactPct ?? 0;
  const confidence = i.confidence ?? 0;

  // You can tune this later — these thresholds are sane defaults.
  if (confidence >= 0.8 && impact >= 10) return 'success';
  if (confidence >= 0.6) return 'info';
  if (impact >= 10) return 'warning';
  return 'neutral';
}

const AIOptimizerPanelPage = memo(function AIOptimizerPanelPage() {
  const [state, setState] = useState<ViewState>({ status: 'idle' });
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setState({ status: 'loading' });

      // ✅ Replace this with your real call (admin-gateway, ai_insights, etc.)
      // Example later:
      // const res = await invokeFn<{ data: AIInsight[] }>('admin-gateway', { action: 'ai:insights:list' })
      // if (res.error) throw res.error
      // setState({ status: 'ready', data: res.data.data })

      // For now: empty data but successful load (keeps UI correct).
      setState({ status: 'ready', data: [] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      setState({ status: 'error', message: msg });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (state.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    if (!q) return state.data;

    return state.data.filter((i) => {
      return (
        i.title.toLowerCase().includes(q) ||
        i.body.toLowerCase().includes(q) ||
        i.category.toLowerCase().includes(q)
      );
    });
  }, [state, query]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="AI Optimizer"
        subtitle="Recommendations, experiments, and performance insights"
      />

      {/* Controls */}
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-400">Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search insights…"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={load}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700 disabled:opacity-60"
              disabled={state.status === 'loading'}
            >
              {state.status === 'loading' ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        </div>
      </Panel>

      {/* Error */}
      {state.status === 'error' && (
        <Panel>
          <EmptyState title="Couldn’t load AI insights" description={state.message} />
          <div className="mt-4">
            <button
              type="button"
              onClick={load}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
            >
              Try again
            </button>
          </div>
        </Panel>
      )}

      {/* Empty */}
      {state.status === 'ready' && filtered.length === 0 && (
        <Panel>
          <EmptyState
            title="No insights yet"
            description="When the optimizer generates insights, they’ll appear here."
          />
        </Panel>
      )}

      {/* List */}
      {state.status === 'ready' && filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((i) => (
            <Panel key={i.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge tone={toneForInsight(i)}>{i.category}</Badge>
                    {typeof i.confidence === 'number' && (
                      <span className="text-xs text-zinc-400">
                        Confidence {Math.round(clamp(i.confidence, 0, 1) * 100)}%
                      </span>
                    )}
                    {typeof i.impactPct === 'number' && (
                      <span className="text-xs text-zinc-400">
                        Impact {Math.round(i.impactPct)}%
                      </span>
                    )}
                  </div>

                  <h3 className="truncate text-sm font-semibold text-zinc-100">{i.title}</h3>
                  <p className="mt-2 line-clamp-4 text-sm text-zinc-300">{i.body}</p>
                </div>

                <div className="shrink-0">
                  <Badge tone={i.applied ? 'success' : 'neutral'}>
                    {i.applied ? 'Applied' : 'New'}
                  </Badge>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
});

export default AIOptimizerPanelPage;
