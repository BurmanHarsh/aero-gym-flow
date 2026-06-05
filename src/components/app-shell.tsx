import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserPlus,
  QrCode,
  Receipt,
  Settings,
  ShieldCheck,
  UsersRound,
  Dumbbell,
  Bell,
  Menu,
  Search,
  Wallet,
  Package,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const PRIMARY: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/members", label: "Members", icon: Users },
  { to: "/leads", label: "Leads", icon: UserPlus },
  { to: "/attendance", label: "Attendance", icon: QrCode },
  { to: "/trainers", label: "Trainers", icon: Dumbbell },
  { to: "/billing", label: "Billing", icon: Receipt },
];
const ADMIN: NavItem[] = [
  { to: "/employees", label: "Employees", icon: UsersRound, adminOnly: true },
  { to: "/expenses", label: "Expenses", icon: Wallet, adminOnly: true },
  { to: "/inventory", label: "Inventory", icon: Package, adminOnly: true },
  { to: "/audit", label: "Audit logs", icon: ShieldCheck, adminOnly: true },
];

const MOBILE_TABS: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/attendance", label: "Check-in", icon: QrCode },
  { to: "/members", label: "Members", icon: Users },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  const visible = (item: NavItem) => !item.adminOnly || me.isAdmin;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all md:flex",
          collapsed ? "w-18" : "w-64"
        )}
      >
        <Link to="/dashboard" className="flex h-16 items-center gap-2 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary shadow-glow">
            <Dumbbell className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold">Tank by <span className="text-muted-foreground">Tapan</span></div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{me.isAdmin ? "Admin" : "Front desk"}</div>
            </div>
          )}
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6 scrollbar-thin">
          <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
          {PRIMARY.map((item) => (
            <NavLink key={item.to} item={item} active={path.startsWith(item.to)} collapsed={collapsed} />
          ))}

          {me.isAdmin && (
            <>
              <SectionLabel collapsed={collapsed}>Admin</SectionLabel>
              {ADMIN.filter(visible).map((item) => (
                <NavLink key={item.to} item={item} active={path.startsWith(item.to)} collapsed={collapsed} />
              ))}
            </>
          )}

          <SectionLabel collapsed={collapsed}>Account</SectionLabel>
          <NavLink item={{ to: "/settings", label: "Settings", icon: Settings }} active={path.startsWith("/settings")} collapsed={collapsed} />
        </nav>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="m-3 mt-0 inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs text-muted-foreground hover:bg-card"
        >
          <Menu className="h-3.5 w-3.5" /> {!collapsed && "Collapse"}
        </button>
      </aside>

      {/* Main content */}
      <div className={cn("flex min-h-screen flex-col transition-all", "md:pl-64", collapsed && "md:pl-18")}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur md:px-8">
          <div className="flex flex-1 items-center gap-3">
            <div className="hidden flex-1 max-w-md md:flex">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  placeholder="Search members, invoices, leads…"
                  className="w-full rounded-lg border border-input bg-card/40 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-ring focus:bg-card"
                />
              </div>
            </div>
            <div className="md:hidden">
              <h1 className="text-base font-semibold capitalize">{(path.split("/")[1] || "dashboard").replace("-", " ")}</h1>
            </div>
          </div>
          <button className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card/40 hover:bg-card">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
          </button>
          <Link to="/settings" search={{ tab: "account" }} className="hidden items-center gap-2 rounded-lg border border-border bg-card/40 px-2.5 py-1.5 md:flex hover:bg-card">
            {me.avatarUrl ? (
              <img src={me.avatarUrl} alt={me.fullName} className="h-7 w-7 rounded-md object-cover" />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md gradient-primary text-[11px] font-semibold text-primary-foreground">
                {(me.fullName || me.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="leading-tight">
              <div className="text-xs font-medium">{me.fullName || me.email}</div>
              <div className="text-[10px] uppercase text-muted-foreground">{me.isAdmin ? "Admin" : "Front desk"}</div>
            </div>
          </Link>
        </header>

        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-lg md:hidden">
        <ul className="grid grid-cols-5">
          {MOBILE_TABS.map((t) => {
            const active = path === t.to || (t.to !== "/dashboard" && path.startsWith(t.to));
            const Icon = t.icon;
            return (
              <li key={t.to}>
                <Link
                  to={t.to}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] transition",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <span className={cn("grid h-9 w-12 place-items-center rounded-lg transition", active && "bg-primary/12")}>
                    <Icon className={cn("h-5 w-5", active && "drop-shadow")} />
                  </span>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: ReactNode }) {
  if (collapsed) return <div className="my-2 h-px bg-sidebar-border" />;
  return <div className="mb-1 mt-4 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>;
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition",
        active ? "bg-primary/12 text-primary" : "text-sidebar-foreground/80 hover:bg-accent hover:text-foreground"
      )}
      title={collapsed ? item.label : undefined}
    >
      <Icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      {!collapsed && <span className="truncate">{item.label}</span>}
      {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}
