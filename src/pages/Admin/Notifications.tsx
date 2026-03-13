// =============================================================================
// src/pages/Admin/Notifications.tsx
// =============================================================================
// Admin Notifications Center
// - View recent notifications
// - See channels used (Email / SMS / Push)
// - Simple filter by category
// =============================================================================

import { useState } from 'react';
import { Panel, Badge, EmptyState } from '@/features/admin/ui/AdminPrimitives';

type NotificationCategory = 'system' | 'orders' | 'marketing';
type NotificationChannel = 'email' | 'sms' | 'push';

interface NotificationItem {
  id: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  title: string;
  preview: string;
  createdAt: string;
  unread: boolean;
  important?: boolean;
}

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  system: 'System',
  orders: 'Orders',
  marketing: 'Marketing',
};

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: 'Email',
  sms: 'SMS',
  push: 'Push',
};

const CHANNEL_TONE: Record<NotificationChannel, 'info' | 'success' | 'warning'> = {
  email: 'info',
  sms: 'success',
  push: 'warning',
};

// Seed data – replace later with real API data if you want
const MOCK_NOTIFICATIONS: NotificationItem[] = [
  {
    id: '1',
    category: 'system',
    channel: 'email',
    title: 'Daily dashboard export is ready',
    preview: 'Your daily performance export has been generated successfully.',
    createdAt: '2 min ago',
    unread: true,
  },
  {
    id: '2',
    category: 'orders',
    channel: 'push',
    title: 'High volume of new orders',
    preview: 'You’ve received 17 new orders in the last 30 minutes.',
    createdAt: '18 min ago',
    unread: true,
    important: true,
  },
  {
    id: '3',
    category: 'marketing',
    channel: 'sms',
    title: 'Campaign “Taco Tuesday” sent',
    preview: '1,284 customers targeted · est. open rate 23–29%.',
    createdAt: '1 hr ago',
    unread: false,
  },
  {
    id: '4',
    category: 'system',
    channel: 'email',
    title: 'Payment provider healthy',
    preview: 'All payment gateways are reporting normal latency.',
    createdAt: '3 hr ago',
    unread: false,
  },
];

export default function Notifications() {
  const [filter, setFilter] = useState<'all' | NotificationCategory>('all');

  const filtered = MOCK_NOTIFICATIONS.filter((n) =>
    filter === 'all' ? true : n.category === filter,
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-zinc-600">
            <span className="inline-block h-px w-6 bg-amber-500/60" />
            Notification Center
          </p>
          <h1 className="text-2xl font-black tracking-tight text-white">Alerts & Messages</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review system alerts, order updates, and marketing sends in one place.
          </p>
        </div>

        {/* Filter pills */}
        <div className="inline-flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-950/60 p-1 text-[11px]">
          {(
            [
              ['all', 'All'],
              ['system', 'System'],
              ['orders', 'Orders'],
              ['marketing', 'Marketing'],
            ] as const
          ).map(([value, label]) => {
            const active = filter === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={[
                  'rounded-full px-3 py-1 font-medium transition-colors',
                  active ? 'bg-amber-500 text-black' : 'text-zinc-400 hover:bg-zinc-900',
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Main list */}
        <Panel
          className="lg:col-span-2"
          title="Recent notifications"
          subtitle="Newest events first · data shown for the last 24 hours"
        >
          {filtered.length === 0 ? (
            <EmptyState
              title="No notifications for this filter"
              description="Try switching categories or come back once the system has more activity."
              icon="🔕"
            />
          ) : (
            <ul className="divide-y divide-zinc-800">
              {filtered.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start gap-3 py-3 ${n.unread ? 'bg-zinc-950/60' : ''}`}
                >
                  {/* Unread dot */}
                  <span
                    className={[
                      'mt-1 h-2 w-2 rounded-full',
                      n.unread ? 'bg-amber-400' : 'bg-zinc-700',
                    ].join(' ')}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-zinc-100">{n.title}</p>
                        {n.important && <Badge tone="danger">Priority</Badge>}
                      </div>
                      <span className="shrink-0 text-[11px] font-mono text-zinc-600">
                        {n.createdAt}
                      </span>
                    </div>

                    <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{n.preview}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
                      <Badge tone="neutral">{CATEGORY_LABEL[n.category]}</Badge>
                      <Badge tone={CHANNEL_TONE[n.channel]}>{CHANNEL_LABEL[n.channel]}</Badge>
                      {n.unread && (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-amber-400">
                          Unread
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* Side panels */}
        <div className="space-y-4">
          <Panel title="Default channels" subtitle="How the system sends automatic alerts">
            <dl className="space-y-3 text-xs text-zinc-300">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-400">System health</dt>
                <dd className="flex items-center gap-2">
                  <Badge tone="info">Email</Badge>
                  <span className="text-[10px] text-zinc-600">Owner / Admins</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-400">Order events</dt>
                <dd className="flex items-center gap-2">
                  <Badge tone="success">Push</Badge>
                  <span className="text-[10px] text-zinc-600">Kitchen screen, FOH</span>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-zinc-400">Marketing sends</dt>
                <dd className="flex items-center gap-2">
                  <Badge tone="warning">Email + SMS</Badge>
                  <span className="text-[10px] text-zinc-600">Marketing owner</span>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[11px] text-zinc-500">
              Channel routing will be configurable from this screen once the notifications API is
              wired up.
            </p>
          </Panel>

          <Panel title="Preview" subtitle="Example of a customer-facing notification">
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-4 text-xs">
              <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-amber-400">
                SMS · Customer
              </p>
              <p className="mt-2 text-[13px] font-semibold text-zinc-50">
                Sofi&apos;s Restaurant · Order Ready
              </p>
              <p className="mt-1 text-[12px] text-zinc-300">
                Your order #{'{{order_number}}'} is ready for pickup at Sofi&apos;s Restaurant. Show
                this message at the counter. Gracias!
              </p>
              <p className="mt-3 text-[10px] text-zinc-600">Reply STOP to unsubscribe.</p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
