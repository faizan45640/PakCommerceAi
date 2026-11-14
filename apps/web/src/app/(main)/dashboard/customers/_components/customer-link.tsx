import Link from "next/link";

import { cn } from "@/lib/utils";

import { customerProfileHref } from "./customer-links";

/** A link to a customer's profile; children are usually the customer's name. */
export function CustomerLink({
  customerId,
  className,
  children,
}: {
  customerId: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={customerProfileHref({ customerId })} className={cn("hover:underline", className)}>
      {children}
    </Link>
  );
}
