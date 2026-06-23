import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Read .env file manually
const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
});

const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE env vars", env);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const updatedValue = [
    {
      "link": "/auth",
      "image": "https://glpbwpabasoamygxfdbu.supabase.co/storage/v1/object/public/photos/banners/0.4931730270763758-1782028798100.png",
      "title": "",
      "description": ""
    },
    {
      "link": "/auth",
      "image": "https://glpbwpabasoamygxfdbu.supabase.co/storage/v1/object/public/photos/banners/0.9452237236974399-1782098143413.png",
      "title": "",
      "description": ""
    }
  ];

  const { error } = await supabase
    .from('system_settings')
    .update({ value: updatedValue })
    .eq('key', 'landing_banners');
  
  if (error) {
    console.error("Error updating banners:", error);
  } else {
    console.log("Successfully cleared banner titles and descriptions in DB!");
  }
}

run();
