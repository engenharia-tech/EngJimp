-- 1. Ensure the salary column exists (idempotent)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS salary numeric DEFAULT 0;

-- 2. Force PostgREST to reload the schema cache
-- This is often necessary after schema changes for the API to recognize new columns
NOTIFY pgrst, 'reload config';
