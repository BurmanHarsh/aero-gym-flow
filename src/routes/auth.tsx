import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Loader2, Eye, EyeOff, Mail, Lock } from "lucide-react";
import { toast } from "sonner";
import { Turnstile } from "@marsidev/react-turnstile";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Tank by Tapan" }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [signupDone, setSignupDone] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileKey, setTurnstileKey] = useState(0);

  // Redirect to dashboard if already logged in
  useEffect(() => {
    let redirected = false;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session && !redirected) {
        redirected = true;
        window.location.replace("/dashboard");
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Reset form when switching mode
  function switchMode(next: Mode) {
    setMode(next);
    setPassword("");
    setConfirmPassword("");
    setSignupDone(false);
    setTurnstileToken(null);
    setTurnstileKey((prev) => prev + 1);
  }

  async function handleGoogle() {
    setGoogleLoading(true);
    const result = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/auth" },
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setGoogleLoading(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (!turnstileToken) {
      toast.error("Please complete the security check.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
      options: { captchaToken: turnstileToken }
    });
    if (error) {
      toast.error(error.message ?? "Sign in failed");
      // Reset CAPTCHA on failure
      setTurnstileToken(null);
      setTurnstileKey((prev) => prev + 1);
    }
    setLoading(false);
  }

  async function handleEmailSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (!turnstileToken) {
      toast.error("Please complete the security check.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin + "/auth",
        captchaToken: turnstileToken,
      },
    });
    if (error) {
      toast.error(error.message ?? "Sign up failed");
      // Reset CAPTCHA on failure
      setTurnstileToken(null);
      setTurnstileKey((prev) => prev + 1);
    } else {
      setSignupDone(true);
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      toast.error("Enter your email address first, then click Forgot Password");
      return;
    }
    if (!turnstileToken) {
      toast.error("Please complete the security check first.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/auth",
      captchaToken: turnstileToken,
    });
    if (error) {
      toast.error(error.message ?? "Failed to send reset email");
      setTurnstileToken(null);
      setTurnstileKey((prev) => prev + 1);
    } else {
      toast.success("Password reset email sent! Check your inbox.");
      setTurnstileToken(null);
      setTurnstileKey((prev) => prev + 1);
    }
    setLoading(false);
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
              Elevate your training.<br />Rule the gym floor.
            </h2>
            <p className="max-w-md text-base text-primary-foreground/75 leading-relaxed">
              Access your premium gym portal. Track your daily attendance, monitor your active membership plans, and achieve your peak performance.
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
        <div className="relative z-10 w-full max-w-sm space-y-6">
          {/* Mobile logo */}
          <div className="flex items-center gap-3 md:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl gradient-primary shadow-glow">
              <Dumbbell className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold">
              Tank by <span className="text-muted-foreground">Tapan</span>
            </span>
          </div>

          {/* Mode tab switcher */}
          <div className="flex rounded-xl border border-border bg-muted/30 p-1 gap-1">
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                mode === "signin"
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                mode === "signup"
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* Heading */}
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              {mode === "signin" ? "Welcome" : "Create an account"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {mode === "signin"
                ? "Sign in to access your gym dashboard."
                : "Sign up with your email to get started."}
            </p>
          </div>

          {/* Sign-up success state */}
          {signupDone ? (
            <div className="rounded-xl border border-success/30 bg-success/10 px-4 py-5 text-center space-y-2">
              <div className="text-2xl">📬</div>
              <p className="text-sm font-semibold text-foreground">Check your inbox!</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account, then sign in.
              </p>
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="mt-2 text-xs font-semibold text-primary hover:underline"
              >
                Back to Sign In →
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Email/Password Form */}
              <form
                onSubmit={mode === "signin" ? handleEmailSignIn : handleEmailSignUp}
                className="space-y-3"
              >
                {/* Email */}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-email" className="text-xs font-semibold">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="auth-email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="pl-9 h-11 text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <Label htmlFor="auth-password" className="text-xs font-semibold">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="auth-password"
                      type={showPass ? "text" : "password"}
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="pl-9 pr-10 h-11 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm password (sign up only) */}
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="auth-confirm" className="text-xs font-semibold">Confirm Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="auth-confirm"
                        type={showConfirm ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        className="pl-9 pr-10 h-11 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* Forgot password (sign in only) */}
                {mode === "signin" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={loading}
                      className="text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Turnstile Security Check */}
                <div className="flex justify-center py-2">
                  <Turnstile
                    key={turnstileKey}
                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || "0x4AAAAAADqObj9GnIuH3Kkn"}
                    options={{ theme: "dark" }}
                    onSuccess={(token) => setTurnstileToken(token)}
                    onError={() => setTurnstileToken(null)}
                    onExpire={() => setTurnstileToken(null)}
                  />
                </div>

                <Button
                  id={mode === "signin" ? "email-signin-btn" : "email-signup-btn"}
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 text-sm font-semibold gradient-primary text-primary-foreground shadow-glow hover:brightness-110 transition-all"
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {mode === "signin" ? "Sign In" : "Create Account"}
                </Button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground font-medium">or</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Google button */}
              <Button
                id="google-signin-btn"
                onClick={handleGoogle}
                disabled={googleLoading}
                variant="outline"
                className="w-full h-11 text-sm font-semibold border-border/80 hover:border-primary/40 hover:bg-accent/30 transition-all"
              >
                {googleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-3 h-4 w-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M12 5c1.6 0 3 .55 4.1 1.6l3-3C17.3 1.8 14.9 1 12 1 7.4 1 3.5 3.5 1.7 7.3l3.5 2.7C6.1 7 8.8 5 12 5z"/>
                    <path fill="#34A853" d="M5.2 14L1.7 16.7C3.5 20.5 7.4 23 12 23c2.9 0 5.4-.95 7.2-2.6l-3.5-2.7c-1 .67-2.3 1.05-3.7 1.05-3.2 0-5.9-2-6.8-4.75z"/>
                    <path fill="#4A90E2" d="M23 12c0-.8-.1-1.6-.2-2.3H12v4.5h6.2c-.3 1.4-1.1 2.6-2.3 3.5l3.5 2.7C21.4 18.4 23 15.5 23 12z"/>
                    <path fill="#FBBC05" d="M5.2 10C5 9.4 4.9 8.7 4.9 8s.1-1.4.3-2L1.7 3.3C.6 5.4 0 7.6 0 10c0 2.4.6 4.6 1.7 6.7L5.2 14z"/>
                  </svg>
                )}
                Continue with Google
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
