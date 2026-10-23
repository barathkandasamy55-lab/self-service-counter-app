import Link from 'next/link';

export default function NotFound() {
  return (
    <section>
      <h2>Page not found</h2>
      <Link href="/catalog">Back to the counter</Link>
    </section>
  );
}
