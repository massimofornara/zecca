import { LoginForm } from "@/components/auth/AuthForms";
import { isDemoLoginAllowed } from "@/lib/live";

export const metadata = { title: "Accedi" };

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return <LoginForm callbackUrl={callbackUrl} showDemo={isDemoLoginAllowed()} />;
}
