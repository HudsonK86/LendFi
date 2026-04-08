"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

import { btnPrimary, input, label } from "@/lib/ui";

export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = data.error ?? "Login failed";
        toast.error(msg);
        return;
      }
      const from = searchParams.get("from");
      router.push(from && from.startsWith("/admin") ? from : "/admin");
      router.refresh();
    } catch {
      toast.error("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center gap-8 px-4">
      <div>
        <div className="mb-3 inline-flex rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-200/90">
          Admin
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-50">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Access oracle and protocol admin tools.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border border-slate-800/90 bg-slate-900/40 p-6 shadow-xl shadow-black/30">
        <label className="flex flex-col gap-1.5 text-sm text-slate-300">
          <span className={label}>Username</span>
          <input
            className={input}
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-slate-300">
          <span className={label}>Password</span>
          <input
            className={input}
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={loading} className={`${btnPrimary} w-full`}>
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
