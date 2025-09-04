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

## Supabase (placeholder)

- Add `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- `src/lib/supabaseClient.ts` stub exists to wire later

## Notes

- Canvas currently stores pixels in-memory; backend sync, cooldowns, and moderation can be added via Supabase Realtime + RLS.
