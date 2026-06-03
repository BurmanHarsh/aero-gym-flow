import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · AeroGym OS" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/dashboard", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard", replace: true });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Account created. You're in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen md:grid-cols-2">
      {/* Left visual */}
      <div className="relative hidden overflow-hidden md:block">
        <div className="absolute inset-0 gradient-primary" />
        <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)", backgroundSize: "60px 60px, 90px 90px" }} />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">
              <Dumbbell className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">AeroGym OS</span>
          </div>
          <div>
            <h2 className="text-4xl font-bold leading-tight">The operating system for modern gyms.</h2>
            <p className="mt-4 max-w-md text-base text-primary-foreground/80">
              One dashboard for members, attendance, billing, leads and analytics. Built for daily use.
            </p>
          </div>
          <div className="text-xs text-primary-foreground/70">© AeroGym OS</div>
        </div>
      </div>

      {/* Right form */}
      <div className="relative flex items-center justify-center bg-background px-6 py-12">
        <div className="pointer-events-none absolute inset-0" style={{ background: "var(--gradient-glow)" }} />
        <div className="relative z-10 w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 md:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold">AeroGym OS</span>
          </div>
          <h1 className="text-2xl font-bold">{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Sign in to continue to AeroGym OS." : "The first account becomes the gym admin."}
          </p>

          <Button onClick={handleGoogle} disabled={loading} variant="outline" className="mt-6 w-full">
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24"><path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.3 1.8 14.9 1 12 1 7.4 1 3.5 3.5 1.7 7.3l3.5 2.7C6.1 7 8.8 5 12 5z"/><path fill="#34A853" d="M5.2 14L1.7 16.7C3.5 20.5 7.4 23 12 23c2.9 0 5.4-.95 7.2-2.6l-3.5-2.7c-1 .67-2.3 1.05-3.7 1.05-3.2 0-5.9-2-6.8-4.75z"/><path fill="#4A90E2" d="M23 12c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.5l3.5 2.7C21.4 18.4 23 15.5 23 12z"/><path fill="#FBBC05" d="M5.2 10C5 9.4 4.9 8.7 4.9 8s.1-1.4.3-2L1.7 3.3C.6 5.4 0 7.6 0 10c0 2.4.6 4.6 1.7 6.7L5.2 14z"/></svg>
            Continue with Google
          </Button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            {mode === "signup" && (
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" required />
              </div>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gym.com" required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            <Button type="submit" disabled={loading} className="w-full gradient-primary text-primary-foreground shadow-glow hover:opacity-90">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "New to AeroGym?" : "Already have an account?"}{" "}
            <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="font-medium text-primary hover:underline">
              {mode === "signin" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
