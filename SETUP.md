# SwapKat Cloud Setup

To have both Kat and Swapnil access the app from any device with shared data:

## 1. Create Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Create a new project (choose a region, set a password)
3. Wait for the project to be ready

## 2. Run the schema

1. In your Supabase project, open **SQL Editor**
2. Copy the contents of `supabase/schema.sql`
3. Paste and click **Run**

## 3. Get your API keys

1. Go to **Project Settings** (gear icon) → **API**
2. Copy **Project URL**
3. Copy **anon public** key (under "Project API keys")

## 4. Configure the app

1. Open `supabase-config.js`
2. Set `SUPABASE_URL` to your Project URL (e.g. `https://abcdefgh.supabase.co`)
3. Set `SUPABASE_ANON_KEY` to your anon public key

## 5. Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click **Add New** → **Project**
4. Import your SwapKat repo
5. Deploy (no env vars needed — config is in the file)

## 6. Share the URL

Both of you can now open the Vercel URL (e.g. `swapkat-adventure.vercel.app`) and use the app. Data syncs automatically.
