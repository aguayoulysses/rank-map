"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useBrand } from "@/components/BrandContext";

function Login() {
  const brand = useBrand();
  const params = useSearchParams();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    setBusy(false);
    if (!r.ok) return setErr("That password didn't work. Check it and try again.");
    window.location.href = params.get("next") || "/";
  }
  return (
    <main className="h-full overflow-y-auto grid place-items-center px-4 py-10 bg-soft">
      <form onSubmit={submit} className="panel w-full max-w-sm p-7 flex flex-col gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand.logo} alt={brand.name} className="h-28 w-auto mx-auto object-contain" />
        <div className="text-center">
          <h1 className="text-[24px] font-extrabold tracking-tight">{brand.product}</h1>
          <p className="help mt-1">See where you show up in Google Maps, street by street.</p>
        </div>
        <label htmlFor="pw" className="flex flex-col gap-1.5">
          <span className="label">Password</span>
          <input id="pw" type="password" autoComplete="current-password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} className="field px-3.5 text-[16px]" aria-invalid={!!err} aria-describedby={err ? "pw-err" : undefined} />
        </label>
        {err && <p id="pw-err" role="alert" className="text-bad text-[14px] font-semibold -mt-2">{err}</p>}
        <button className="btn btn-primary" disabled={busy || !pw}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
