import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthCache, clearAuthCache } from "@/routes/_authenticated/route";
import type { User } from "@supabase/supabase-js";

export type AppRole = "admin" | "front_desk";

export interface CurrentUser {
  user: User | null;
  roles: AppRole[];
  isAdmin: boolean;
  isStaff: boolean;
  fullName: string;
  email: string;
  avatarUrl: string;
  loading: boolean;
}

export function useCurrentUser(): CurrentUser {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [fullName, setFullName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      // Fast path: read from the parent route's auth cache
      const cached = getAuthCache();
      if (cached) {
        // Still need to get the full User object for other consumers,
        // but getSession is instant if the session is already loaded in memory
        const { data } = await supabase.auth.getUser();
        if (!active) return;
        setUser(data.user);
        setRoles(cached.roles as AppRole[]);
        setFullName(cached.fullName);
        setAvatarUrl(cached.avatarUrl);
        setLoading(false);
        return;
      }

      // Slow path: no cache, fetch everything
      const { data } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user);
      if (data.user) {
        const [{ data: r }, { data: p }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", data.user.id),
          supabase.from("profiles").select("full_name, avatar_url").eq("id", data.user.id).maybeSingle(),
        ]);
        if (!active) return;
        setRoles(((r ?? []) as Array<{ role: AppRole }>).map((x) => x.role));
        setFullName(p?.full_name ?? data.user.email ?? "");
        setAvatarUrl(p?.avatar_url ?? "");
      }
      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      clearAuthCache(); // bust cache on auth changes
      load();
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return {
    user,
    roles,
    isAdmin: roles.includes("admin"),
    isStaff: roles.length > 0,
    fullName,
    email: user?.email ?? "",
    avatarUrl,
    loading,
  };
}

