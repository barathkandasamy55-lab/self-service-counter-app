import MainSection from './_components/mainsection';

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MainSection orderId={id} />;
}
