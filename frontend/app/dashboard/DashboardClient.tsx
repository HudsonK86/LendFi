"use client";

import { PageHeader } from "@/components/PageHeader";
import { shell } from "@/lib/ui";
import { BorrowClient } from "../borrow/BorrowClient";
import { PoolClient } from "../pool/PoolClient";

export function DashboardClient() {
  return (
    <main className={shell}>
      <PageHeader
        title="Dashboard"
        subtitle="Transaction workspace only: pool actions + borrow actions and position health."
      />
      <section className="mt-8">
        <PoolClient embedded mode="modulesOnly" />
      </section>
      <section className="mt-10 border-t border-slate-800 pt-8">
        <BorrowClient embedded />
      </section>
    </main>
  );
}
