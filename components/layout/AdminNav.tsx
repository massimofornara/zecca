"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand/Wordmark";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/zecchiere", label: "Tesoreria" },
  { href: "/zecchiere/conio", label: "Conio" },
  { href: "/zecchiere/prodotti", label: "Vetrina" },
  { href: "/zecchiere/fornitori", label: "Fornitori" },
  { href: "/zecchiere/ordini", label: "Ordini" },
  { href: "/zecchiere/libro-mastro", label: "Libro mastro" },
  { href: "/zecchiere/fusioni", label: "Fusioni" },
  { href: "/zecchiere/versamenti", label: "Versamenti" },
  { href: "/zecchiere/forgia", label: "Forgia" },
  { href: "/zecchiere/fedeli", label: "Fedeli" },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-primary/20 md:w-56 md:border-b-0 md:border-r md:pr-6">
      <div className="mb-6 hidden md:block">
        <Wordmark size="sm" href="/zecchiere" />
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">Zecchiere</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-3 md:flex-col md:overflow-visible md:pb-0">
        {ITEMS.map((item) => {
          const current =
            item.href === "/zecchiere"
              ? pathname === "/zecchiere"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-sm",
                current
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:text-primary",
              )}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/vetrina" className="px-3 py-2 text-sm text-muted-foreground hover:text-primary">
          ← Bottega
        </Link>
        <form action={logoutAction} className="px-3 py-2">
          <Button variant="ghost" size="sm" type="submit">
            Esci
          </Button>
        </form>
      </nav>
    </aside>
  );
}
