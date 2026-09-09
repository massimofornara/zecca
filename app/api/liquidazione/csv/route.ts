import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { csvForSettlement } from "@/lib/zecca/settlement";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Solo il zecchiere può scaricare la distinta." }, { status: 401 });
  }
  const csv = await csvForSettlement();
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zecca-liquidazione-${day}.csv"`,
    },
  });
}
