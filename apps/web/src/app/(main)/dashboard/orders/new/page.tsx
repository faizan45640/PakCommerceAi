import { PageHeader } from "@/components/dashboard/page-header";

import { OrderFormView } from "./_components/order-form-view";

export default function NewOrderPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New order"
        description="Create a draft order by hand. Stock is not touched until you confirm it."
      />
      <OrderFormView />
    </div>
  );
}
