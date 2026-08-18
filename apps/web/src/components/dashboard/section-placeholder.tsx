import type { ReactNode } from "react";

import { EmptyState } from "./empty-state";
import { MetricCard } from "./metric-card";
import { PageHeader } from "./page-header";
import { StatusBadge, type StatusTone } from "./status-badge";

type PlaceholderMetric = {
  label: string;
  value: string;
  helperText?: string;
};

type SectionPlaceholderProps = {
  title: string;
  description: string;
  metrics?: PlaceholderMetric[];
  emptyTitle: string;
  emptyDescription: string;
  statusLabel?: string;
  statusTone?: StatusTone;
  actions?: ReactNode;
};

export function SectionPlaceholder({
  title,
  description,
  metrics = [
    { label: "Total", value: "—", helperText: "Connected data coming soon" },
    { label: "Active", value: "—", helperText: "Waiting for API wiring" },
    { label: "Needs attention", value: "—", helperText: "No live signals yet" },
  ],
  emptyTitle,
  emptyDescription,
  statusLabel = "Placeholder",
  statusTone = "info",
  actions,
}: SectionPlaceholderProps) {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description={description}
        actions={
          actions ?? (
            <StatusBadge label={statusLabel} tone={statusTone} />
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            helperText={metric.helperText}
          />
        ))}
      </div>

      <EmptyState title={emptyTitle} description={emptyDescription} />
    </div>
  );
}
