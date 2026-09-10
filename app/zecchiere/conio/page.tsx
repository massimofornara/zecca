import { MintForm } from "./mint-form";
import { formatCredits } from "@/lib/format";
import { treasuryBalance } from "@/lib/zecca/ledger";
import { prisma } from "@/lib/db";
import { formatRomeDate } from "@/lib/rome-day";
import { sqliteEphemeral } from "@/lib/public-url";
import { replayBookOps } from "@/lib/book-proof-store";

export const metadata = { title: "Conio" };

export default async function ConioPage() {
  await replayBookOps(prisma);
  const [treasury, mints] = await Promise.all([
    treasuryBalance(),
    prisma.ledgerEntry.findMany({
      where: { type: "MINT" },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div>
      <h1 className="font-display text-4xl text-primary">Conio</h1>
      <p className="mt-2 text-muted-foreground">
        Solo tu fai nascere i crediti. Scrivi la quantità che vuoi: entra in tesoreria, non sul
        conto in banca. Coniare non crea euro, dollari né USDC. Un prelievo USDC parte solo se il
        wallet Circle del negozio ha USDC vero su Base.
      </p>
      {sqliteEphemeral() ? (
        <p className="mt-3 rounded-md bg-ember/10 px-3 py-2 text-sm text-ember ring-1 ring-ember/30">
          Su Vercel senza Postgres il libro vive in /tmp per istanza. I conii di questa sessione
          restano in un cookie firmato e vengono riallineati al ricaricamento. Per tesoreria
          condivisa imposta <span className="font-ledger">DATABASE_URL</span> Postgres.
        </p>
      ) : null}
      <p className="mt-4 font-ledger text-ember">Tesoreria: {formatCredits(treasury)}</p>
      <div className="mt-8 max-w-lg">
        <MintForm />
      </div>
      <h2 className="mt-12 font-display text-2xl text-primary">Lotti recenti</h2>
      <ul className="mt-4 divide-y divide-primary/15 rounded-md ring-1 ring-primary/20">
        {mints.map((m) => (
          <li key={m.id} className="px-4 py-3">
            <p className="font-ledger">{formatCredits(m.amountCredits)}</p>
            <p className="text-xs text-muted-foreground">
              {formatRomeDate(m.createdAt)} — {m.note}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
