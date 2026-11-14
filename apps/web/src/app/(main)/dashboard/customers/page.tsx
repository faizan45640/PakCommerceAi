import { PageHeader } from "@/components/dashboard/page-header";

import { CustomersView } from "./_components/customers-view";

interface CustomersPageProps {
  searchParams: Promise<{ phone?: string | string[] }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const { phone } = await searchParams;
  const phoneParam = Array.isArray(phone) ? phone[0] : phone;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Customers"
        description="Everyone who has ordered from you, with spend, order history, and risk tags."
      />
      <CustomersView key={phoneParam ?? ""} phone={phoneParam?.trim() || undefined} />
    </div>
  );
}
