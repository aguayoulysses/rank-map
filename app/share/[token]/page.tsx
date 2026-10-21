import { notFound } from "next/navigation";
import { db, ensureSchema, getBusiness, getPins, toScan } from "@/lib/db";
import ShareView, { ShareMarket } from "./ShareView";

export const dynamic = "force-dynamic";

export default async function Share({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  await ensureSchema();
  const r = await db().execute({ sql: "SELECT * FROM hx_scans WHERE share_token = ?", args: [token] });
  if (!r.rows[0]) notFound();
  const scan = toScan(r.rows[0]);
  if (scan.mode === "market") return <ShareMarket scan={scan} pins={await getPins(scan.id)} />;
  const [business, pins] = await Promise.all([getBusiness(scan.businessId), getPins(scan.id)]);
  if (!business) notFound();
  return <ShareView business={business} scan={scan} pins={pins} />;
}
