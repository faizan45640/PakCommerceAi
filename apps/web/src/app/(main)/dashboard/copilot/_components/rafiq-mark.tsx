import Image from "next/image";

import { cn } from "@/lib/utils";

const sizes = {
  sm: "size-4",
  md: "size-9",
  lg: "size-14",
  xl: "size-16",
  hero: "size-20",
} as const;

/** Rafiq face — used in chat chrome, sidebar, and message avatars. */
export function RafiqMark({
  size = "md",
  className,
}: {
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-full bg-[#F3E9D8]",
        sizes[size],
        className,
      )}
      role="img"
      aria-label="Rafiq"
    >
      <Image
        src="/rafiq-face.png"
        alt=""
        fill
        sizes="80px"
        className="scale-125 object-cover object-[center_35%]"
      />
    </span>
  );
}
