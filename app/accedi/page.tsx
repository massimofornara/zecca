import { LoginForm } from "@/components/auth/AuthForms";

export const metadata = { title: "Accedi" };

export default async function AccediPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  return <LoginForm callbackUrl={callbackUrl} />;
}
