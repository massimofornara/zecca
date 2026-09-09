import { PageShell } from "@/components/layout/SiteChrome";
import { CopyField } from "@/components/copy/CopyField";
import { AddGaslessNetwork } from "@/components/catena/AddGaslessNetwork";
import { gaslessStatus } from "@/lib/zecca/gasless-chain";

export const metadata = { title: "Catena Zecca Gasless" };
export const dynamic = "force-dynamic";

export default async function CatenaPage() {
  const status = await gaslessStatus();

  return (
    <PageShell>
      <p className="text-xs uppercase tracking-[0.28em] text-primary/80">Chain ID {status.chainId}</p>
      <h1 className="mt-1 font-display text-4xl text-primary">Zecca Gasless</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">
        Catena EVM del negozio: <span className="font-ledger">gasPrice = 0</span>. Le transazioni di
        mint zUSD vanno a buon fine senza pagare ether. <strong>Non è Ethereum mainnet</strong>,
        gli hash non esistono su Etherscan, zUSD non è Tether.
      </p>

      <section className="metal-frame mt-8 rounded-md bg-card p-5">
        <p className="font-ledger text-xs uppercase tracking-wider text-ember">
          {status.ready ? "READY" : "OFF"} · gas {status.gasPriceWei} wei
        </p>
        <div className="mt-4 space-y-3">
          <CopyField label="RPC MetaMask" value={status.rpc} mono />
          <CopyField label="Chain ID" value={String(status.chainId)} mono />
          {status.token ? <CopyField label="Contratto zUSD" value={status.token} mono /> : null}
          {status.minter ? <CopyField label="Minter secp256k1" value={status.minter} mono /> : null}
        </div>
        <div className="mt-4">
          <AddGaslessNetwork params={status.metamask} />
        </div>
        <p className="mt-4 text-xs text-muted-foreground">{status.note}</p>
      </section>
    </PageShell>
  );
}
