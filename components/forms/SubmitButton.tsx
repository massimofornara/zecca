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
  formNoValidate,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
  className?: string;
  disabled?: boolean;
  formNoValidate?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      formNoValidate={formNoValidate}
      disabled={pending || disabled}
      className={cn(buttonVariants({ variant, size }), "relative z-30 cursor-pointer px-4", className)}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
