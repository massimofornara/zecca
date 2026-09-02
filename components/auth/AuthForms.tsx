"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, registerAction } from "@/actions/auth";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { ErrorBanner } from "@/components/ui/banners";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wordmark } from "@/components/brand/Wordmark";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <AuthCard
      title="Entra in zecca"
      subtitle="Il libro mastro ti riconosce dalla email."
      alt={{ href: "/registrati", label: "Non hai un conto? Iscriviti." }}
    >
      <form action={action} className="space-y-4">
        {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
        <ErrorBanner message={state?.error} />
        <Field id="email" name="email" label="Email" type="email" autoComplete="email" />
        <Field id="password" name="password" label="Password" type="password" autoComplete="current-password" />
        <SubmitButton className="w-full">Entra</SubmitButton>
      </form>
      <DemoLogins />
    </AuthCard>
  );
}

export function RegisterForm() {
  const [state, action] = useActionState(registerAction, null);
  return (
    <AuthCard
      title="Apri un conto"
      subtitle="Un portafoglio vuoto, in attesa del primo acquisto di crediti."
      alt={{ href: "/accedi", label: "Hai già un conto? Entra." }}
    >
      <form action={action} className="space-y-4">
        <ErrorBanner message={state?.error} />
        <Field id="name" name="name" label="Nome" autoComplete="name" />
        <Field id="email" name="email" label="Email" type="email" autoComplete="email" />
        <Field id="password" name="password" label="Password" type="password" autoComplete="new-password" />
        <SubmitButton className="w-full">Iscriviti</SubmitButton>
      </form>
    </AuthCard>
  );
}

function AuthCard({
  title,
  subtitle,
  alt,
  children,
}: {
  title: string;
  subtitle: string;
  alt: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
      <Wordmark size="md" />
      <div className="paper mt-8 w-full max-w-md rounded-md p-6 md:p-8">
        <h1 className="font-display text-3xl">{title}</h1>
        <p className="mt-1 text-sm opacity-75">{subtitle}</p>
        <div className="mt-6">{children}</div>
        <p className="mt-6 text-sm opacity-75">
          <Link href={alt.href} className="underline">
            {alt.label}
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  autoComplete,
}: {
  id: string;
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={name} type={type} autoComplete={autoComplete} required className="bg-white/40" />
    </div>
  );
}

function DemoLogins() {
  return (
    <div className="mt-6 border-t border-black/10 pt-4 text-xs opacity-80">
      <p className="uppercase tracking-[0.18em]">Conti dimostrativi</p>
      <ul className="mt-2 space-y-1 font-ledger">
        <li>zecchiere · massimo@zecca.local · Conio2212!</li>
        <li>cliente · chiara@zecca.local · ForgiaChiara1</li>
        <li>cliente · luca@zecca.local · ForgiaLuca1</li>
      </ul>
    </div>
  );
}
