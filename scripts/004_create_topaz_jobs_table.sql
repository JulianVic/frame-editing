-- Create table to track Topaz processing jobs
CREATE TABLE IF NOT EXISTS public.topaz_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  image_path text NOT NULL, -- Path to the image in Supabase Storage
  result_path text, -- Path to the enhanced image (when completed)
  error_message text, -- Error message if failed
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.topaz_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own jobs"
  ON public.topaz_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
  ON public.topaz_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
  ON public.topaz_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS topaz_jobs_photo_id_idx ON public.topaz_jobs(photo_id);
CREATE INDEX IF NOT EXISTS topaz_jobs_user_id_idx ON public.topaz_jobs(user_id);
CREATE INDEX IF NOT EXISTS topaz_jobs_status_idx ON public.topaz_jobs(status);
CREATE INDEX IF NOT EXISTS topaz_jobs_created_at_idx ON public.topaz_jobs(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_topaz_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_topaz_jobs_updated_at
  BEFORE UPDATE ON public.topaz_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_topaz_jobs_updated_at();

