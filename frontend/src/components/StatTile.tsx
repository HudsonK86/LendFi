import { cn } from "@/lib/ui";

type Props = {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
};

export function StatTile({ label, value, hint, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-lg border border-slate-800/90 bg-slate-950/35 p-4 shadow-inner shadow-black/20",
        className,
      )}
    >
      <p className="min-h-[2.25rem] text-[11px] font-semibold uppercase tracking-wider leading-tight text-slate-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-slate-50">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-snug text-slate-500">{hint}</p> : null}
    </div>
  );
}
