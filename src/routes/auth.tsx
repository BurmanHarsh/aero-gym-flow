import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dumbbell, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Tank by Tapan" }] }),
  component: AuthPage,
});

function AuthPage() {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let redirected = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !redirected) {
        redirected = true;
        window.location.href = "/dashboard";
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleGoogle() {
    setLoading(true);
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setLoading(false);
    }
  }

  return (
    <div className="relative grid min-h-screen md:grid-cols-2">
      {/* Left visual panel */}
      <div className="relative hidden overflow-hidden md:block">
        <div className="absolute inset-0 gradient-primary" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)",
            backgroundSize: "60px 60px, 90px 90px",
          }}
        />
        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-primary-foreground">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur shadow-glow">
              <Dumbbell className="h-6 w-6" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Tank by <span className="opacity-70">Tapan</span>
            </span>
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-black leading-tight tracking-tight">
              The operating system<br />for modern gyms.
            </h2>
            <p className="max-w-md text-base text-primary-foreground/75 leading-relaxed">
              One dashboard for members, attendance, billing, inventory, and analytics. Built for daily operations.
            </p>
          </div>
          <div className="text-xs text-primary-foreground/50">© Tank by Tapan · All rights reserved</div>
        </div>
      </div>

      {/* Right sign-in panel */}
      <div className="relative flex items-center justify-center bg-background px-6 py-12">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "var(--gradient-glow)" }}
        />
        <div className="relative z-10 w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 md:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary shadow-glow">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">
              Tank by <span className="text-muted-foreground">Tapan</span>
            </span>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-3xl font-black tracking-tight">Welcome back</h1>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              Sign in with your Google account to access your gym dashboard.
            </p>
          </div>

          {/* Google button */}
          <div className="space-y-4">
            <Button
              id="google-signin-btn"
              onClick={handleGoogle}
              disabled={loading}
              variant="outline"
              className="w-full h-12 text-sm font-semibold border-border/80 hover:border-primary/40 hover:bg-accent/30 transition-all"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <svg className="mr-3 h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.3 1.8 14.9 1 12 1 7.4 1 3.5 3.5 1.7 7.3l3.5 2.7C6.1 7 8.8 5 12 5z"/>
                  <path fill="#34A853" d="M5.2 14L1.7 16.7C3.5 20.5 7.4 23 12 23c2.9 0 5.4-.95 7.2-2.6l-3.5-2.7c-1 .67-2.3 1.05-3.7 1.05-3.2 0-5.9-2-6.8-4.75z"/>
                  <path fill="#4A90E2" d="M23 12c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.5l3.5 2.7C21.4 18.4 23 15.5 23 12z"/>
                  <path fill="#FBBC05" d="M5.2 10C5 9.4 4.9 8.7 4.9 8s.1-1.4.3-2L1.7 3.3C.6 5.4 0 7.6 0 10c0 2.4.6 4.6 1.7 6.7L5.2 14z"/>
                </svg>
              )}
              Continue with Google
            </Button>

            <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 text-center">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Access is restricted to authorised gym staff and members only.
                If you don't have access, contact your gym administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
