import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: "border-sky-200 bg-sky-50 text-sky-900",
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  error: "border-red-200 bg-red-50 text-red-900",
};

export function Alert({ tone = "info", className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-lg border px-3.5 py-2.5 text-sm leading-relaxed", tones[tone], className)} {...props} />;
}

export function EmptyState({ title, description, icon, children }: { title: string; description?: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center">
      {icon ? <div className="mb-1 grid size-11 place-items-center rounded-full bg-primary-soft text-primary [&_svg]:size-5">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}
