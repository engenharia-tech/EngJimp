
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase config in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function dump() {
  const { data: users } = await supabase.from('users').select('*').eq('email', 'efariaseng0@gmail.com');
  if (!users || users.length === 0) {
    console.error("User not found");
    return;
  }
  const userId = users[0].id;
  console.log("User found:", userId);

  const { data: projects } = await supabase.from('projects').select('*').eq('user_id', userId).order('start_time', { ascending: false });
  console.log("\nPROJECTS:");
  projects?.forEach(p => console.log(`${p.ns} | ${p.start_time} - ${p.end_time || 'ACTIVE'} | ${p.status}`));

  const { data: activities } = await supabase.from('operational_activities').select('*').eq('user_id', userId).order('start_time', { ascending: false });
  console.log("\nACTIVITIES:");
  activities?.forEach(a => console.log(`${a.activity_name} | ${a.start_time} - ${a.end_time || 'ACTIVE'}`));
}

dump();
