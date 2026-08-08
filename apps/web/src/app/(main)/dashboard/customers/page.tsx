import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function CustomersPage() {
  return (
    <SectionPlaceholder
      title="Customers"
      description="Buyer profiles with order history and conversation context."
      metrics={[
        { label: "Customers", value: "—", helperText: "Unified customer records" },
        { label: "Repeat buyers", value: "—", helperText: "Loyalty signals later" },
        { label: "Open threads", value: "—", helperText: "Linked conversations" },
      ]}
      emptyTitle="No customers yet"
      emptyDescription="Customer profiles will build as orders and chats sync into the workspace."
    />
  );
}
