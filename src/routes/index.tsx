import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { 
  ArrowRight, 
  Award, 
  Flame, 
  Trophy, 
  Sparkles, 
  Check, 
  ChevronDown, 
  HelpCircle, 
  Activity, 
  Star, 
  ShieldCheck, 
  Clock, 
  Users 
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tank by Tapan — Elite Gym & Strength Club" },
      { name: "description", content: "Drip sweat, track growth, and build legends at Tank by Tapan. Premium equipment, expert coaching, and dynamic pricing." },
    ],
  }),
  component: Landing,
});

interface DBPlan {
  id: string;
  name: string;
  description: string | null;
  duration_days: number;
  price_cents: number;
  active: boolean;
  photo_url: string | null;
}

function fmtMoney(cents: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function Landing() {
  const [authed, setAuthed] = useState(false);
  const [plans, setPlans] = useState<DBPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));

    async function loadPlans() {
      try {
        const { data, error } = await supabase
          .from("membership_plans")
          .select("*")
          .eq("active", true)
          .order("price_cents", { ascending: true });
        
        if (error) throw error;
        setPlans((data ?? []) as DBPlan[]);
      } catch (err) {
        console.error("Failed to load membership plans:", err);
      } finally {
        setPlansLoading(false);
      }
    }
    loadPlans();
  }, []);

  const faqs = [
    {
      q: "What are the gym operating hours?",
      a: "Monday to Saturday: Morning 5:00 AM to 10:00 AM, and Evening 4:30 PM to 9:30 PM. (Closed on Sundays)"
    },
    {
      q: "Do you offer personal training services?",
      a: "Yes, we offer personal training & we have transformation packages as per your goal."
    },
    {
      q: "Can I pause, cancel, or transfer my membership?",
      a: "No, you cannot pause, cancel, or transfer your membership."
    }
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background">
      {/* Full Page Gym Image Background */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none">
        <div 
          className="h-full w-full bg-cover bg-center opacity-[0.45]" 
          style={{ backgroundImage: `url('/gym-bg.jpg')` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/55 to-black/85" />
      </div>

      {/* Glow overlays */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-60" style={{ background: "var(--gradient-glow)" }} />
      <div className="pointer-events-none absolute -bottom-32 left-1/2 h-[400px] w-[700px] -translate-x-1/2 opacity-40" style={{ background: "radial-gradient(circle, oklch(0.70 0.20 295 / 0.3), transparent 70%)" }} />

      {/* Nav Header */}
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Tank by Tapan Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-contain bg-white p-0.5 shadow-glow"
          />
          <span className="text-lg font-bold tracking-tight text-sidebar-foreground">
            Tank by <span className="text-primary font-black">Tapan</span>
          </span>
        </div>
        <Link
          to={authed ? "/dashboard" : "/auth"}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-105"
        >
          {authed ? "Open dashboard" : "Sign in"} <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-16 pt-20 text-center">
        <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Tank Strength & Conditioning Club
        </div>
        <h1 className="text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Drip Sweat. Track Growth. <br />
          <span className="gradient-text">Build Legends</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground/90">
          Welcome to the ultimate arena of performance. Combining heavy plate-loaded iron, expert coach-led programs, and a dedicated community to forge athletic excellence.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to={authed ? "/dashboard" : "/auth"} className="rounded-xl gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-glow transition-transform hover:scale-105">
            {authed ? "Access Portal" : "Join the Gym"}
          </Link>
          <a href="#plans" className="rounded-xl border border-border bg-card/40 px-6 py-3 text-sm font-semibold backdrop-blur transition hover:bg-card">
            View Plans
          </a>
        </div>
      </section>

      {/* Value Proposition Grid */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-md">
          {[
            { value: "Expert Coaching", label: "1-on-1 Guidance", desc: "Every workout supervised" },
            { value: "Strength Focused", label: "Premium Equipment", desc: "Built for serious training" },
            { value: "Community Driven", label: "Supportive Environment", desc: "Train with like-minded people" },
            { value: "Goal Oriented", label: "Track Progress", desc: "See measurable results" }
          ].map((stat, i) => (
            <div key={i} className="text-center group p-2">
              <div className="text-base md:text-lg font-bold text-foreground group-hover:scale-105 transition-transform duration-300">{stat.value}</div>
              <div className="text-xs md:text-sm font-semibold text-primary mt-1.5">{stat.label}</div>
              <div className="text-[10px] md:text-xs text-muted-foreground mt-1 leading-relaxed">{stat.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Elite Facilities Showcase */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">State-Of-The-Art Facilities</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Explore our custom-built zones designed to optimize strength, performance, and recovery.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { 
              icon: Trophy, 
              title: "Elite Strength Zone", 
              desc: "Hammer Strength plate-loaded equipment, Olympic platforms, and free weights up to 75kg." 
            },
            { 
              icon: Activity, 
              title: "Performance Cardio", 
              desc: "Woodway curves, Concept2 ergs, and Assault bikes integrated with digital trackers." 
            },
            { 
              icon: Flame, 
              title: "HIIT & Conditioning", 
              desc: "Functional astroturf tracks, kettlebells, battle ropes, and specialized coach-led classes." 
            },
            { 
              icon: Sparkles, 
              title: "Recovery & Nutrition", 
              desc: "Post-workout shake bar, premium locker rooms, dry saunas, and steam showers." 
            }
          ].map((fac, i) => (
            <div key={i} className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-card/70">
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                <fac.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">{fac.title}</h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">{fac.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing / Membership Plans Grid */}
      <section id="plans" className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Membership Plans</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Pick your tier and start training today. No hidden enrollment fees.
          </p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-10">
            <span className="text-sm text-muted-foreground animate-pulse">Loading plans...</span>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl p-12 bg-card/25 max-w-md mx-auto">
            No active plans are currently listed. Please contact the front desk.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 justify-center max-w-5xl mx-auto">
            {plans.map((p) => {
              const isPopular = p.name.toLowerCase().includes("popular") || p.name.toLowerCase().includes("gold") || p.name.toLowerCase().includes("standard");
              return (
                <div 
                  key={p.id} 
                  className={`relative flex flex-col justify-between overflow-hidden rounded-3xl border p-6 backdrop-blur-sm transition-all duration-300 ${
                    isPopular 
                      ? "border-primary bg-card/70 shadow-glow hover:scale-[1.02]" 
                      : "border-border bg-card/40 hover:-translate-y-1 hover:bg-card/60"
                  }`}
                >
                  {isPopular && (
                    <span className="absolute right-4 top-4 rounded-full bg-primary/20 border border-primary/30 px-2.5 py-0.5 text-[9px] font-semibold text-primary uppercase tracking-wider">
                      Most Popular
                    </span>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                    <p className="mt-2 text-xs text-muted-foreground min-h-[32px]">{p.description || "Full access to facilities and trainer guidance."}</p>
                    
                    <div className="mt-5 flex items-baseline">
                      <span className="text-3xl font-black tracking-tight text-foreground">{fmtMoney(p.price_cents)}</span>
                      <span className="text-xs text-muted-foreground ml-2">/ {p.duration_days} days</span>
                    </div>

                    <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        <span>24/7 Gym & Facility Access</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        <span>Premium locker rooms & saunas</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-success shrink-0" />
                        <span>Free initial evaluation with coach</span>
                      </li>
                    </ul>
                  </div>

                  <div className="mt-8">
                    <Link 
                      to={authed ? "/dashboard" : "/auth"} 
                      className={`block w-full rounded-xl py-2.5 text-center text-xs font-semibold shadow transition-all duration-300 ${
                        isPopular 
                          ? "gradient-primary text-primary-foreground hover:opacity-90" 
                          : "bg-muted text-foreground border border-border hover:bg-muted/80"
                      }`}
                    >
                      {authed ? "Purchase in Dashboard" : "Get Started Now"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Athlete Testimonials */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">What Our Athletes Say</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Hear from members who have transformed their performance at Tank by Tapan.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {[
            {
              name: "Rajesh K.",
              role: "Competitive Powerlifter",
              text: "The equipment quality here is unmatched. Finding a gym with certified Hammer Strength gear and 75kg dumbbells was impossible until Tank by Tapan opened. The atmosphere is purely focused on hard work."
            },
            {
              name: "Priya M.",
              role: "Marathon Runner",
              text: "I love the cardio deck and recovery options. Being able to hit my speed workouts on Woodway treadmills and immediately follow up with dry sauna recovery has been a game-changer for my training cycles."
            },
            {
              name: "Vikram S.",
              role: "Strength Athlete",
              text: "Incredible staff and community. The front desk team is professional, personal coaching is top-tier, and the members motivate you to push your limits in every session."
            }
          ].map((t, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm flex flex-col justify-between">
              <div>
                <div className="flex gap-1 mb-4 text-primary">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-primary" />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground/90 italic leading-relaxed">"{t.text}"</p>
              </div>
              <div className="mt-6 border-t border-border/60 pt-4">
                <div className="text-sm font-semibold text-foreground">{t.name}</div>
                <div className="text-[10px] text-primary mt-0.5">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Frequently Asked Questions</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Got questions? We've got answers.
          </p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-card/45 p-6 backdrop-blur-md">
          {faqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div 
                key={idx} 
                className="border-b border-border/80 pb-3 last:border-0 last:pb-0"
              >
                <button
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  className="flex w-full items-center justify-between py-2 text-left transition hover:text-primary"
                >
                  <span className="text-sm font-medium text-foreground">{faq.q}</span>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`} />
                </button>
                <div 
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen ? "max-h-[200px] mt-2 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="text-xs text-muted-foreground leading-relaxed pl-1">
                    {faq.a}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/50 px-6 py-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Tank by Tapan. All rights reserved.
      </footer>
    </div>
  );
}
