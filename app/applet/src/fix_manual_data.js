
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: users } = await supabase.from('users').select('*').eq('email', 'efariaseng0@gmail.com');
  const userId = users[0].id;

  const date16 = '2026-04-16';
  const { data: acts16 } = await supabase.from('operational_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', `${date16}T00:00:00Z`)
    .lte('start_time', `${date16}T23:59:59Z`);

  console.log("Activities on 16/04:");
  acts16?.forEach(a => console.log(`${a.id} | ${a.activity_name} | ${a.start_time} - ${a.end_time}`));

  // Delete P&D activities on 16/04
  const pdActs = acts16?.filter(a => a.activity_name === 'P&D');
  if (pdActs && pdActs.length > 0) {
    console.log("Deleting P&D activities...");
    const { error } = await supabase.from('operational_activities').delete().in('id', pdActs.map(a => a.id));
    if (error) console.error("Error deleting:", error);
    else console.log("Deleted.");
  }

  // Check 17/04
  const date17 = '2026-04-17';
  const { data: acts17 } = await supabase.from('operational_activities')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', `${date17}T00:00:00Z`)
    .lte('start_time', `${date17}T23:59:59Z`);
  console.log("\nActivities on 17/04:");
  acts17?.forEach(a => console.log(`${a.id} | ${a.activity_name} | ${a.start_time} - ${a.end_time}`));

  // Check projects
  const { data: projs } = await supabase.from('projects')
    .select('*')
    .eq('user_id', userId)
    .gte('start_time', `${date16}T00:00:00Z`);
  console.log("\nProjects since 16/04:");
  projs?.forEach(p => console.log(`${p.id} | ${p.ns} | ${p.start_time} | ${p.status} | end: ${p.end_time}`));
}

run();
