import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Fetch user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id);

    const userRoles = ((roles ?? []) as Array<{ role: string }>).map((x) => x.role);
    const isStaff = userRoles.includes("admin") || userRoles.includes("front_desk");

    const restrictedPaths = ["/employees", "/expenses", "/audit", "/billing"];
    const isRestricted = restrictedPaths.some((p) => location.pathname.startsWith(p));

    if (!isStaff && isRestricted) {
      throw redirect({ to: "/dashboard" });
    }

    return { user: data.user };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
