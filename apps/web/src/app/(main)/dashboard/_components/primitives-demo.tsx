"use client";

import { useState } from "react";

import { EmptyState } from "@/components/dashboard/empty-state";
import { LoadingState } from "@/components/dashboard/loading-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { Button } from "@/components/ui/button";

export function PrimitivesDemo() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="UI primitives"
        description="Shared building blocks for dashboard pages across the team."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setLoading((value) => !value)}>
            {loading ? "Show empty state" : "Show loading state"}
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <StatusBadge label="success" tone="success" />
        <StatusBadge label="warning" tone="warning" />
        <StatusBadge label="danger" tone="danger" />
        <StatusBadge label="info" tone="info" />
        <StatusBadge label="neutral" tone="neutral" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard label="Metric card" value="128" helperText="Reusable KPI block" trend={{ value: "4.2%", direction: "up" }} />
        <MetricCard label="Pending" value="12" helperText="Needs seller review" trend={{ value: "1.1%", direction: "down" }} />
        <MetricCard label="Synced stores" value="3" helperText="Integration health" />
      </div>

      {loading ? (
        <LoadingState rows={5} />
      ) : (
        <EmptyState
          title="Empty state ready"
          description="Use this when a section has no data yet, with an optional action."
          action={
            <Button type="button" size="sm">
              Primary action
            </Button>
          }
        />
      )}
    </div>
  );
}
