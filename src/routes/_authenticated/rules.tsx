import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as Icons from "lucide-react";

export const Route = createFileRoute("/_authenticated/rules")({
  head: () => ({ meta: [{ title: "Rules & Regulations · Tank by Tapan" }] }),
  component: RulesPage,
});

interface GymRule {
  id: string;
  text: string;
  icon: string;
}

interface GymRulesData {
  rules: GymRule[];
  message: {
    respect_gym: string;
    respect_equipment: string;
    keep_clean: string;
  };
  instagram: string;
}

const AVAILABLE_ICONS = [
  "Ban",
  "Headphones",
  "Flame",
  "Dumbbell",
  "AlertTriangle",
  "Sparkles",
  "Footprints",
  "Layers",
  "Activity",
  "Info",
  "ShieldAlert",
  "Trash2",
  "Sparkle",
  "Smile"
];

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const IconComp = (Icons as any)[name] || Icons.HelpCircle;
  return <IconComp className={className} />;
}

function RulesPage() {
  const me = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<GymRulesData | null>(null);

  // Form states for editing
  const [rules, setRules] = useState<GymRule[]>([]);
  const [respectGym, setRespectGym] = useState("");
  const [respectEquipment, setRespectEquipment] = useState("");
  const [keepClean, setKeepClean] = useState("");
  const [instagram, setInstagram] = useState("");

  async function load() {
    try {
      setLoading(true);
      const { data: row, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "gym_rules")
        .maybeSingle();

      if (error) throw error;

      if (row?.value) {
        const parsed = row.value as any as GymRulesData;
        setData(parsed);
        setRules(parsed.rules ?? []);
        setRespectGym(parsed.message?.respect_gym ?? "RESPECT THE GYM");
        setRespectEquipment(parsed.message?.respect_equipment ?? "RESPECT THE EQUIPMENT");
        setKeepClean(parsed.message?.keep_clean ?? "KEEP IT CLEAN");
        setInstagram(parsed.instagram ?? "@tankbytapan");
      }
    } catch (e: any) {
      toast.error("Failed to load rules: " + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSave() {
    try {
      const payload: GymRulesData = {
        rules: rules.map((r, i) => ({ ...r, id: String(i + 1) })),
        message: {
          respect_gym: respectGym,
          respect_equipment: respectEquipment,
          keep_clean: keepClean,
        },
        instagram,
      };

      const { error } = await supabase
        .from("system_settings")
        .upsert({
          key: "gym_rules",
          value: payload as any,
          updated_by: me.user?.id,
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      setData(payload);
      setEditing(false);
      toast.success("Gym rules updated successfully!");
    } catch (e: any) {
      toast.error("Failed to save rules: " + e.message);
    }
  }

  function addRule() {
    setRules([...rules, { id: String(rules.length + 1), text: "", icon: "Info" }]);
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index));
  }

  function updateRule(index: number, fields: Partial<GymRule>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...fields } : r)));
  }

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Gym Rules</h1>
          <p className="text-sm text-muted-foreground">Standard guidelines and code of conduct at Tank by Tapan.</p>
        </div>
        {me.isAdmin && (
          <Button onClick={() => setEditing(!editing)} variant={editing ? "outline" : "default"}>
            {editing ? "Cancel Editing" : "Edit Rules"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-glow">
          <h2 className="text-lg font-bold">Edit Gym Rules & Banner</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Rules List</Label>
              <Button type="button" size="sm" onClick={addRule}>
                <Icons.Plus className="mr-1 h-3.5 w-3.5" /> Add Rule
              </Button>
            </div>

            <div className="space-y-3">
              {rules.map((rule, idx) => (
                <div key={idx} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-4 sm:flex-row sm:items-center">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-xs font-bold text-primary sm:h-9 sm:w-9">
                    {idx + 1}
                  </span>
                  
                  <Input
                    placeholder="Rule Description"
                    value={rule.text}
                    onChange={(e) => updateRule(idx, { text: e.target.value })}
                    className="flex-1"
                  />

                  <div className="flex items-center gap-2">
                    <select
                      value={rule.icon}
                      onChange={(e) => updateRule(idx, { icon: e.target.value })}
                      className="rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus:border-ring"
                    >
                      {AVAILABLE_ICONS.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                    <DynamicIcon name={rule.icon} className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    onClick={() => removeRule(idx)}
                    className="shrink-0"
                  >
                    <Icons.Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="border-t border-border pt-4">
              <Label className="text-sm font-semibold">Footer Messages</Label>
              <div className="grid gap-4 mt-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">Message 1</Label>
                  <Input value={respectGym} onChange={(e) => setRespectGym(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Message 2</Label>
                  <Input value={respectEquipment} onChange={(e) => setRespectEquipment(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Message 3</Label>
                  <Input value={keepClean} onChange={(e) => setKeepClean(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label className="text-sm font-semibold">Instagram Profile</Label>
                <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@username" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button onClick={() => setEditing(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground">
              Save Rules
            </Button>
          </div>
        </div>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-[#1f2747] bg-[#0b1020] p-6 text-center text-white sm:p-10">
          {/* Decorative radial glows */}
          <div className="absolute top-0 left-1/4 h-72 w-72 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 h-72 w-72 translate-y-1/2 rounded-full bg-secondary/10 blur-3xl" />

          {/* Flyer Header */}
          <div className="relative mb-8 text-center sm:mb-12">
            <h2 className="text-4xl font-extrabold tracking-wider text-white sm:text-5xl md:text-6xl font-sans">
              GYM <span className="text-primary">RULES</span>
            </h2>
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="h-[2px] w-20 bg-gradient-to-r from-transparent to-primary" />
              <Icons.Dumbbell className="h-6 w-6 text-primary shrink-0 rotate-45" />
              <div className="h-[2px] w-20 bg-gradient-to-l from-transparent to-primary" />
            </div>
          </div>

          {/* Flyer Cards Grid */}
          <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data?.rules.map((rule, idx) => (
              <div
                key={rule.id}
                className="group flex items-center gap-4 rounded-2xl border border-[#1f2747] bg-[#111733]/80 p-4 transition-all duration-300 hover:scale-[1.02] hover:border-primary/40 hover:bg-[#111733] hover:shadow-[0_0_20px_rgba(20,184,166,0.1)] text-left"
              >
                {/* Index Number */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-black text-primary-foreground shadow-glow">
                  {idx + 1}
                </div>

                <div className="flex-1 space-y-1">
                  {/* Icon + Title Row */}
                  <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
                      <DynamicIcon name={rule.icon} className="h-4 w-4" />
                    </div>
                  </div>
                  {/* Rule Text */}
                  <p className="text-xs font-bold leading-normal tracking-wide text-white uppercase sm:text-sm">
                    {rule.text}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Flyer Footer "OUR MESSAGE" */}
          <div className="relative mt-12 border-t border-[#1f2747] pt-8 sm:mt-16">
            <h3 className="text-lg font-black tracking-widest text-primary uppercase">
              OUR MESSAGE
            </h3>

            <div className="grid gap-6 mt-6 sm:grid-cols-3">
              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icons.Flame className="h-6 w-6" />
                </div>
                <span className="text-xs font-black tracking-wide text-slate-300 uppercase">
                  {respectGym}
                </span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icons.Dumbbell className="h-6 w-6" />
                </div>
                <span className="text-xs font-black tracking-wide text-slate-300 uppercase">
                  {respectEquipment}
                </span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icons.Sparkles className="h-6 w-6" />
                </div>
                <span className="text-xs font-black tracking-wide text-slate-300 uppercase">
                  {keepClean}
                </span>
              </div>
            </div>

            <p className="mt-8 text-xs font-semibold text-slate-400">
              Your cooperation helps us maintain a clean, safe and disciplined environment.
            </p>

            <a
              href={`https://instagram.com/${instagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-4 text-xs font-bold text-primary hover:underline"
            >
              <Icons.Instagram className="h-4 w-4" />
              {instagram}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
