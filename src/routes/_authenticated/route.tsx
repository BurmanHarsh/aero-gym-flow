import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

/* ─── Module-level auth cache ─────────────────────────────────── */
interface AuthCache {
  userId: string;
  email: string;
  roles: string[];
  fullName: string;
  avatarUrl: string;
  ts: number; // cache timestamp
}

let _cache: AuthCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getAuthCache(): AuthCache | null {
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) return _cache;
  return null;
}

export function clearAuthCache() {
  _cache = null;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Fast path: use cache if fresh
    const cached = getAuthCache();
    if (cached) {
      const isStaff = cached.roles.includes("admin") || cached.roles.includes("front_desk");
      const restrictedPaths = ["/employees", "/expenses", "/audit", "/billing", "/landing"];
      const isRestricted = restrictedPaths.some((p) => location.pathname.startsWith(p));
      if (!isStaff && isRestricted) throw redirect({ to: "/dashboard" });
      return { user: { id: cached.userId, email: cached.email } };
    }

    // Slow path: fetch session + roles + profile in parallel where possible
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth" });

    const [{ data: roles }, { data: profile }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", session.user.id),
      supabase.from("profiles").select("full_name, avatar_url").eq("id", session.user.id).maybeSingle(),
    ]);

    const userRoles = ((roles ?? []) as Array<{ role: string }>).map((x) => x.role);

    // Populate cache
    _cache = {
      userId: session.user.id,
      email: session.user.email ?? "",
      roles: userRoles,
      fullName: profile?.full_name ?? session.user.email ?? "",
      avatarUrl: profile?.avatar_url ?? "",
      ts: Date.now(),
    };

    const isStaff = userRoles.includes("admin") || userRoles.includes("front_desk");
    const restrictedPaths = ["/employees", "/expenses", "/audit", "/billing", "/landing"];
    const isRestricted = restrictedPaths.some((p) => location.pathname.startsWith(p));

    if (!isStaff && isRestricted) {
      throw redirect({ to: "/dashboard" });
    }

    return { user: session.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

