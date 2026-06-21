-- Allow the public (anon) and authenticated users to read specific settings keys
GRANT SELECT ON public.system_settings TO anon;

DROP POLICY IF EXISTS "public_read_settings_keys" ON public.system_settings;

CREATE POLICY "public_read_settings_keys" ON public.system_settings
  FOR SELECT TO anon, authenticated
  USING (key IN ('gym_rules', 'landing_banners', 'gym_photos'));

-- Seed Gym Rules
INSERT INTO public.system_settings (key, value)
VALUES (
  'gym_rules',
  '{
    "rules": [
      {"id": "1", "text": "WE DO NOT PROVIDE ANY KIND OF FREE TRIAL.", "icon": "Ban"},
      {"id": "2", "text": "IF THE GYM PLAYLIST IS NOT TO YOUR LIKING, PLEASE USE YOUR HEADPHONES.", "icon": "Headphones"},
      {"id": "3", "text": "USE A TOWEL ON EVERY BENCH AND MACHINE.", "icon": "Flame"},
      {"id": "4", "text": "BRING YOUR OWN TOWEL. WORKOUT WITHOUT A TOWEL IS NOT ALLOWED.", "icon": "Flame"},
      {"id": "5", "text": "RETURN ALL WEIGHTS TO THEIR DESIGNATED PLACE AFTER USE.", "icon": "Dumbbell"},
      {"id": "6", "text": "DROPPING OR SLAMMING WEIGHTS IS STRICTLY PROHIBITED.", "icon": "AlertTriangle"},
      {"id": "7", "text": "TOBACCO, GUTKHA AND SMOKING ARE STRICTLY PROHIBITED.", "icon": "Ban"},
      {"id": "8", "text": "USE DEODORANT AND MAINTAIN PERSONAL HYGIENE.", "icon": "Sparkles"},
      {"id": "9", "text": "NO OUTSIDE SHOES ALLOWED. KINDLY CARRY A PAIR OF NEAT & CLEAN SHOES TO MAINTAIN HYGIENE.", "icon": "Footprints"}
    ],
    "message": {
      "respect_gym": "RESPECT THE GYM",
      "respect_equipment": "RESPECT THE EQUIPMENT",
      "keep_clean": "KEEP IT CLEAN"
    },
    "instagram": "@tankbytapan"
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed Landing Banners
INSERT INTO public.system_settings (key, value)
VALUES (
  'landing_banners',
  '[
    {
      "image": "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?q=80&w=1600&auto=format&fit=crop",
      "title": "Drip Sweat, Track Growth",
      "description": "Welcome to the ultimate arena of performance. Heavy plates, elite coaches, and a dedicated community.",
      "link": "/auth"
    },
    {
      "image": "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1600&auto=format&fit=crop",
      "title": "Build Your Legend",
      "description": "Unleash your true potential with premium equipment and training programs tailored for you.",
      "link": "/auth"
    },
    {
      "image": "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?q=80&w=1600&auto=format&fit=crop",
      "title": "Tank by Tapan",
      "description": "No shortcuts. Just consistency, community, and results. Join today.",
      "link": "/auth"
    }
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Seed Gym Photos
INSERT INTO public.system_settings (key, value)
VALUES (
  'gym_photos',
  '[
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1593079831268-3381b0db4a77?q=80&w=800&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1519315901367-f34ff9154487?q=80&w=800&auto=format&fit=crop"
  ]'::jsonb
)
ON CONFLICT (key) DO NOTHING;
