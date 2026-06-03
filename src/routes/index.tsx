import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dumbbell, BarChart3, Users, QrCode, Wallet, ShieldCheck, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AeroGym OS — Run your gym like a SaaS" },
      { name: "description", content: "Members, attendance, billing, and analytics — the modern operating system for premium gyms." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px]" style={{ background: "var(--gradient-glow)" }} />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 h-[400px] w-[700px] -translate-x-1/2 opacity-40" style={{ background: "radial-gradient(circle, oklch(0.70 0.20 295 / 0.3), transparent 70%)" }} />

      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-primary shadow-glow">
            <Dumbbell className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-semibold tracking-tight">AeroGym <span className="text-muted-foreground">OS</span></span>
        </div>
        <Link
          to={authed ? "/dashboard" : "/auth"}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-105"
        >
          {authed ? "Open dashboard" : "Sign in"} <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24 pt-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Built for modern gyms
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Run your gym like a <span className="gradient-text">SaaS</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          Members, attendance, invoices, leads and analytics — unified in one beautiful operating system.
          Built with microservices, secured by RLS, designed for daily use.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to={authed ? "/dashboard" : "/auth"} className="rounded-xl gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105">
            {authed ? "Open dashboard" : "Get started — it's free"}
          </Link>
          <a href="#features" className="rounded-xl border border-border bg-card/40 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-card">
            See features
          </a>
        </div>
      </section>

      {/* Features grid */}
      <section id="features" className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 gap-4 px-6 pb-32 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { icon: Users, title: "Members & leads", desc: "CRUD, plans, expiry tracking, lead funnel and conversions." },
          { icon: QrCode, title: "Attendance", desc: "QR check-in, biometric simulation, live floor feed." },
          { icon: Wallet, title: "Billing", desc: "Invoices, UPI, cash and card payments with revenue analytics." },
          { icon: BarChart3, title: "Analytics", desc: "Revenue trends, attendance growth, conversion metrics." },
          { icon: ShieldCheck, title: "Audit & roles", desc: "Immutable audit log, admin / front-desk RBAC." },
          { icon: Dumbbell, title: "Native mobile", desc: "Bottom nav, glassmorphism, swipe-first design." },
        ].map((f) => (
          <div key={f.title} className="group relative overflow-hidden rounded-2xl glass p-6 transition hover:-translate-y-1 hover:surface-glow">
            <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <f.icon className="h-5 w-5" />
            </div>
            <h3 className="text-base font-semibold">{f.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
          </div>
        ))}
      </section>

      <footer className="relative z-10 border-t border-border/50 px-6 py-8 text-center text-xs text-muted-foreground">
        AeroGym OS · Built on Lovable
      </footer>
    </div>
  );
}
