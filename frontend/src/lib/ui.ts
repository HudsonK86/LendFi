/** Shared Tailwind class strings for a consistent DeFi-style dark UI */

export function cn(...parts: Array<string | false | undefined | null>) {
  return parts.filter(Boolean).join(" ");
}

export const shell = "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6";

export const pageTitle = "text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl";

export const pageSubtitle = "mt-2 max-w-2xl text-sm leading-relaxed text-slate-400";

export const card =
  "rounded-xl border border-slate-700/50 bg-slate-900/35 p-5 shadow-xl shadow-black/30 backdrop-blur-md";

export const cardMuted = "rounded-xl border border-slate-800/80 bg-slate-950/40 p-4";

export const label = "text-xs font-medium uppercase tracking-wide text-slate-500";

export const code =
  "rounded-md border border-slate-700/80 bg-slate-950/80 px-1.5 py-0.5 font-mono text-[0.8rem] text-cyan-200/90";

export const input =
  "mt-1.5 w-full rounded-lg border border-slate-700/90 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 outline-none transition focus:border-cyan-500/40 focus:ring-2 focus:ring-cyan-500/20";

export const btnPrimary =
  "inline-flex items-center justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:from-cyan-500 hover:to-cyan-400 disabled:pointer-events-none disabled:opacity-45";

export const btnNeutral =
  "inline-flex items-center justify-center rounded-lg border border-slate-600 bg-slate-800/90 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-45";

export const linkSubtle = "text-sm font-medium text-cyan-400/90 underline-offset-4 hover:text-cyan-300 hover:underline";

export const tableWrap = "overflow-x-auto rounded-lg border border-slate-800/90";

export const th = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500";

export const td = "px-4 py-3 text-sm text-slate-200";
