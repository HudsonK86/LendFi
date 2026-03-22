import { Suspense } from "react";

import { LiquidationsClient } from "./LiquidationsClient";

export default function LiquidationsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading liquidations…</p>}>
      <LiquidationsClient />
    </Suspense>
  );
}
