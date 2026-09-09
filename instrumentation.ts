export async function register() {
  await import("@/lib/boot-env");
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { ensureLiveDatabase } = await import("@/lib/boot-db");
    await ensureLiveDatabase();
  }
}
