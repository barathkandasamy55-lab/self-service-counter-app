/** Placeholder shown while a screen's data or route is loading, so the old or empty screen never flashes. */
export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}
