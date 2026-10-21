import { NextResponse } from "next/server";
import { listConnections, removeConnection } from "@/lib/google";

export async function GET() {
  return NextResponse.json({ accounts: await listConnections() });
}

export async function DELETE(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (id) await removeConnection(id);
  return NextResponse.json({ ok: true });
}
