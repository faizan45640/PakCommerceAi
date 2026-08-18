import { SectionPlaceholder } from "@/components/dashboard/section-placeholder";

export default function ProductsPage() {
  return (
    <SectionPlaceholder
      title="Products"
      description="Manage catalog items across connected stores from one workspace."
      metrics={[
        { label: "Catalog items", value: "—", helperText: "Synced products will appear here" },
        { label: "Variants", value: "—", helperText: "Variant coverage coming soon" },
        { label: "Unmapped SKUs", value: "—", helperText: "Needs store sync" },
      ]}
      emptyTitle="No products yet"
      emptyDescription="Connect a store and sync your catalog to start managing products here."
    />
  );
}
