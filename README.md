# DropRoom - Anonymous Pastebin & File Sharing

A sleek, minimalistic, and completely anonymous clipboard application built with React, Vite, and Supabase.

<br/>
<p align="center">
  <img src="https://drive.google.com/uc?export=view&id=17OX3H0Q3ilYk6iltqCd5enSmz-GHc1Jg" alt="DropRoom Screenshot" width="800" />
</p>
<br/>

## Features

- **Anonymous "Rooms"**: Instant generation of unique 6-character room codes. No signup required.
- **Real-Time Text Syncing**: Paste code, links, or text and save them instantly to the cloud.
- **File Attachments**: Upload and share files (up to 5MB) securely within your room.
- **1-Click Copy**: Easily copy your room code or the text content to your local clipboard.
- **Premium UI**: Light-themed, glassmorphism-inspired design with a clean sidebar and functional action bar.

## Tech Stack

- Frontend: React + Vite
- Backend & Storage: Supabase (PostgreSQL + Storage)
- Styling: Custom CSS & `lucide-react` icons

## Getting Started

1. Set up your `.env`:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
2. Install dependencies:

   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Database Setup

Run this in your **Supabase SQL Editor** to set up the `snippets` table and public policies:

```sql
drop table if exists public.snippets;

create table public.snippets (
  id uuid default gen_random_uuid() primary key,
  code varchar(6) not null unique,
  content text not null,
  file_url text,
  file_name text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.snippets enable row level security;

create policy "Allow public read access" on public.snippets for select using (true);
create policy "Allow public insert access" on public.snippets for insert with check (true);
create policy "Allow public update access" on public.snippets for update using (true);
```

### Storage Setup

For file persistence:

1. Go to **Storage** and create a bucket named `room-files`.
2. Make it **Public**.
3. Set the max file size to **5MB**.
4. Create policies identical to above to allow anonymous `SELECT`, `INSERT`, and `UPDATE`.

---

_Made by Aaditya Pratap_
