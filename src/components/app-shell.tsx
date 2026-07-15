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
  Wallet,
  Package,
  Info,
  AlertTriangle,
  CheckCircle,
  CalendarClock,
  Megaphone,
  X,
  Plus,
  Award,
  Percent,
  Scale,
  Layout,
} from "lucide-react";
import { useState, type ReactNode, useEffect, useRef } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean };

const PRIMARY: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/members", label: "Members", icon: Users },
  { to: "/attendance", label: "Attendance", icon: QrCode },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/plans", label: "Plans", icon: Award },
  { to: "/billing", label: "Billing", icon: Receipt },
  { to: "/rules", label: "Rules", icon: Scale },
];
const ADMIN: NavItem[] = [
  { to: "/employees", label: "Employees", icon: UsersRound, adminOnly: true },
  { to: "/expenses", label: "Expenses", icon: Wallet, adminOnly: true },
  { to: "/coupons", label: "Coupons", icon: Percent, adminOnly: true },
  { to: "/audit", label: "Audit logs", icon: ShieldCheck, adminOnly: true },
  { to: "/landing", label: "Landing Page", icon: Layout, adminOnly: true },
];

const MOBILE_TABS: NavItem[] = [
  { to: "/dashboard", label: "Home", icon: LayoutDashboard },
  { to: "/attendance", label: "Check-in", icon: QrCode },
  { to: "/members", label: "Members", icon: Users },
  { to: "/rules", label: "Rules", icon: Scale },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [imageError, setImageError] = useState(false);
  const path = useRouterState({ select: (s) => s.location.pathname });

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  const visible = (item: NavItem) => {
    if (me.isAdmin) return true;
    if (me.roles.includes("front_desk")) {
      // Front desk can only view Dashboard, Members, Inventory, Settings, Plans, Rules
      const allowed = ["/dashboard", "/members", "/inventory", "/plans", "/settings", "/rules"];
      return allowed.includes(item.to);
    }
    // Regular members can only view Dashboard, Attendance, Inventory, Settings, Plans, Rules
    const allowed = ["/dashboard", "/attendance", "/inventory", "/settings", "/plans", "/rules"];
    return allowed.includes(item.to);
  };

  const roleLabel = me.isAdmin ? "Admin" : isStaff ? "Front desk" : "Member";
  const filteredMobileTabs = MOBILE_TABS.filter(visible);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all md:flex",
          collapsed ? "w-18" : "w-64"
        )}
      >
        <Link to="/dashboard" className="flex h-16 items-center gap-3 px-4">
          <img
            src="/logo.png"
            alt="Tank by Tapan Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-contain bg-white p-0.5 shadow-glow"
          />
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-bold tracking-tight text-sidebar-foreground">
                Tank by <span className="text-primary font-black">Tapan</span>
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{roleLabel}</div>
            </div>
          )}
        </Link>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 pb-6 scrollbar-thin">
          <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
          {PRIMARY.filter(visible).map((item) => (
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
            <div>
              <h1 className="text-base font-semibold capitalize">{(path.split("/")[1] || "dashboard").replace("-", " ")}</h1>
            </div>
          </div>
          <NotificationBell />
          <Link to="/settings" search={{ tab: "account" }} className="hidden items-center gap-2 rounded-lg border border-border bg-card/40 px-2.5 py-1.5 md:flex hover:bg-card">
            {me.avatarUrl && !imageError ? (
              <img
                src={me.avatarUrl}
                alt={me.fullName}
                onError={() => setImageError(true)}
                className="h-7 w-7 rounded-md object-cover"
              />
            ) : (
              <div className="grid h-7 w-7 place-items-center rounded-md gradient-primary text-[11px] font-semibold text-primary-foreground">
                {(me.fullName || me.email || "U").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="leading-tight">
              <div className="text-xs font-medium">{me.fullName || me.email}</div>
              <div className="text-[10px] uppercase text-muted-foreground">{roleLabel}</div>
            </div>
          </Link>
        </header>

        <main className="flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-12">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-lg md:hidden">
        <ul className={cn("grid", filteredMobileTabs.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
          {filteredMobileTabs.map((t) => {
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

interface Notification {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  kind: string;
  created_at: string;
}

function formatRelativeTime(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NotificationBell() {
  const me = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"info" | "warning" | "success" | "reminder">("info");
  const [busy, setBusy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (me.loading || !me.user) return;

    // Fetch initial notifications
    async function fetchNotifs() {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .or(`user_id.is.null,user_id.eq.${me.user?.id}`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Error fetching notifications:", error);
        return;
      }

      const list = (data ?? []) as Notification[];
      setNotifications(list);

      // Check if there are unread notifications
      const lastRead = localStorage.getItem(`last_read_announcements_${me.user?.id}`);
      if (list.length > 0) {
        if (!lastRead) {
          setHasUnread(true);
        } else {
          const lastReadTime = new Date(lastRead).getTime();
          const hasNew = list.some((n) => new Date(n.created_at).getTime() > lastReadTime);
          setHasUnread(hasNew);
        }
      }
    }

    fetchNotifs();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications" },
        (payload) => {
          const newNotif = payload.new as Notification;
          if (!newNotif.user_id || newNotif.user_id === me.user?.id) {
            setNotifications((prev) => [newNotif, ...prev].slice(0, 10));
            setHasUnread(true);
            toast.info(`New broadcast: ${newNotif.title}`);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [me.loading, me.user?.id]);

  // Click outside close
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogOpen) return; // Do not close bell dropdown while dialog is open

      const target = e.target as HTMLElement;
      // Exclude clicks inside Radix UI Portals (like Dialog overlays/content)
      if (target.closest("[data-radix-portal]") || target.closest('[role="dialog"]')) {
        return;
      }

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dialogOpen]);

  const handleToggle = () => {
    setOpen(!open);
    if (!open && me.user) {
      // Mark as read
      localStorage.setItem(`last_read_announcements_${me.user.id}`, new Date().toISOString());
      setHasUnread(false);
    }
  };

  const handleCreateBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("notifications").insert({
      title: title.trim(),
      body: body.trim() || null,
      kind,
      user_id: null, // Global broadcast
    });

    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    toast.success("Broadcast announcement posted successfully!");
    setTitle("");
    setBody("");
    setKind("info");
    setBusy(false);
    setDialogOpen(false);
  };

  const getIcon = (k: string) => {
    switch (k) {
      case "warning":
        return <AlertTriangle className="h-4 w-4 text-warning" />;
      case "success":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "reminder":
        return <CalendarClock className="h-4 w-4 text-info" />;
      default:
        return <Megaphone className="h-4 w-4 text-primary" />;
    }
  };

  const isStaff = me.isAdmin || me.roles.includes("front_desk");

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-border bg-card/40 hover:bg-card transition"
      >
        <Bell className="h-4 w-4" />
        {hasUnread && (
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 z-50 w-80 rounded-xl border border-border/80 bg-popover/95 p-2 shadow-xl backdrop-blur-md animate-in fade-in-50 slide-in-from-top-1">
          <div className="flex items-center justify-between border-b border-border/60 pb-2 px-2 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Announcements</h3>
            {isStaff && (
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-6 w-6 rounded-md">
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Broadcast Announcement</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateBroadcast} className="space-y-4">
                    <div>
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Gym Holiday Announcement"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="body">Message Content</Label>
                      <Textarea
                        id="body"
                        value={body}
                        onChange={(e) => setBody(e.target.value)}
                        placeholder="Detail of the announcement..."
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label htmlFor="kind">Announcement Kind</Label>
                      <select
                        id="kind"
                        value={kind}
                        onChange={(e) => setKind(e.target.value as any)}
                        className="w-full rounded-md border border-input bg-card py-2 px-3 text-sm outline-none transition focus:border-ring"
                      >
                        <option value="info">Information (Purple)</option>
                        <option value="success">Success (Green)</option>
                        <option value="warning">Warning (Yellow)</option>
                        <option value="reminder">Reminder (Blue)</option>
                      </select>
                    </div>
                    <DialogFooter>
                      <Button type="submit" disabled={busy} className="gradient-primary text-primary-foreground w-full">
                        {busy ? "Publishing..." : "Broadcast to All Members"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto pt-1 scrollbar-none divide-y divide-border/40">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No announcements yet.
              </div>
            ) : (
              notifications.map((notif) => (
                <div key={notif.id} className="flex gap-2.5 p-2.5 transition hover:bg-accent/40 rounded-lg">
                  <div className="mt-0.5 shrink-0 grid h-7 w-7 place-items-center rounded-lg bg-muted">
                    {getIcon(notif.kind)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-xs font-semibold text-foreground truncate">{notif.title}</p>
                      <span className="shrink-0 text-[9px] text-muted-foreground">{formatRelativeTime(notif.created_at)}</span>
                    </div>
                    {notif.body && (
                      <p className="mt-0.5 text-[10px] text-muted-foreground leading-relaxed break-words">{notif.body}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
