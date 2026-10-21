'use client';

export function QuantityStepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (delta: number) => void;
}) {
  return (
    <span className="qty">
      <button aria-label={`Remove one ${label}`} onClick={() => onChange(-1)} disabled={value === 0}>
        −
      </button>
      <span>{value}</span>
      <button aria-label={`Add one ${label}`} onClick={() => onChange(1)} disabled={value >= max}>
        +
      </button>
    </span>
  );
}
