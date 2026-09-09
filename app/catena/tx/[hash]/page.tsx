import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/SiteChrome";
import { CopyField } from "@/components/copy/CopyField";
import { gaslessTxView } from "@/lib/zecca/gasless-chain";

export const metadata = { title: "Transazione Zecca Gasless" };
export const dynamic = "force-dynamic";

export default async function CatenaTxPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  const view = await gaslessTxView(hash);
  if (!view) notFound();

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">
        Zecca Gasless · chain {view.chainId} · non Etherscan
      </p>
      <h1 className="mt-1 font-display text-4xl text-primary">Transazione on-chain</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Ricevuta reale sulla catena del negozio. Gas pagato: {view.gasPriceWei} wei. Stato:{" "}
        {view.status === "success" ? "successo" : view.status}.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <p className="font-ledger text-xs uppercase tracking-wider text-ember">
          {view.status === "success" ? "ON-CHAIN SUCCESS" : view.status.toUpperCase()} · gasPrice {view.gasPriceWei}
        </p>
        <div className="mt-4 space-y-3">
          <CopyField label="Hash" value={view.hash} mono />
          {view.from ? <CopyField label="From (minter)" value={view.from} mono /> : null}
          {view.to ? <CopyField label="To (contratto)" value={view.to} mono /> : null}
          {view.token ? <CopyField label="Token zUSD" value={view.token} mono /> : null}
          {view.blockNumber ? <CopyField label="Blocco" value={view.blockNumber} mono /> : null}
          {view.gasUsed ? <CopyField label="Gas used" value={view.gasUsed} mono /> : null}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Questo hash non compare su etherscan.io. Explorer:{" "}
          <Link href="/catena" className="text-ember underline-offset-2 hover:underline">
            /catena
          </Link>
          .
        </p>
      </section>
    </PageShell>
  );
}
