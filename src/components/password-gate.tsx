import { useState, useEffect, type ReactNode, type FormEvent } from "react";
import { Lock, Unlock, Eye, EyeOff, ShieldAlert, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface PasswordGateProps {
  requiredPassword: string;
  storageKey: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function PasswordGate({
  requiredPassword,
  storageKey,
  title,
  subtitle = "Enter security password to access this section.",
  children,
}: PasswordGateProps) {
  const [unlocked, setUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem(storageKey) === "true";
  });

  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setUnlocked(sessionStorage.getItem(storageKey) === "true");
    }
  }, [storageKey]);

  const handleUnlock = (e: FormEvent) => {
    e.preventDefault();
    if (passwordInput === requiredPassword) {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(storageKey, "true");
      }
      setUnlocked(true);
      setError(null);
      setPasswordInput("");
      toast.success("Section unlocked successfully");
    } else {
      setError("Incorrect password. Access denied.");
      toast.error("Incorrect password!");
    }
  };

  const handleLock = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(storageKey);
    }
    setUnlocked(false);
    setPasswordInput("");
    setError(null);
    toast.info("Section locked");
  };

  if (unlocked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-4 py-2 text-xs backdrop-blur">
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Unlocked area: <strong className="text-foreground font-medium">{title}</strong></span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLock}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-card"
          >
            <Lock className="h-3.5 w-3.5" />
            Lock Section
          </Button>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-border/80 bg-card/90 p-8 shadow-2xl backdrop-blur-xl transition-all">
        <div className="text-center space-y-3">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 border border-primary/20 text-primary shadow-glow">
            <KeyRound className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-bold tracking-tight text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <form onSubmit={handleUnlock} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gate-password" className="text-xs font-medium text-muted-foreground">
              Security Password
            </Label>
            <div className="relative">
              <Input
                id="gate-password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter password..."
                value={passwordInput}
                onChange={(e) => {
                  setPasswordInput(e.target.value);
                  if (error) setError(null);
                }}
                className={`pr-10 ${error ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive mt-1">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full gradient-primary text-primary-foreground font-semibold shadow-lg">
            <Unlock className="mr-2 h-4 w-4" />
            Unlock Access
          </Button>
        </form>
      </div>
    </div>
  );
}
