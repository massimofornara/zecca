import Link from "next/link";
import { cn } from "@/lib/utils";

export function Wordmark({
  className,
  href = "/",
  size = "md",
}: {
  className?: string;
  href?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-5xl md:text-7xl",
  };

  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2", className)}>
      <Seal className={size === "lg" ? "size-12 md:size-16" : size === "sm" ? "size-7" : "size-8"} />
      <span
        className={cn(
          "font-mark tracking-[0.18em] text-primary uppercase leading-none",
          sizes[size],
        )}
      >
        Zecca
      </span>
    </Link>
  );
}

export function Seal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("text-primary", className)}
      aria-hidden
    >
      <circle cx="32" cy="32" r="30" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.6" />
      <path
        d="M32 14 L36 26 H48 L38 34 L42 46 L32 39 L22 46 L26 34 L16 26 H28 Z"
        fill="currentColor"
        opacity="0.92"
      />
    </svg>
  );
}
