"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MarketReport from "@/components/MarketReport";
import { TopBar, fmtDate } from "@/components/ui";
import type { Pin, Scan } from "@/lib/db";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [data, setData] = useState<{ scan: Scan; pins: Pin[] } | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    fetch(`/api/scans/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setMissing(true));
  }, [id]);

  async function share() {
    const r = await fetch(`/api/scans/${id}`, { method: "POST" });
    const { token } = await r.json();
    const url = `${location.origin}/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied("Link copied. Paste it anywhere.");
    } catch {
      setCopied(url);
    }
    setTimeout(() => setCopied(""), 6000);
  }

  async function del() {
    await fetch(`/api/scans/${id}`, { method: "DELETE" });
    router.push("/market");
  }

  if (missing)
    return (
      <main className="h-full grid place-items-center">
        <p className="help text-[15px]">
          That research was deleted. <Link className="font-bold underline" href="/market">Back to market research</Link>
        </p>
      </main>
    );
  if (!data) return <main className="h-full grid place-items-center help text-[15px]">Loading research…</main>;

  return (
    <MarketReport
      scan={data.scan}
      pins={data.pins}
      top={
        <>
          <TopBar />
          <nav className="absolute z-10 top-[76px] left-3 right-3 sm:left-[468px] sm:right-auto sm:w-[min(520px,calc(100%-500px))] panel px-2 py-2 flex items-center gap-2" aria-label="Research">
            <Link href="/market" className="btn btn-ghost text-[14px] whitespace-nowrap">← Research</Link>
            <div className="flex-1 min-w-0 text-center">
              <div className="font-extrabold text-[14.5px] truncate">{fmtDate(data.scan.createdAt)}</div>
              <div className="text-[12.5px] text-muted truncate">{data.scan.pinCount} points · {data.scan.distanceLabel}</div>
            </div>
          </nav>
        </>
      }
      actions={
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button onClick={share} className="btn btn-primary flex-1">Copy share link</button>
            {confirmDel ? (
              <>
                <button onClick={del} className="btn btn-danger">Delete</button>
                <button onClick={() => setConfirmDel(false)} className="btn btn-ghost">Keep</button>
              </>
            ) : (
              <button onClick={() => setConfirmDel(true)} className="btn btn-ghost">Delete</button>
            )}
          </div>
          {copied && <p role="status" className={`text-[13px] ${copied.startsWith("http") ? "break-all select-all" : "text-good font-bold"}`}>{copied}</p>}
        </div>
      }
    />
  );
}
