-- Create photos table to store uploaded and processed images
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  original_url text not null,
  cropped_url text,
  enhanced_url text,
  ai_recommendations jsonb,
  aspect_ratio text check (aspect_ratio in ('3:2', '2:3')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.photos enable row level security;

-- RLS Policies for photos table
create policy "Users can view their own photos"
  on public.photos for select
  using (auth.uid() = user_id);

create policy "Users can insert their own photos"
  on public.photos for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own photos"
  on public.photos for update
  using (auth.uid() = user_id);

create policy "Users can delete their own photos"
  on public.photos for delete
  using (auth.uid() = user_id);

-- Create index for faster queries
create index photos_user_id_idx on public.photos(user_id);
create index photos_created_at_idx on public.photos(created_at desc);
