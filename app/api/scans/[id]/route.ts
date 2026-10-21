import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db, getPins, getScan } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ scan, pins: await getPins(id) });
}

/** Create (or return) the public read-only share link. */
export async function POST(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  const scan = await getScan(id);
  if (!scan) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let token = scan.shareToken;
  if (!token) {
    token = randomBytes(9).toString("base64url");
    await db().execute({ sql: "UPDATE hx_scans SET share_token = ? WHERE id = ?", args: [token, id] });
  }
  return NextResponse.json({ token });
}

export async function DELETE(_: Request, { params }: Ctx) {
  const id = Number((await params).id);
  await db().batch(
    [
      { sql: "DELETE FROM hx_pins WHERE scan_id = ?", args: [id] },
      { sql: "DELETE FROM hx_scans WHERE id = ?", args: [id] },
    ],
    "write"
  );
  return NextResponse.json({ ok: true });
}
