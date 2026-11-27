"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Clapperboard, FileText, Bell, MessagesSquare, Users, Settings, Menu, X, LogOut, UserPlus, Building2, Contact, Target,
  FileSignature, ScrollText, ShoppingCart, Package, Tags, Ruler, BookOpen, FolderKanban, Handshake, Wallet, CheckSquare, Network,
  BadgeCheck, CalendarCheck, Banknote, Briefcase, Layers, Megaphone, Factory, BarChart3, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/page-header";
import { avatarSrc } from "@/lib/avatar";

const ICONS = {
  dashboard: LayoutDashboard,
  videos: Clapperboard,
  reports: FileText,
  bell: Bell,
  chat: MessagesSquare,
  people: Users,
  settings: Settings,
  lead: UserPlus,
  account: Building2,
  contact: Contact,
  opportunity: Target,
  quote: FileSignature,
  contract: ScrollText,
  order: ShoppingCart,
  product: Package,
  category: Tags,
  unit: Ruler,
  pricebook: BookOpen,
  project: FolderKanban,
  freelancer: Handshake,
  finance: Wallet,
  task: CheckSquare,
  department: Network,
  position: BadgeCheck,
  attendance: CalendarCheck,
  payroll: Banknote,
  work: Briefcase,
  layers: Layers,
  source: Megaphone,
  industry: Factory,
  chart: BarChart3,
  search: Search,
} as const;

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; badge?: number };
export type NavGroup = { label?: string; items: NavItem[] };

export function AppNav({ groups, orgName, userName, userId, avatarVersion, roleLabel, logoutAction, searchable = false }: {
  groups: NavGroup[];
  searchable?: boolean;
  orgName: string;
  userName: string;
  userId: string;
  avatarVersion: string | null;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  const Brand = (
    <Link href="/" className="flex items-center gap-2.5 rounded-lg px-1.5 py-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon.svg" alt="" width={34} height={34} className="size-[34px] shrink-0" />
      <div className="min-w-0 leading-tight">
        <p className="text-[15px] font-semibold tracking-tight">HANA Studio</p>
        <p className="truncate text-xs text-muted-foreground" title={orgName}>{orgName}</p>
      </div>
    </Link>
  );

  const nav = (
    <nav aria-label="Điều hướng chính" className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
      {searchable ? (
        <form action="/tim-kiem" method="get" role="search" className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input name="q" type="search" placeholder="Tìm kiếm nhanh…" aria-label="Tìm kiếm nhanh" className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-ring/40" />
        </form>
      ) : null}
      {groups.map((g, gi) => (
        <div key={g.label ?? gi} className="flex flex-col gap-0.5">
          {g.label ? <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{g.label}</p> : null}
          {g.items.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(it.href);
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-primary-soft text-primary" : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden /> : null}
                <Icon className={cn("size-[17px]", active ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} aria-hidden />
                <span className="flex-1">{it.label}</span>
                {it.badge ? (
                  <span className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[11px] leading-none text-primary-foreground" aria-label={`${it.badge} mục chưa đọc`}>
                    {it.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
      <Link href="/cai-dat/ho-so" onClick={() => setOpen(false)} aria-label="Hồ sơ của tôi" data-testid="sidebar-profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:opacity-80">
        <Avatar name={userName} src={avatarSrc(userId, avatarVersion)} className="size-9 text-xs" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{userName}</p>
          <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
        </div>
      </Link>
      <form action={logoutAction}>
        <button type="submit" title="Đăng xuất" aria-label="Đăng xuất" className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
          <LogOut className="size-4" aria-hidden />
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Thanh trên cùng: điện thoại, máy tính bảng, cửa sổ hẹp */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label="Mở menu"
          className="grid size-10 place-items-center rounded-lg hover:bg-muted"
        >
          <Menu className="size-5" />
        </button>
        {Brand}
      </header>

      {/* Ngăn kéo menu */}
      <div className={cn("fixed inset-0 z-40 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")} aria-hidden={!open}>
        <div className={cn("absolute inset-0 bg-black/30 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={() => setOpen(false)} />
        <div
          id="mobile-nav"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            "absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 bg-sidebar p-4 shadow-xl transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between">
            {Brand}
            <button type="button" onClick={() => setOpen(false)} aria-label="Đóng menu" className="grid size-9 place-items-center rounded-lg hover:bg-muted">
              <X className="size-5" />
            </button>
          </div>
          {open ? nav : null}
          {footer}
        </div>
      </div>

      {/* Thanh bên: màn hình rộng */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r bg-sidebar px-3 py-4 lg:flex">
        {Brand}
        {nav}
        {footer}
      </aside>
    </>
  );
}
