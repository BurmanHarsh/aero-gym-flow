import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sun, Moon, Monitor, LogOut, ShieldCheck, Bell, UserCircle2, Palette, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings · Tank by Tapan" }] }),
  component: SettingsPage,
});

const TABS = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: UserCircle2 },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
] as const;

function SettingsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("appearance");
  const me = useCurrentUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab === "appearance" || urlTab === "account" || urlTab === "notifications" || urlTab === "security") {
      setTab(urlTab);
    }
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Settings</h1>
        <p className="text-sm text-muted-foreground">Personalize Tank by Tapan to fit how you work.</p>
      </header>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-card p-2 md:flex-col">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${active ? "bg-primary/12 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </nav>

        <div className="rounded-2xl border border-border bg-card p-6">
          {tab === "appearance" && <AppearanceTab />}
          {tab === "account" && <AccountTab me={me} />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "security" && <SecurityTab onLogout={logout} />}
        </div>
      </div>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const opts: Array<{ id: Theme; label: string; icon: typeof Sun }> = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold">Theme</h2>
        <p className="mt-1 text-sm text-muted-foreground">Choose how Tank by Tapan looks. The system option follows your device setting.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {opts.map((o) => {
          const Icon = o.icon; const active = theme === o.id;
          return (
            <button key={o.id} onClick={() => setTheme(o.id)} className={`group flex flex-col items-center gap-3 rounded-2xl border-2 p-5 transition ${active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}>
              <div className={`grid h-12 w-12 place-items-center rounded-xl transition ${active ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">{o.label}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AccountTab({ me }: { me: ReturnType<typeof useCurrentUser> }) {
  const [name, setName] = useState(me.fullName);
  const [phone, setPhone] = useState("");
  const [pw, setPw] = useState("");
  const [uploading, setUploading] = useState(false);
  const [avatar, setAvatar] = useState(me.avatarUrl);

  useEffect(() => { setName(me.fullName); }, [me.fullName]);
  useEffect(() => { setAvatar(me.avatarUrl); }, [me.avatarUrl]);
  useEffect(() => {
    if (!me.user) return;
    supabase.from("profiles").select("phone").eq("id", me.user.id).maybeSingle().then(({ data }) => setPhone(data?.phone ?? ""));
  }, [me.user]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !me.user) return;
    setUploading(true);

    const fileExt = file.name.split(".").pop();
    const filePath = `avatars/${me.user.id}-${Math.random()}.${fileExt}`;

    try {
      const { error: uploadError } = await supabase.storage.from("photos").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from("photos").getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", me.user.id);

      if (updateError) throw updateError;

      // Bidirectional sync: Also update members table if a member with the same email exists
      if (me.email) {
        await supabase
          .from("members")
          .update({ photo_url: publicUrl })
          .eq("email", me.email);
      }

      setAvatar(publicUrl);
      toast.success("Profile photo updated successfully");
      // Force reload auth state to update navbar
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!me.user) return;
    const { error } = await supabase.from("profiles").update({ full_name: name, phone }).eq("id", me.user.id);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: pw });
    if (error) return toast.error(error.message);
    toast.success("Password updated"); setPw("");
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-base font-semibold">Profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {me.email} · <span className="capitalize">{me.isAdmin ? "Admin" : "Front desk"}</span>
          {" · "}
          <label htmlFor="avatar-upload" className="cursor-pointer text-primary hover:underline">
            {avatar ? "Change photo" : "Upload photo"}
          </label>
          <input id="avatar-upload" type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploading} className="hidden" />
          {uploading && <span className="ml-2 text-xs text-muted-foreground animate-pulse">Uploading...</span>}
        </p>
      </div>

      {avatar && (
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <img src={avatar} alt={name} className="h-14 w-14 rounded-xl object-cover border border-border" />
          <button
            type="button"
            onClick={async () => {
              if (!me.user) return;
              const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", me.user.id);
              if (error) return toast.error(error.message);
              
              // Bidirectional sync: Also remove from members table if a member with the same email exists
              if (me.email) {
                await supabase.from("members").update({ photo_url: null }).eq("email", me.email);
              }

              setAvatar("");
              toast.success("Profile photo removed");
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="text-xs text-destructive hover:underline"
          >
            Remove photo
          </button>
        </div>
      )}

      <form onSubmit={saveProfile} className="space-y-3">
        <div><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <Button type="submit">Save profile</Button>
      </form>
      <div className="border-t border-border pt-6">
        <h2 className="text-base font-semibold">Change password</h2>
        <form onSubmit={changePassword} className="mt-3 space-y-3">
          <div><Label>New password</Label><Input type="password" minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
          <Button type="submit" disabled={!pw}>Update password</Button>
        </form>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [s, setS] = useState({ membershipExpiry: true, paymentReminders: true, leadFollowups: true, email: true });
  return (
    <div className="space-y-6">
      <div><h2 className="text-base font-semibold">Notification preferences</h2><p className="mt-1 text-sm text-muted-foreground">Control which alerts you receive and how.</p></div>
      <div className="divide-y divide-border">
        {([
          ["membershipExpiry", "Membership expiry reminders", "Remind 7 days before a member's plan expires."],
          ["paymentReminders", "Payment reminders", "Nudge members with pending invoices."],
          ["leadFollowups", "Lead follow-ups", "Get reminded to follow up on warm leads."],
          ["email", "Email notifications", "Send a daily summary to your inbox."],
        ] as const).map(([k, t, d]) => (
          <div key={k} className="flex items-start justify-between gap-4 py-4">
            <div><div className="text-sm font-medium">{t}</div><div className="text-xs text-muted-foreground">{d}</div></div>
            <Switch checked={s[k]} onCheckedChange={(v) => setS({ ...s, [k]: v })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SecurityTab({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="space-y-6">
      <div><h2 className="text-base font-semibold">Sessions & security</h2><p className="mt-1 text-sm text-muted-foreground">Manage your active session and sign out.</p></div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <div className="text-sm font-medium">This device</div>
        <div className="text-xs text-muted-foreground">{typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : ""}</div>
        <div className="mt-1 text-[11px] text-success">● Active now</div>
      </div>
      <Button onClick={onLogout} variant="destructive" className="w-full sm:w-auto">
        <LogOut className="mr-2 h-4 w-4" /> Sign out
      </Button>
    </div>
  );
}
