"use client";

import { useState } from "react";

export function CopyField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className={`mt-0.5 break-all text-sm ${mono ? "font-ledger" : ""}`}>{value}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-md px-2 py-1 text-xs ring-1 ring-primary/30 text-muted-foreground hover:text-primary"
      >
        {copied ? "Copiato" : "Copia"}
      </button>
    </div>
  );
}
