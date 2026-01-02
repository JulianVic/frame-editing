-- Add column to store Topaz Gigapixel enhanced image URL
ALTER TABLE public.photos 
ADD COLUMN IF NOT EXISTS topaz_gigapixel_url text;

-- Add column to track Topaz processing status
ALTER TABLE public.photos 
ADD COLUMN IF NOT EXISTS topaz_status text CHECK (topaz_status IN ('pending', 'processing', 'completed', 'failed'));

-- Add index for faster queries on topaz_status
CREATE INDEX IF NOT EXISTS photos_topaz_status_idx ON public.photos(topaz_status);

