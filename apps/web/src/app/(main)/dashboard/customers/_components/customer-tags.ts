import type { CustomerTag } from "@pakcommerce/shared";

export const CUSTOMER_TAG_LABELS: Record<CustomerTag, string> = {
  first_time: "First-time",
  repeat: "Repeat",
  has_returns: "Has returns",
  flagged: "Flagged",
};

export const CUSTOMER_TAG_DESCRIPTIONS: Record<CustomerTag, string> = {
  first_time: "No completed order yet",
  repeat: "2+ completed orders",
  has_returns: "Has a returned order",
  flagged: "Has a risk note",
};

export const CUSTOMER_TAG_CLASSES: Record<CustomerTag, string> = {
  first_time: "bg-blue-500/10 border-blue-600/50 text-blue-700 dark:text-blue-300",
  repeat: "bg-green-500/10 border-green-600/50 text-green-700 dark:text-green-300",
  has_returns: "bg-orange-500/10 border-orange-600/50 text-orange-700 dark:text-orange-300",
  flagged: "bg-destructive/10 border-destructive/50 text-destructive",
};
