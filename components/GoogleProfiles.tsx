"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { GbpLocation, GoogleConn } from "@/lib/google";

type Loc = GbpLocation & { businessId: number | null };

const NOTICES: Record<string, { text: string; tone: "good" | "bad" }> = {
  connected: { text: "Google account connected. Pick the profiles to bring in.", tone: "good" },
  cancelled: { text: "Google sign-in was cancelled. Nothing changed.", tone: "bad" },
  failed: { text: "Google sign-in didn't finish. Try connecting again.", tone: "bad" },
  norefresh: { text: "Google didn't give lasting access. Remove this app at myaccount.google.com/permissions, then connect again.", tone: "bad" },
};

function GoogleG() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default function GoogleProfiles({ notice, onImported }: { notice: string | null; onImported: () => void }) {
  const router = useRouter();
  const [conns, setConns] = useState<GoogleConn[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [locs, setLocs] = useState<Loc[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null);

  const loadConns = () =>
    fetch("/api/google/accounts")
      .then((r) => r.json())
      .then((d) => {
        setConns(d.accounts ?? []);
        if (notice === "connected" && d.accounts?.length) openConn(d.accounts[d.accounts.length - 1].id);
      })
      .catch(() => setConns([]));
  useEffect(() => {
    loadConns();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function openConn(id: number) {
    setOpen(id);
    setLocs(null);
    setErr("");
    setProblems([]);
    setPicked(new Set());
    const r = await fetch(`/api/google/locations?conn=${id}`);
    const d = await r.json();
    if (!r.ok) return setErr(d.error ?? "Couldn't load the profiles");
    const rank = (l: Loc) => (l.businessId ? 1 : l.placeId || l.lat != null ? 0 : 2);
    setLocs([...(d.locations as Loc[])].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)));
    setPicked(new Set((d.locations as Loc[]).filter((l) => !l.businessId && (l.placeId || l.lat != null)).map((l) => l.name)));
  }

  async function importPicked() {
    if (open == null || !picked.size) return;
    setBusy(true);
    setErr("");
    const r = await fetch("/api/google/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conn: open, names: [...picked] }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error ?? "The import didn't finish");
    setProblems(d.problems ?? []);
    onImported();
    if (d.added?.length === 1 && !(d.problems ?? []).length) return router.push(`/b/${d.added[0]}`);
    openConn(open);
  }

  async function remove(id: number) {
    await fetch(`/api/google/accounts?id=${id}`, { method: "DELETE" });
    setConfirmRemove(null);
    if (open === id) setOpen(null);
    loadConns();
  }

  const n = notice ? NOTICES[notice] : null;

  return (
    <section className="panel p-5 pointer-events-auto" aria-label="Google Business Profiles">
      <h2 className="text-[16px] font-extrabold tracking-tight">Google Business Profiles</h2>
      <p className="help mt-0.5">Sign in with the Google account that manages the profiles and bring them all in at once.</p>
      {n && (
        <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-[13.5px] font-semibold ${n.tone === "good" ? "bg-[#e7f5ec] text-good" : "bg-[#fdecec] text-bad"}`}>{n.text}</p>
      )}

      <ul className="mt-3 flex flex-col gap-2">
        {conns?.map((c) => (
          <li key={c.id} className="rounded-xl border-[1.5px] border-line">
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <GoogleG />
              <span className="flex-1 min-w-0 truncate font-semibold text-[14.5px]">{c.email}</span>
              {open === c.id ? (
                <button className="btn btn-ghost !min-h-9 text-[13.5px]" onClick={() => setOpen(null)}>Close</button>
              ) : (
                <button className="btn btn-primary !min-h-9 !px-3.5 text-[13.5px]" onClick={() => openConn(c.id)}>Import profiles</button>
              )}
            </div>
            {open === c.id && (
              <div className="border-t border-line px-3.5 py-3 flex flex-col gap-2.5">
                {err && <p role="alert" className="text-bad text-[13.5px] font-semibold">{err}</p>}
                {!locs && !err && <p className="help">Reading your profiles from Google…</p>}
                {locs?.length === 0 && <p className="help">This Google account doesn&apos;t manage any Business Profiles.</p>}
                {locs && locs.length > 0 && (
                  <>
                    <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto scroll-thin -mx-1 px-1">
                      {locs.map((l) => {
                        const live = !!(l.placeId || l.lat != null);
                        const id = `loc-${l.name.replace(/\W/g, "")}`;
                        return (
                          <li key={l.name}>
                            {l.businessId ? (
                              <a href={`/b/${l.businessId}`} className="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-soft">
                                <span className="h-5 w-5 rounded-md bg-good text-white grid place-items-center text-[12px]" aria-hidden>✓</span>
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate text-[14px] font-semibold">{l.title}</span>
                                  <span className="block text-[12.5px] text-muted">Already added · open</span>
                                </span>
                              </a>
                            ) : (
                              <label htmlFor={id} className={`flex items-start gap-3 rounded-lg px-2.5 py-2 ${live ? "cursor-pointer hover:bg-soft" : "opacity-60"}`}>
                                <input
                                  id={id}
                                  type="checkbox"
                                  className="mt-0.5 h-5 w-5 accent-[var(--ink)]"
                                  disabled={!live}
                                  checked={picked.has(l.name)}
                                  onChange={(e) => {
                                    const s = new Set(picked);
                                    if (e.target.checked) s.add(l.name);
                                    else s.delete(l.name);
                                    setPicked(s);
                                  }}
                                />
                                <span className="flex-1 min-w-0">
                                  <span className="block truncate text-[14px] font-semibold">{l.title}</span>
                                  <span className="block text-[12.5px] text-muted truncate">
                                    {!live ? "Not live on Google Maps yet" : [l.category, l.address ?? (l.serviceCities.length ? `Serves ${l.serviceCities.slice(0, 3).join(", ")}${l.serviceCities.length > 3 ? "…" : ""}` : null)].filter(Boolean).join(" · ")}
                                  </span>
                                </span>
                              </label>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <button className="btn btn-primary" onClick={importPicked} disabled={busy || !picked.size}>
                      {busy ? "Adding…" : `Add ${picked.size} profile${picked.size === 1 ? "" : "s"}`}
                    </button>
                    <p className="help">Service-area businesses hide their address from Google&apos;s API, so they start on the spot Google Maps shows. Drag the pin to the real home base before the first scan.</p>
                  </>
                )}
                {problems.map((p) => (
                  <p key={p} className="text-medium text-[13px] font-semibold">{p}</p>
                ))}
                <div className="flex justify-end">
                  {confirmRemove === c.id ? (
                    <span className="flex items-center gap-2 text-[13px]">
                      Disconnect {c.email}?
                      <button className="btn btn-danger !min-h-8 text-[13px]" onClick={() => remove(c.id)}>Disconnect</button>
                      <button className="btn btn-ghost !min-h-8 text-[13px]" onClick={() => setConfirmRemove(null)}>Keep</button>
                    </span>
                  ) : (
                    <button className="text-[13px] font-semibold text-muted underline" onClick={() => setConfirmRemove(c.id)}>Disconnect this account</button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      <a href="/api/google/start" className="btn btn-ghost w-full mt-3 text-[14.5px]">
        <GoogleG />
        {conns?.length ? "Connect another Google account" : "Sign in with Google"}
      </a>
    </section>
  );
}
