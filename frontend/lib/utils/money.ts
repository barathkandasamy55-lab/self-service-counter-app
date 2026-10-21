/** Formats whole paise as rupees using integer arithmetic only, e.g. 4550 -> "₹45.50". */
export function formatPaise(paise: number): string {
  const rupees = Math.floor(paise / 100);
  const rest = paise % 100;
  return `₹${rupees.toLocaleString('en-IN')}.${String(rest).padStart(2, '0')}`;
}
