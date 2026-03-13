import {
  getAdminMarketingSnapshot,
  getAdminMarketingSummary,
} from './adminMarketing.api';
import { getAdminMenuSnapshot, getAdminMenuSummary } from './adminMenu.api';
import { getAdminOrderCountsSummary } from './adminOrders.api';
import {
  callAdminGateway,
  formatAdminGatewayError,
} from '@/features/admin/api/adminGateway.client';
import type {
  AdminDashboardLayout,
  AdminDashboardLayoutSection,
  AdminDashboardSnapshot,
  AdminMetric,
  AdminModuleKey,
} from '../types/admin-common.types';

type UnknownRecord = Record<string, unknown>;

interface DashboardMetricNumbers {
  totalRevenue: number;
  totalOrders: number;
  todayRevenue: number;
  todayOrders: number;
  averageOrderValue: number;
  pendingOrders: number;
  readyOrders: number;
  activeCampaigns: number;
  promos: number;
  menuItems: number;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampInt(value: number | null, min: number, max: number, fallback: number): number {
  if (value === null) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `admin_dashboard_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function normalizeModule(value: unknown): AdminModuleKey {
  const next = asString(value)?.toLowerCase();

  switch (next) {
    case 'orders':
    case 'menu':
    case 'marketing':
    case 'customers':
    case 'settings':
      return next;
    case 'dashboard':
    default:
      return 'dashboard';
  }
}

function parseLayoutSection(
  value: unknown,
  fallbackOrder: number,
): AdminDashboardLayoutSection | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id) ?? `section_${fallbackOrder}`;
  const title = asString(value.title) ?? asString(value.label);

  if (!title) {
    return null;
  }

  return {
    id,
    title,
    description: asString(value.description),
    module: normalizeModule(value.module),
    order: clampInt(asNumber(value.order), -10_000, 10_000, fallbackOrder),
    enabled: asBoolean(value.enabled, true),
    metadata:
      isRecord(value.metadata) ? value.metadata : isRecord(value.meta) ? value.meta : {},
  };
}

function parseLayout(raw: unknown, requestId: string): AdminDashboardLayout {
  const record = isRecord(raw) ? raw : {};
  const sectionsRaw = Array.isArray(record.sections)
    ? record.sections
    : Array.isArray(record.layout)
      ? record.layout
      : [];

  const sections = sectionsRaw
    .map((entry, index) => parseLayoutSection(entry, index))
    .filter((entry): entry is AdminDashboardLayoutSection => entry !== null)
    .sort((left, right) => left.order - right.order);

  if (sections.length > 0) {
    return {
      sections,
      asOf: asString(record.asOf) ?? nowIso(),
      requestId: asString(record.requestId) ?? requestId,
    };
  }

  return {
    sections: [
      {
        id: 'dashboard-overview',
        title: 'Overview',
        description: 'Operational summary and key revenue metrics.',
        module: 'dashboard',
        order: 0,
        enabled: true,
        metadata: {},
      },
      {
        id: 'orders',
        title: 'Orders',
        description: 'Live order queues and fulfillment velocity.',
        module: 'orders',
        order: 1,
        enabled: true,
        metadata: {},
      },
      {
        id: 'menu',
        title: 'Menu',
        description: 'Catalog health, availability, and item coverage.',
        module: 'menu',
        order: 2,
        enabled: true,
        metadata: {},
      },
      {
        id: 'marketing',
        title: 'Marketing',
        description: 'Campaign and promo performance overview.',
        module: 'marketing',
        order: 3,
        enabled: true,
        metadata: {},
      },
    ],
    asOf: nowIso(),
    requestId,
  };
}

function parseMetricNumbers(value: unknown): DashboardMetricNumbers | null {
  if (!isRecord(value)) {
    return null;
  }

  const record = isRecord(value.metrics) ? value.metrics : value;

  const totalRevenue = asNumber(record.totalRevenue) ?? asNumber(record.revenue_total);
  const totalOrders = asNumber(record.totalOrders) ?? asNumber(record.orders_total);
  const todayRevenue = asNumber(record.todayRevenue) ?? asNumber(record.revenue_today);
  const todayOrders = asNumber(record.todayOrders) ?? asNumber(record.orders_today);
  const averageOrderValue =
    asNumber(record.averageOrderValue) ?? asNumber(record.average_order_value);

  if (
    totalRevenue === null ||
    totalOrders === null ||
    todayRevenue === null ||
    todayOrders === null ||
    averageOrderValue === null
  ) {
    return null;
  }

  return {
    totalRevenue,
    totalOrders,
    todayRevenue,
    todayOrders,
    averageOrderValue,
    pendingOrders: asNumber(record.pendingOrders) ?? asNumber(record.pending_orders) ?? 0,
    readyOrders: asNumber(record.readyOrders) ?? asNumber(record.ready_orders) ?? 0,
    activeCampaigns:
      asNumber(record.activeCampaigns) ?? asNumber(record.active_campaigns) ?? 0,
    promos: asNumber(record.promos) ?? asNumber(record.promo_count) ?? 0,
    menuItems: asNumber(record.menuItems) ?? asNumber(record.menu_items) ?? 0,
  };
}

function createMetricCards(numbers: DashboardMetricNumbers): AdminMetric[] {
  return [
    {
      key: 'totalRevenue',
      label: 'Total Revenue',
      value: numbers.totalRevenue,
      tone: 'warning',
      description: 'Paid revenue to date.',
    },
    {
      key: 'totalOrders',
      label: 'Total Orders',
      value: numbers.totalOrders,
      tone: 'info',
      description: 'Paid and recorded order volume.',
    },
    {
      key: 'todayRevenue',
      label: 'Today Revenue',
      value: numbers.todayRevenue,
      tone: 'success',
      description: 'Paid revenue since local midnight.',
    },
    {
      key: 'todayOrders',
      label: 'Today Orders',
      value: numbers.todayOrders,
      tone: 'neutral',
      description: 'Order volume since local midnight.',
    },
    {
      key: 'averageOrderValue',
      label: 'Average Order Value',
      value: numbers.averageOrderValue,
      tone: 'info',
      description: 'Average paid order total.',
    },
    {
      key: 'pendingOrders',
      label: 'Pending Orders',
      value: numbers.pendingOrders,
      tone: numbers.pendingOrders > 0 ? 'warning' : 'neutral',
      description: 'Orders awaiting kitchen progression.',
    },
    {
      key: 'readyOrders',
      label: 'Ready Orders',
      value: numbers.readyOrders,
      tone: numbers.readyOrders > 0 ? 'success' : 'neutral',
      description: 'Orders ready for pickup or delivery handoff.',
    },
    {
      key: 'activeCampaigns',
      label: 'Active Campaigns',
      value: numbers.activeCampaigns,
      tone: 'info',
      description: 'Currently running marketing campaigns.',
    },
    {
      key: 'promos',
      label: 'Promos',
      value: numbers.promos,
      tone: 'neutral',
      description: 'Promo codes configured in the admin surface.',
    },
    {
      key: 'menuItems',
      label: 'Menu Items',
      value: numbers.menuItems,
      tone: 'neutral',
      description: 'Items available in the menu catalog snapshot.',
    },
  ];
}

async function getFallbackDashboardMetrics(): Promise<AdminMetric[]> {
  const [orderSummary, menuSummary, marketingSummary] = await Promise.all([
    getAdminOrderCountsSummary(),
    getAdminMenuSummary(),
    getAdminMarketingSummary(),
  ]);

  return createMetricCards({
    totalRevenue: 0,
    totalOrders: orderSummary.total,
    todayRevenue: 0,
    todayOrders: 0,
    averageOrderValue: 0,
    pendingOrders: orderSummary.pending,
    readyOrders: orderSummary.ready,
    activeCampaigns: marketingSummary.activeCampaignCount,
    promos: marketingSummary.promoCount,
    menuItems: menuSummary.itemCount,
  });
}

export async function getAdminDashboardLayout(): Promise<AdminDashboardLayout> {
  const requestId = createRequestId();

  try {
    const raw = await callAdminGateway('layout', { requestId });
    return parseLayout(raw, requestId);
  } catch {
    return parseLayout(null, requestId);
  }
}

export async function getAdminDashboardMetrics(): Promise<AdminMetric[]> {
  try {
    const raw = await callAdminGateway('metrics');
    const parsed = parseMetricNumbers(raw);

    if (parsed !== null) {
      return createMetricCards(parsed);
    }
  } catch {
    // Fallback below.
  }

  return getFallbackDashboardMetrics();
}

export async function getAdminDashboardSnapshot(): Promise<AdminDashboardSnapshot> {
  const requestId = createRequestId();

  const [layout, metrics, orderSummary, menuSummary, marketingSummary] = await Promise.all([
    getAdminDashboardLayout(),
    getAdminDashboardMetrics(),
    getAdminOrderCountsSummary(),
    getAdminMenuSummary(),
    getAdminMarketingSummary(),
  ]);

  const mergedMetrics = [...metrics];

  const pendingMetricIndex = mergedMetrics.findIndex((metric) => metric.key === 'pendingOrders');
  if (pendingMetricIndex >= 0) {
    mergedMetrics[pendingMetricIndex] = {
      ...mergedMetrics[pendingMetricIndex],
      value: orderSummary.pending,
      tone: orderSummary.pending > 0 ? 'warning' : 'neutral',
    };
  }

  const readyMetricIndex = mergedMetrics.findIndex((metric) => metric.key === 'readyOrders');
  if (readyMetricIndex >= 0) {
    mergedMetrics[readyMetricIndex] = {
      ...mergedMetrics[readyMetricIndex],
      value: orderSummary.ready,
      tone: orderSummary.ready > 0 ? 'success' : 'neutral',
    };
  }

  const campaignMetricIndex = mergedMetrics.findIndex(
    (metric) => metric.key === 'activeCampaigns',
  );
  if (campaignMetricIndex >= 0) {
    mergedMetrics[campaignMetricIndex] = {
      ...mergedMetrics[campaignMetricIndex],
      value: marketingSummary.activeCampaignCount,
    };
  }

  const promoMetricIndex = mergedMetrics.findIndex((metric) => metric.key === 'promos');
  if (promoMetricIndex >= 0) {
    mergedMetrics[promoMetricIndex] = {
      ...mergedMetrics[promoMetricIndex],
      value: marketingSummary.promoCount,
    };
  }

  const menuMetricIndex = mergedMetrics.findIndex((metric) => metric.key === 'menuItems');
  if (menuMetricIndex >= 0) {
    mergedMetrics[menuMetricIndex] = {
      ...mergedMetrics[menuMetricIndex],
      value: menuSummary.itemCount,
    };
  }

  return {
    metrics: mergedMetrics,
    layout,
    orders: {
      total: orderSummary.total,
      pending: orderSummary.pending,
      preparing: orderSummary.preparing,
      ready: orderSummary.ready,
    },
    menu: {
      categoryCount: menuSummary.categoryCount,
      itemCount: menuSummary.itemCount,
      activeItemCount: menuSummary.activeItemCount,
    },
    marketing: {
      campaignCount: marketingSummary.campaignCount,
      activeCampaignCount: marketingSummary.activeCampaignCount,
      promoCount: marketingSummary.promoCount,
    },
    asOf: nowIso(),
    requestId,
  };
}

export async function getAdminDashboardWarmSnapshot(): Promise<{
  snapshot: AdminDashboardSnapshot;
  marketing: Awaited<ReturnType<typeof getAdminMarketingSnapshot>>;
  menu: Awaited<ReturnType<typeof getAdminMenuSnapshot>>;
}> {
  const [snapshot, marketing, menu] = await Promise.all([
    getAdminDashboardSnapshot(),
    getAdminMarketingSnapshot(),
    getAdminMenuSnapshot(),
  ]);

  return {
    snapshot,
    marketing,
    menu,
  };
}

export function formatAdminDashboardError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return formatAdminGatewayError(error);
}