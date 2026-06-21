import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import useEmblaCarousel from "embla-carousel-react";
import { useServerFn } from "@tanstack/react-start";
import { sendContactMessage } from "@/lib/aerogym/email.functions";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flame,
  Trophy,
  Activity,
  Sparkles,
  MapPin,
  Mail,
  Phone,
  User,
  Send,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tank by Tapan — Elite Gym & Strength Club" },
      {
        name: "description",
        content:
          "Drip sweat, track growth, and build legends at Tank by Tapan. Premium equipment, expert coaching, and dynamic pricing.",
      },
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

interface Banner {
  image: string;
  title: string;
  description: string;
  link: string;
}

function Landing() {
  const [authed, setAuthed] = useState<boolean>(() => {
    // Pre-seed from sessionStorage to avoid race condition on first render
    if (typeof window === "undefined") return false;
    return sessionStorage.getItem("tbt_authed") === "1";
  });
  const sendQuery = useServerFn(sendContactMessage);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [sendingQuery, setSendingQuery] = useState(false);

  async function handleContactSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sendingQuery) return;

    setSendingQuery(true);
    try {
      await sendQuery({
        data: {
          name: contactName,
          email: contactEmail,
          phone: contactPhone || undefined,
          message: contactMessage,
        },
      });
      toast.success("Query sent successfully! We'll contact you soon.");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setContactMessage("");
    } catch (err: any) {
      toast.error(err.message || "Failed to send contact query.");
    } finally {
      setSendingQuery(false);
    }
  }

  const [plans, setPlans] = useState<DBPlan[]>([]);
  const [plansLoading, setPlansLoading] = useState(true);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Slider & Gallery States
  const [banners, setBanners] = useState<Banner[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

  const scrollPrev = useCallback(() => emblaApi && emblaApi.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi && emblaApi.scrollNext(), [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    
    // Autoplay slider every 6s
    const interval = setInterval(() => {
      emblaApi.scrollNext();
    }, 6000);

    return () => {
      emblaApi.off("select", onSelect);
      clearInterval(interval);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const isAuthed = !!data.session;
      setAuthed(isAuthed);
      if (isAuthed) sessionStorage.setItem("tbt_authed", "1");
      else sessionStorage.removeItem("tbt_authed");
    });

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

    async function loadLandingCustomizations() {
      try {
        const [{ data: bannerRow }, { data: photoRow }] = await Promise.all([
          supabase.from("system_settings").select("value").eq("key", "landing_banners").maybeSingle(),
          supabase.from("system_settings").select("value").eq("key", "gym_photos").maybeSingle(),
        ]);

        if (bannerRow?.value) {
          setBanners(bannerRow.value as any as Banner[]);
        } else {
          setBanners([
            {
              image: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1600&auto=format&fit=crop",
              title: "Drip Sweat, Track Growth",
              description: "Welcome to the ultimate arena of performance. Heavy plates, elite coaches, and a dedicated community.",
              link: "/auth",
            },
            {
              image: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1600&auto=format&fit=crop",
              title: "Build Your Legend",
              description: "Unleash your true potential with premium equipment and training programs tailored for you.",
              link: "/auth",
            },
            {
              image: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1600&auto=format&fit=crop",
              title: "Tank by Tapan",
              description: "No shortcuts. Just consistency, community, and results. Join today.",
              link: "/auth",
            }
          ]);
        }

        if (photoRow?.value) {
          setPhotos(photoRow.value as any as string[]);
        } else {
          setPhotos([
            "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1593079831268-3381b0db4a77?q=80&w=800&auto=format&fit=crop",
            "https://images.unsplash.com/photo-1519315901367-f34ff9154487?q=80&w=800&auto=format&fit=crop"
          ]);
        }
      } catch (err) {
        console.error("Failed to load slider & gallery configurations:", err);
      }
    }

    loadPlans();
    loadLandingCustomizations();
  }, []);

  const faqs = [
    {
      q: "What are the gym operating hours?",
      a: "Monday to Saturday: Morning 5:00 AM to 10:00 AM, and Evening 4:30 PM to 9:30 PM. (Closed on Sundays)",
    },
    {
      q: "Do you offer personal training services?",
      a: "Yes, we offer personal training & we have transformation packages as per your goal.",
    },
    {
      q: "Can I pause, cancel, or transfer my membership?",
      a: "No, you cannot pause, cancel, or transfer your membership.",
    },
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
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[600px] opacity-60"
        style={{ background: "var(--gradient-glow)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-32 left-1/2 h-[400px] w-[700px] -translate-x-1/2 opacity-40"
        style={{
          background:
            "radial-gradient(circle, oklch(0.70 0.20 295 / 0.3), transparent 70%)",
        }}
      />

      {/* Navbar — sits above the banner, not overlapping it */}
      <header className="relative z-20 flex items-center justify-between px-5 sm:px-10 py-4 border-b border-white/10 bg-black/30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Tank by Tapan Logo"
            className="h-9 w-9 shrink-0 rounded-xl object-contain bg-white p-0.5 shadow-glow"
          />
          <span className="text-lg font-bold tracking-tight text-white">
            Tank by <span className="text-primary font-black">Tapan</span>
          </span>
        </div>
        <Link
          to={authed ? "/dashboard" : "/auth"}
          className="inline-flex items-center gap-2 rounded-lg gradient-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-glow transition-transform hover:scale-105"
        >
          {authed ? "Open dashboard" : "Sign in"}{" "}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      {/* Fixed-Height Banner Carousel (Gold's Gym style) */}
      {banners.length > 0 && (
        <section className="relative z-10 w-full h-[260px] sm:h-[380px] md:h-[440px]">
          <div ref={emblaRef} className="h-full overflow-hidden">
            <div className="flex h-full">
              {banners.map((banner, idx) => {
                const isLast = idx === banners.length - 1;
                const hasText = banner.title && banner.title.trim() !== "";
                const slideLink = banner.link || (authed ? "/dashboard" : "/auth");

                const slideContent = (
                  <>
                    {/* Slide background */}
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url('${banner.image}')` }}
                    />
                    {/* Dark gradient overlay — only if there is text overlay to keep readable */}
                    {hasText && (
                      <>
                        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/20" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                      </>
                    )}

                    {/* Slide Content */}
                    {hasText && (
                      <div className="relative z-10 px-10 sm:px-16 md:px-20 max-w-2xl w-full space-y-3">
                        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 border border-primary/40 px-2.5 py-1 text-[9px] sm:text-[10px] font-bold text-primary uppercase tracking-widest">
                          <Flame className="h-2.5 w-2.5" /> Tank Strength & Conditioning
                        </div>
                        <h2 className="text-2xl sm:text-4xl md:text-5xl font-extrabold leading-tight text-white drop-shadow-lg">
                          {banner.title}
                        </h2>
                        <p className="text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-w-md hidden sm:block">
                          {banner.description}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Link
                            to={slideLink}
                            className="inline-flex items-center gap-2 rounded-lg gradient-primary px-5 py-2 sm:px-6 sm:py-2.5 text-xs sm:text-sm font-bold text-primary-foreground shadow-glow transition-all hover:scale-105 hover:brightness-110"
                          >
                            {authed ? "Open Portal" : (isLast ? "Join the Gym" : "Get Started")}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Link>
                          {idx === 0 && !authed && (
                            <a
                              href="#plans"
                              className="hidden sm:inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 backdrop-blur-sm px-5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-all"
                            >
                              View Plans <ChevronDown className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );

                return (
                  <div
                    key={idx}
                    className="relative min-w-0 shrink-0 grow-0 basis-full h-full flex items-center"
                  >
                    {!hasText ? (
                      <Link to={slideLink} className="absolute inset-0 z-20 block w-full h-full cursor-pointer">
                        {slideContent}
                      </Link>
                    ) : (
                      slideContent
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Prev / Next arrow buttons — outside the slides, vertically centred */}
          {banners.length > 1 && (
            <>
              <button
                onClick={scrollPrev}
                aria-label="Previous slide"
                className="absolute left-3 sm:left-5 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary border border-white/20 transition-all duration-200"
              >
                <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>
              <button
                onClick={scrollNext}
                aria-label="Next slide"
                className="absolute right-3 sm:right-5 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-full bg-black/60 text-white hover:bg-primary border border-white/20 transition-all duration-200"
              >
                <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
              </button>

              {/* Dot indicators */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5">
                {banners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => emblaApi?.scrollTo(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      selectedIndex === i
                        ? "w-6 h-2 bg-primary"
                        : "w-2 h-2 bg-white/40 hover:bg-white/70"
                    }`}
                  />
                ))}
              </div>

              {/* Progress bar at very bottom */}
              <div className="absolute bottom-0 left-0 right-0 z-20 h-[3px] bg-white/10">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${((selectedIndex + 1) / banners.length) * 100}%` }}
                />
              </div>
            </>
          )}
        </section>
      )}

      {/* Value Proposition Grid */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-md">
          {[
            {
              value: "Expert Coaching",
              label: "1-on-1 Guidance",
              desc: "Every workout supervised",
            },
            {
              value: "Strength Focused",
              label: "Premium Equipment",
              desc: "Built for serious training",
            },
            {
              value: "Community Driven",
              label: "Supportive Environment",
              desc: "Train with like-minded people",
            },
            {
              value: "Goal Oriented",
              label: "Track Progress",
              desc: "See measurable results",
            },
          ].map((stat, i) => (
            <div key={i} className="text-center group p-2">
              <div className="text-base md:text-lg font-bold text-foreground group-hover:scale-105 transition-transform duration-300">
                {stat.value}
              </div>
              <div className="text-xs md:text-sm font-semibold text-primary mt-1.5">
                {stat.label}
              </div>
              <div className="text-[10px] md:text-xs text-muted-foreground mt-1 leading-relaxed">
                {stat.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Elite Facilities Showcase */}
      <section className="relative z-10 mx-auto max-w-6xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            State-Of-The-Art Facilities
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Explore our custom-built zones designed to optimize strength,
            performance, and recovery.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Trophy,
              title: "Elite Strength Zone",
              desc: "Hammer Strength plate-loaded equipment, Olympic platforms, and free weights up to 75kg.",
            },
            {
              icon: Activity,
              title: "Performance Cardio",
              desc: "Woodway curves, Concept2 ergs, and Assault bikes integrated with digital trackers.",
            },
            {
              icon: Flame,
              title: "HIIT & Conditioning",
              desc: "Functional astroturf tracks, kettlebells, battle ropes, and specialized coach-led classes.",
            },
            {
              icon: Sparkles,
              title: "Recovery & Nutrition",
              desc: "Post-workout shake bar, premium locker rooms, dry saunas, and steam showers.",
            },
          ].map((fac, i) => (
            <div
              key={i}
              className="group relative overflow-hidden rounded-2xl border border-border bg-card/40 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:bg-card/70"
            >
              <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                <fac.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {fac.title}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {fac.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing / Membership Plans Grid */}
      <section
        id="plans"
        className="relative z-10 mx-auto max-w-6xl px-6 py-20"
      >
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Membership Plans
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground">
            Pick your tier and start training today. No hidden enrollment fees.
          </p>
        </div>

        {plansLoading ? (
          <div className="flex justify-center py-10">
            <span className="text-sm text-muted-foreground animate-pulse">
              Loading plans...
            </span>
          </div>
        ) : plans.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm border border-dashed border-border rounded-2xl p-12 bg-card/25 max-w-md mx-auto">
            No active plans are currently listed. Please contact the front desk.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 justify-center max-w-5xl mx-auto">
            {plans.map((p) => {
              const isPopular =
                p.name.toLowerCase().includes("popular") ||
                p.name.toLowerCase().includes("gold") ||
                p.name.toLowerCase().includes("standard");
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
                    <h3 className="text-lg font-bold text-foreground">
                      {p.name}
                    </h3>
                    <p className="mt-2 text-xs text-muted-foreground min-h-[32px]">
                      {p.description ||
                        "Full access to facilities and trainer guidance."}
                    </p>

                    <div className="mt-5 flex items-baseline">
                      <span className="text-3xl font-black tracking-tight text-foreground">
                        {fmtMoney(p.price_cents)}
                      </span>
                      <span className="text-xs text-muted-foreground ml-2">
                        / {p.duration_days} days
                      </span>
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

      {/* Our Gym Gallery Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20 border-t border-border/20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
            Our Gym
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-muted-foreground font-semibold">
            Take a look inside Tank by Tapan. Explore our elite facilities, equipment, and training atmosphere.
          </p>
        </div>

        {photos.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-10">No photos uploaded yet.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {photos.slice(0, 4).map((photo, i) => (
              <div
                key={i}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card/45 aspect-square shadow-glow transition-all duration-300 hover:scale-[1.03] hover:border-primary/40"
              >
                <img
                  src={photo}
                  alt={`Gym facility ${i + 1}`}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                  <span className="text-[10px] font-black text-white uppercase tracking-wider">Facility View #{i + 1}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Location & Contact Section */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 py-20 border-t border-border/20">
        <div className="grid gap-10 md:grid-cols-2">
          {/* Left Column: Location */}
          <div className="space-y-6 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <MapPin className="h-3.5 w-3.5" /> Find Us
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
                Our Gym Location
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Come train with us in person! We are located at Kasganj, Uttar Pradesh, with premium workout spaces, heavy plates, and top-tier equipment.
              </p>
              
              <div className="space-y-3 pt-2">
                <div className="flex gap-3 items-start">
                  <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-foreground">Address</h4>
                    <p className="text-xs text-muted-foreground mt-0.5 font-medium">TaNK By TAPAN, Kasganj, Uttar Pradesh 207123</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Embedded Google Map */}
            <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-glow h-[280px] md:h-auto md:aspect-[4/3]">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3528.2713606622435!2d78.83082147610058!3d27.791470522197593!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x39751904b0e512a7%3A0xf120924df11203d3!2sTaNK%20By%20TAPAN!5e0!3m2!1sen!2sin!4v1718970000000!5m2!1sen!2sin"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-full w-full"
              />
            </div>
            
            <a
              href="https://www.google.com/maps/place/TaNK+By+TAPAN/@27.7914659,78.8333964,17z/data=!3m1!4b1!4m6!3m5!1s0x39751904b0e512a7:0xf120924df11203d3!8m2!3d27.7914659!4d78.8333964!16s%2Fg%2F11z7lgt4wz!18m1!1e1?entry=ttu&g_ep=EgoyMDI2MDYxNi4wIKXMDSoASAFQAw%3D%3D"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card hover:bg-muted/50 px-4 py-2.5 text-xs font-semibold text-foreground transition-all shadow-sm"
            >
              Open in Google Maps <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>

          {/* Right Column: Contact Us Form */}
          <div className="rounded-2xl border border-border bg-card/45 p-6 backdrop-blur-md space-y-6 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary">
                <Mail className="h-3.5 w-3.5" /> Contact
              </div>
              <h3 className="text-xl font-bold text-foreground">Have Questions?</h3>
              <p className="text-xs text-muted-foreground font-medium">
                Drop us a message below and our team will get back to you regarding membership options, queries, or personal training.
              </p>
            </div>

            <form onSubmit={handleContactSubmit} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Name</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                    <User className="h-4 w-4" />
                  </span>
                  <input
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full rounded-xl border border-border bg-background/50 py-2 pl-10 pr-4 text-xs placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Email</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                    </span>
                    <input
                      type="email"
                      required
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-border bg-background/50 py-2 pl-10 pr-4 text-xs placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Phone (Optional)</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                    </span>
                    <input
                      type="tel"
                      value={contactPhone}
                      onChange={(e) => setContactPhone(e.target.value)}
                      placeholder="10 digit number"
                      className="w-full rounded-xl border border-border bg-background/50 py-2 pl-10 pr-4 text-xs placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Message</label>
                <textarea
                  required
                  rows={4}
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  placeholder="How can we help you achieve your goals?"
                  className="w-full rounded-xl border border-border bg-background/50 p-3 text-xs placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={sendingQuery}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl gradient-primary py-2.5 text-xs font-semibold text-primary-foreground shadow-glow transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {sendingQuery ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" /> Send Message
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* FAQ Accordion Section */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Frequently Asked Questions
          </h2>
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
                  <span className="text-sm font-medium text-foreground">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-primary" : ""}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    isOpen
                      ? "max-h-[200px] mt-2 opacity-100"
                      : "max-h-0 opacity-0"
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
