import type { ReactNode } from "react";
import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/actions/auth";
import { Wordmark } from "@/components/brand/Wordmark";
import { Button, buttonVariants } from "@/components/ui/button";
import { cartCount, getCart } from "@/lib/cart";
import { userWallet } from "@/lib/zecca/ledger";

const LINKS = [
  { href: "/vetrina", label: "Vetrina" },
  { href: "/crediti", label: "Crediti" },
  { href: "/fusione", label: "Prelievo" },
  { href: "/portafoglio", label: "Forgia" },
];

export async function SiteHeader() {
  const session = await auth();
  const cart = await getCart();
  const count = cartCount(cart);
  const wallet = session?.user ? await userWallet(session.user.id) : null;

  return (
    <header className="sticky top-0 z-40 border-b border-primary/20 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Wordmark size="sm" />
        <nav className="hidden items-center gap-6 text-sm md:flex">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="text-muted-foreground hover:text-primary">
              {l.label}
            </Link>
          ))}
          {session?.user?.role === "ADMIN" && (
            <Link href="/zecchiere" className="text-ember hover:text-primary">
              Zecchiere
            </Link>
          )}
        </nav>
        <div className="flex items-center gap-2">
          {wallet && (
            <span className="hidden font-ledger text-xs text-primary sm:inline">
              {wallet.available.toLocaleString("it-IT")} cr
            </span>
          )}
          <Link
            href="/carrello"
            className="relative rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-primary"
          >
            Cesta
            {count > 0 && (
              <span className="ml-1 font-ledger text-ember">{count}</span>
            )}
          </Link>
          {session?.user ? (
            <div className="flex items-center gap-2">
              <Link href="/ordini" className="hidden text-sm text-muted-foreground hover:text-primary sm:inline">
                {session.user.name.split(" ")[0]}
              </Link>
              <form action={logoutAction}>
                <Button variant="ghost" size="sm" type="submit">
                  Esci
                </Button>
              </form>
            </div>
          ) : (
            <Link href="/accedi" className={buttonVariants({ size: "sm" })}>
              Entra
            </Link>
          )}
        </div>
      </div>
      <nav className="mx-auto flex max-w-6xl gap-4 overflow-x-auto px-4 pb-3 text-sm md:hidden">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap text-muted-foreground">
            {l.label}
          </Link>
        ))}
        {session?.user?.role === "ADMIN" && (
          <Link href="/zecchiere" className="whitespace-nowrap text-ember">
            Zecchiere
          </Link>
        )}
        <Link href="/ordini" className="whitespace-nowrap text-muted-foreground">
          Ordini
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-primary/15 px-4 py-10 text-center text-sm text-muted-foreground">
      <p className="font-mark tracking-[0.2em] text-primary/70">ZECCA</p>
      <p className="mt-2">
        Conio di Massimo Fornara. I crediti vivono nel libro mastro, non su una catena.
      </p>
      <p className="mt-2">
        <Link href="/avvertenze" className="underline hover:text-primary">
          Avvertenze
        </Link>
        : i crediti non sono euro di banca.
      </p>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:py-12">{children}</main>
      <SiteFooter />
    </div>
  );
}
