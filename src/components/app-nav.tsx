"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, ListChecks, FolderKanban, FileText, MessagesSquare, Users, Settings, Menu, X, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard,
  tasks: ListChecks,
  projects: FolderKanban,
  reports: FileText,
  chat: MessagesSquare,
  people: Users,
  settings: Settings,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };

export function AppNav({ items, orgName, userName, roleLabel, logoutAction }: {
  items: NavItem[];
  orgName: string;
  userName: string;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const nav = (
    <nav aria-label="Điều hướng chính" className="flex flex-1 flex-col gap-1">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = isActive(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active ? "bg-primary-soft text-primary" : "text-neutral-700 hover:bg-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
            <span className="flex-1">{it.label}</span>
            {it.badge ? (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground" aria-label={`${it.badge} mục cần xử lý`}>
                {it.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const footer = (
    <div className="border-t pt-3">
      <p className="truncate text-sm font-medium">{userName}</p>
      <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
      <form action={logoutAction} className="mt-2">
        <button type="submit" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <LogOut className="size-4" aria-hidden /> Đăng xuất
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Thanh trên cùng cho điện thoại */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-card px-4 md:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? "Đóng menu" : "Mở menu"}
          className="rounded-md p-1.5 hover:bg-muted"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
        <span className="truncate font-semibold">{orgName}</span>
      </header>
      {open ? (
        <div id="mobile-nav" className="fixed inset-x-0 top-14 bottom-0 z-30 flex flex-col gap-3 overflow-y-auto bg-card p-4 md:hidden">
          {nav}
          {footer}
        </div>
      ) : null}

      {/* Sidebar cho máy tính */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r bg-card p-4 md:flex">
        <div className="flex items-center gap-2 px-1">
          <div className="grid size-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground" aria-hidden>
            HP
          </div>
          <span className="truncate text-sm font-semibold" title={orgName}>{orgName}</span>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
