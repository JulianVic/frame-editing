-- Enable Realtime for topaz_jobs table
-- This allows clients to subscribe to changes in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE public.topaz_jobs;

-- Note: If the above doesn't work, you may need to enable it via Supabase Dashboard:
-- 1. Go to Database > Replication
-- 2. Find 'topaz_jobs' table
-- 3. Toggle it to enable Realtime

