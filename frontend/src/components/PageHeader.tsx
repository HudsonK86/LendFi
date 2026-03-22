import { cn, pageSubtitle, pageTitle } from "@/lib/ui";

type Props = {
  title: string;
  subtitle?: string;
  className?: string;
};

export function PageHeader({ title, subtitle, className }: Props) {
  return (
    <div className={cn("mb-8", className)}>
      <h1 className={pageTitle}>{title}</h1>
      {subtitle ? <p className={pageSubtitle}>{subtitle}</p> : null}
    </div>
  );
}
