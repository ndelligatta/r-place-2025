# Neon r/place (degen 2025)

- React + Vite + TypeScript
- Tailwind v4 (CSS-first) with neon tokens
- r/place-like canvas (pan/zoom/click, 128×128 local state)
- Crypto-degen ticker bar ($BONK, $DOGE, $DUMP, $PUMP, $PEPE, $WAGMI)

## Getting started

- Install deps: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`

## Tailwind v4 usage

- Entry: `src/index.css` with `@import "tailwindcss";`
- Theme tokens defined under `@theme` for fonts/colors

## Supabase (realtime + persistence)

- Env: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Netlify → Site settings → Environment variables)
- Realtime: pixel placements broadcast on channel `board-1` and applied live.
- Persistence: table `boards` with row `{ id: 1, data: base64 }` stores full 128×128 board.

SQL to set up (run in Supabase SQL Editor):

```sql
create table if not exists public.boards (
  id int primary key,
  data text not null
);

-- Allow anonymous read/write for demo (tighten later)
alter table public.boards enable row level security;
create policy "read board" on public.boards for select using (true);
create policy "write board" on public.boards for insert with check (true);
create policy "update board" on public.boards for update using (true) with check (true);

insert into public.boards (id, data)
  values (1, '')
  on conflict (id) do nothing;
```

- Security: For production, restrict with RLS (e.g., rate limit in Edge/Function, or only allow RPC that validates cooldown).

## Notes

- Canvas currently stores pixels in-memory; backend sync, cooldowns, and moderation can be added via Supabase Realtime + RLS.
  Now included basic realtime + persistence; server-side cooldown not enforced.
