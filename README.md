# SwapKat's Adventure Time

Outcomes are achieved with consistent behavior around right tasks. I created this for me and my girlfriend to ensure we stay on track toward the outcomes we desire. Here's how it works:

## How it works

- **Outcomes** — The big-picture goals you want to achieve on a weekly basis
- **Tasks** — Set of tasks that moves you toward those outcomes (link tasks to outcomes)
- **Behaviors** — The habits you need to weed out consistently; track when they slip

## Features

- **Login** — Quick switch between Swapnil and Kat profiles
- **Personal & Work contexts** — Separate goals and outcomes for each area
- **Weekly Goals** — Tasks with progress tracking, outcome linking, and carried-over items
- **Important Outcomes** — Big-picture targets with completion progress
- **Critical Behaviors** — Habits to track and improve
- **Historical Success** — Goal completion performance over time
- **Modals** — Add/edit tasks, define outcomes, track behaviors, and manage items

## Tech Stack

- Vanilla HTML, CSS, and JavaScript
- **Local Storage** (default) or **Supabase** for cloud persistence — both Kat and Swapnil can access from any device
- No build step

## Getting Started

### Option A: Cloud sync (Supabase) — for both of you to access anywhere

1. Create a free project at [supabase.com](https://supabase.com)
2. In the SQL Editor, run the contents of `supabase/schema.sql`
3. Go to Project Settings → API, copy the **Project URL** and **anon public** key
4. Copy `supabase-config.example.js` to `supabase-config.js` and paste your URL and key
5. Deploy to [Vercel](https://vercel.com) (connect your GitHub repo) or any static host
6. Both of you can now access the app from the same URL with shared data

### Option B: Run locally (localStorage)

1. Clone the repo:
   ```bash
   git clone https://github.com/swa311096/SwapKat-little-adventure.git
   cd SwapKat-little-adventure
   ```

2. Serve the app (any static file server works):
   ```bash
   python3 -m http.server 8080
   ```
   Or with Node: `npx serve .`

3. Open [http://localhost:8080](http://localhost:8080) in your browser.

### Or open directly

You can also open `index.html` in a browser, though some features may be limited due to CORS when loading locally.

## Project Structure

```
├── index.html   # App shell and templates
├── styles.css   # Design system and layout
├── app.js       # State, storage, and rendering logic
└── README.md
```

## License

© 2023 Swapnil & Kat Productivity Hub
