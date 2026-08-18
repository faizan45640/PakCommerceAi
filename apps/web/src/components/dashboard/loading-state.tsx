import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  rows?: number;
  className?: string;
  showMetrics?: boolean;
};

export function LoadingState({ rows = 4, className, showMetrics = true }: LoadingStateProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)} aria-busy="true" aria-live="polite">
      {showMetrics ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="space-y-3 rounded-xl ring-1 ring-foreground/10 p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl ring-1 ring-foreground/10 p-4">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
