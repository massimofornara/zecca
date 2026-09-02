import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ProductArt({
  imageKey,
  className,
}: {
  imageKey: string;
  className?: string;
}) {
  const Art = ART[imageKey] ?? ART.olio;
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden bg-[oklch(0.19_0.03_50)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,oklch(0.4_0.07_60_/_0.45),transparent_62%)]" />
      <Art />
    </div>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 200 200" className="relative h-full w-full text-primary">
      <circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.35" />
      {children}
    </svg>
  );
}

const ART: Record<string, () => ReactNode> = {
  olio: () => (
    <Frame>
      <path d="M92 48h16c2 10 8 18 8 30v54c0 14-7 22-16 22s-16-8-16-22V78c0-12 6-20 8-30z" fill="currentColor" opacity="0.85" />
      <rect x="94" y="40" width="12" height="10" rx="2" fill="currentColor" />
      <path d="M70 70c18-8 42 6 50 22" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    </Frame>
  ),
  miele: () => (
    <Frame>
      <path d="M70 86h60l-8 52H78z" fill="currentColor" opacity="0.88" />
      <path d="M76 86c8-22 40-22 48 0" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="100" cy="112" r="7" fill="oklch(0.2 0.03 50)" opacity="0.35" />
    </Frame>
  ),
  taccuino: () => (
    <Frame>
      <rect x="64" y="52" width="72" height="96" rx="3" fill="currentColor" opacity="0.9" />
      <rect x="70" y="58" width="60" height="84" fill="oklch(0.88 0.04 88)" />
      <path d="M78 78h44M78 92h36M78 106h40" stroke="oklch(0.45 0.05 60)" strokeWidth="1.4" />
    </Frame>
  ),
  inchiostro: () => (
    <Frame>
      <path d="M88 48h24v18l10 10v52c0 12-8 20-22 20s-22-8-22-20V76l10-10z" fill="currentColor" opacity="0.88" />
      <rect x="94" y="40" width="12" height="12" rx="6" fill="currentColor" />
      <path d="M60 150c12-18 28-10 40-22" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.55" />
    </Frame>
  ),
  candele: () => (
    <Frame>
      <rect x="70" y="88" width="18" height="52" rx="2" fill="currentColor" />
      <rect x="112" y="72" width="18" height="68" rx="2" fill="currentColor" opacity="0.8" />
      <path d="M79 72c0-10 10-16 10-24" stroke="oklch(0.78 0.14 70)" strokeWidth="2" fill="none" />
      <path d="M121 56c0-10 10-16 10-24" stroke="oklch(0.78 0.14 70)" strokeWidth="2" fill="none" />
      <ellipse cx="79" cy="70" rx="5" ry="8" fill="oklch(0.85 0.12 75)" />
      <ellipse cx="121" cy="54" rx="5" ry="8" fill="oklch(0.85 0.12 75)" />
    </Frame>
  ),
  caffe: () => (
    <Frame>
      <path d="M68 78h54c4 0 10 8 10 18v28c0 16-14 24-36 24s-38-8-38-24V96c0-10 6-18 10-18z" fill="currentColor" />
      <path d="M132 96c14 2 22 12 18 28-4 12-16 16-24 14" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M86 62c6-10 18-8 20 2M102 58c6-12 20-8 18 6" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
    </Frame>
  ),
  sciarpa: () => (
    <Frame>
      <path
        d="M58 70c20-18 48-10 62 8 10 14 8 30-6 40-18 14-8 28 10 38"
        fill="none"
        stroke="currentColor"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path d="M120 148c8 10 22 14 30 8" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" opacity="0.7" />
    </Frame>
  ),
  sapone: () => (
    <Frame>
      <ellipse cx="100" cy="108" rx="42" ry="28" fill="currentColor" opacity="0.9" />
      <ellipse cx="100" cy="98" rx="36" ry="18" fill="currentColor" />
      <circle cx="84" cy="88" r="6" fill="oklch(0.9 0.04 88)" opacity="0.35" />
    </Frame>
  ),
};
