import Link from "next/link";
import type { CustomerTimelineEvent } from "@pakcommerce/shared";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { formatTimelineEvent, type TimelineItem } from "./customer-timeline";

const DOT_CLASSES: Record<TimelineItem["tone"], string> = {
  order: "bg-primary",
  note: "bg-muted-foreground",
  risk: "bg-destructive",
};

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export function CustomerTimeline({ events }: { events: CustomerTimelineEvent[] }) {
  const items = events.map(formatTimelineEvent);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nothing has happened yet.</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l pl-4">
            {items.map((item) => (
              <li key={item.key} className="relative">
                <span
                  className={`absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background ${DOT_CLASSES[item.tone]}`}
                />
                <div className={`font-medium text-sm ${item.tone === "risk" ? "text-destructive" : ""}`}>
                  {item.href ? (
                    <Link href={item.href} className="hover:underline">
                      {item.title}
                    </Link>
                  ) : (
                    item.title
                  )}
                </div>
                <div className="text-muted-foreground text-xs">{formatDateTime(item.at)}</div>
                {item.detail ? <div className="mt-1 whitespace-pre-wrap text-sm">{item.detail}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
