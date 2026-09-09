import { NextResponse } from "next/server";
import { requireAdmin } from "@/auth";
import { pain001ForQueuedIban } from "@/lib/zecca/settlement";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Solo il zecchiere può scaricare la distinta SEPA." }, { status: 401 });
  }
  const pack = await pain001ForQueuedIban();
  if (!pack.xml) {
    return NextResponse.json({ error: pack.error }, { status: 409 });
  }
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return new NextResponse(pack.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="zecca-unicredit-sepa-${day}.xml"`,
    },
  });
}
