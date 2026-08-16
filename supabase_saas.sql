-- 1. Update profiles table to include plan_type
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS plan_type text DEFAULT 'free';

-- 2. Create export_logs table to track STL exports for limits
CREATE TABLE IF NOT EXISTS public.export_logs (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,
    exported_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. RLS for export_logs
ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;

-- Users can read their own logs
CREATE POLICY "Users can view their own export logs."
ON public.export_logs FOR SELECT
USING ( auth.uid() = user_id );

-- Users can insert their own logs
CREATE POLICY "Users can insert their own export logs."
ON public.export_logs FOR INSERT
WITH CHECK ( auth.uid() = user_id );

-- 4. Function to check if a user can export (Free limit: 1 per week)
-- (This function is optional but useful if we want to enforce it strictly at DB level)
-- For now, the client will just count the rows in the last 7 days.
