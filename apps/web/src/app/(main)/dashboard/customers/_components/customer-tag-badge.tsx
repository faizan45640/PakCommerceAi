import type { CustomerTag } from "@pakcommerce/shared";

import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { CUSTOMER_TAG_CLASSES, CUSTOMER_TAG_DESCRIPTIONS, CUSTOMER_TAG_LABELS } from "./customer-tags";

export function CustomerTagBadge({ tag }: { tag: CustomerTag }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="secondary" className={`rounded-md px-2.5 py-1 font-medium text-[10px] ${CUSTOMER_TAG_CLASSES[tag]}`}>
          {CUSTOMER_TAG_LABELS[tag]}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{CUSTOMER_TAG_DESCRIPTIONS[tag]}</TooltipContent>
    </Tooltip>
  );
}

export function CustomerTagList({ tags }: { tags: CustomerTag[] }) {
  if (tags.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <CustomerTagBadge key={tag} tag={tag} />
      ))}
    </div>
  );
}
