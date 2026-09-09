export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await import("@/lib/boot-env");
  const { ensureLiveDatabase } = await import("@/lib/boot-db");
  await ensureLiveDatabase();
  try {
    const { ensureGaslessChain } = await import("@/lib/zecca/gasless-chain");
    await ensureGaslessChain();
  } catch (error) {
    console.error("[zecca-gasless] avvio catena", error instanceof Error ? error.message : error);
  }
}
