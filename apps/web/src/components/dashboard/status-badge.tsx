import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-green-500/10 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  warning: "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  info: "bg-blue-500/10 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  neutral: "bg-muted text-muted-foreground",
};

type StatusBadgeProps = {
  label: string;
  tone?: StatusTone;
  className?: string;
};

export function StatusBadge({ label, tone = "neutral", className }: StatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", toneClasses[tone], className)}>
      {label}
    </Badge>
  );
}
