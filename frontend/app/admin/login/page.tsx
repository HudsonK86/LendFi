import { Suspense } from "react";

import { AdminLoginForm } from "./LoginForm";

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
          <p className="text-slate-500">Loading…</p>
        </main>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
