import { LoadingState } from '@/components/loading-state';

// Shown by Next while navigating to /catalog, until the route is ready.
export default function CatalogLoading() {
  return <LoadingState message="Loading snacks…" />;
}
