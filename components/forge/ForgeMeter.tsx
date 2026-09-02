import { formatCredits } from "@/lib/format";
import { formatRomeDay } from "@/lib/rome-day";
import type { ForgeState } from "@/lib/zecca/forge";
import { cn } from "@/lib/utils";

export function ForgeMeter({ forge }: { forge: ForgeState }) {
  const heat = Math.min(100, (forge.spentToday / 300) * 100);
  const marks = [
    { at: 50, label: "20%" },
    { at: 150, label: "40%" },
    { at: 300, label: "70%" },
  ];

  return (
    <section className="metal-frame relative overflow-hidden rounded-md bg-card/80 p-5 md:p-7">
      <div
        className="forge-heat pointer-events-none absolute -bottom-16 left-1/2 h-48 w-64 -translate-x-1/2 rounded-full blur-3xl"
        style={{
          background: `oklch(0.65 0.18 48 / ${0.12 + heat / 180})`,
        }}
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end">
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.28em] text-primary/80">La Forgia del Giorno</p>
          <h2 className="mt-1 font-display text-3xl text-primary md:text-4xl">
            {forge.isAdmin ? "Zecchiere: fusione libera" : heatLabel(forge.percent)}
          </h2>
          <p className="mt-2 max-w-xl text-muted-foreground">
            {formatRomeDay(new Date())}. Oggi hai speso{" "}
            <span className="font-ledger text-foreground">{formatCredits(forge.spentToday)}</span> in
            bottega.
            {forge.isAdmin
              ? " Il zecchiere non è soggetto alla forgia."
              : forge.next
                ? ` Ancora ${formatCredits(forge.next.minSpent - forge.spentToday)} per il ${forge.next.percent}%.`
                : " Hai raggiunto il calore massimo di oggi."}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Portafoglio" value={formatCredits(forge.available)} />
            <Stat label="Forgiato" value={formatCredits(forge.forged)} accent />
            <Stat label="Calore" value={`${forge.percent}%`} />
            <Stat label="In fusione" value={formatCredits(forge.escrow)} />
          </dl>
        </div>
        <div className="w-full md:w-72">
          <div className="relative h-8 overflow-hidden rounded-sm bg-black/40 ring-1 ring-primary/30">
            <div
              className="absolute inset-y-0 left-0 forge-heat"
              style={{
                width: `${Math.max(4, heat)}%`,
                background:
                  "linear-gradient(90deg, oklch(0.35 0.05 50), oklch(0.62 0.14 55), oklch(0.82 0.16 75))",
              }}
            />
            {marks.map((m) => (
              <span
                key={m.at}
                className="absolute top-0 h-full w-px bg-paper/40"
                style={{ left: `${(m.at / 300) * 100}%` }}
                title={`${m.at} cr → ${m.label}`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between font-ledger text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>0</span>
            <span>50</span>
            <span>150</span>
            <span>300+</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</dt>
      <dd className={cn("font-ledger text-lg", accent && "text-ember")}>{value}</dd>
    </div>
  );
}

function heatLabel(percent: number) {
  if (percent <= 0) return "Ferro freddo";
  if (percent < 40) return "Bracia viva";
  if (percent < 70) return "Metallo caldo";
  return "Forgia bianca";
}
