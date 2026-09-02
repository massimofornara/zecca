import Link from "next/link";
import { Wordmark } from "@/components/brand/Wordmark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFound() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-24 text-center">
      <Wordmark />
      <h1 className="mt-8 font-display text-3xl text-primary">Pagina non trovata</h1>
      <p className="mt-2 max-w-md text-muted-foreground">
        Questo foglio non è nel libro. Torna in vetrina o alla zecca.
      </p>
      <Link href="/" className={cn(buttonVariants({ size: "lg" }), "mt-6 px-5")}>
        Torna all’ingresso
      </Link>
    </div>
  );
}
