export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/lib/boot-env");
  const { ensureLiveDatabase } = await import("@/lib/boot-db");
  await ensureLiveDatabase();
}
