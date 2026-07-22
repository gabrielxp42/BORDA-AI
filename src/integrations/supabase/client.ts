import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = "https://lyjxrfkslzrmtlefswag.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5anhyZmtzbHpybXRsZWZzd2FnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ3Mjc2MTIsImV4cCI6MjEwMDMwMzYxMn0.VW1MBHzW7bdkBV7GYT4yo_vDMxXgvIyMvZ4mzvtsuCY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
