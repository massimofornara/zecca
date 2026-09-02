import { redirect } from "next/navigation";
import { requireAdmin } from "@/auth";
import { AdminNav } from "@/components/layout/AdminNav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();
  if (!admin) redirect("/accedi?callbackUrl=/zecchiere");

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:py-10">
      <AdminNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
