"use client";

import { Button } from "@/components/ui/button";

export function PrintButton({ children }: { children: string }) {
  return (
    <Button type="button" variant="outline" className="no-print" onClick={() => window.print()}>
      {children}
    </Button>
  );
}
