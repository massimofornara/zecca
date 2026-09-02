"use client";

import { useFormStatus } from "react-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  children,
  pendingLabel = "Un attimo…",
  variant = "default",
  size = "lg",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={cn(buttonVariants({ variant, size }), "px-4", className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
