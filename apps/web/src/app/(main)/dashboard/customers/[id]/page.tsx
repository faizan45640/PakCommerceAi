import { CustomerProfileView } from "./_components/customer-profile-view";

interface CustomerProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerProfilePage({ params }: CustomerProfilePageProps) {
  const { id } = await params;
  return <CustomerProfileView id={id} />;
}
