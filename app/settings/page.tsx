"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import GoogleProfiles from "@/components/GoogleProfiles";
import { TopBar } from "@/components/ui";
import { COST_PER_PIN } from "@/lib/grid";

function Settings() {
  const params = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    const g = params.get("google");
    if (g) {
      setNotice(g);
      history.replaceState(null, "", "/settings");
    }
  }, [params]);

  return (
    <main className="h-full overflow-y-auto bg-soft">
      <TopBar />
      <div className="mx-auto max-w-3xl px-4 pt-24 pb-16 flex flex-col gap-5">
        <header>
          <h1 className="text-[28px] font-extrabold tracking-tight">Settings</h1>
          <p className="help text-[14.5px] mt-1">Connected Google accounts and what scans cost.</p>
        </header>

        <div id="google" className="scroll-mt-24">
          <GoogleProfiles key={notice ?? "none"} notice={notice} onImported={() => {}} />
        </div>

        <section className="panel p-5" aria-labelledby="cost-h">
          <h2 id="cost-h" className="text-[16px] font-extrabold tracking-tight">What scans cost</h2>
          <p className="help mt-0.5">Paid from the DataForSEO balance in the top right. Nothing runs on its own; every scan is a button press.</p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-2 text-[14px]">
            {[
              ["One map point", `$${COST_PER_PIN.toFixed(3)}`],
              ["Standard scan (39 points)", `$${(39 * COST_PER_PIN).toFixed(2)}`],
              ["Detailed scan (64 points)", `$${(64 * COST_PER_PIN).toFixed(2)}`],
              ["Business lookup or import", `$${COST_PER_PIN.toFixed(3)}`],
            ].map(([k, v]) => (
              <li key={k} className="flex justify-between rounded-lg border border-line px-3.5 py-2.5">
                <span>{k}</span>
                <b className="num">{v}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Settings />
    </Suspense>
  );
}
