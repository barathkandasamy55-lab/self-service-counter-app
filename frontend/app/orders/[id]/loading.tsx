import { LoadingState } from '@/components/loading-state';

// Shown by Next while navigating to an order, until the route is ready.
export default function OrderLoading() {
  return <LoadingState message="Loading your order…" />;
}
