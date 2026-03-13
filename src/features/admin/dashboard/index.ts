// src/features/admin/dashboard/index.ts
// Barrel export for clean imports

export { AdminRevenuePanel } from './AdminRevenuePanel';
export { ROIChart } from './ROIChart';
export { RevenueByChannelCard } from './RevenueByChannelCard';

// Re-export primitives for convenience
export {
  StatCard,
  Panel,
  Badge,
  ProgressBar,
  EmptyState,
  LoadingSpinner,
  MetricGrid,
  Alert,
  Table,
} from '../ui/AdminPrimitives';
