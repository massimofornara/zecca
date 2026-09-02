"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

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
    <Button type="submit" disabled={pending || disabled} variant={variant} size={size} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
