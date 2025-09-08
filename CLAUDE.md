# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Frontend (r-place-frontend/)
```bash
# Install dependencies
cd r-place-frontend && npm install

# Development server (http://localhost:5173)
npm run dev

# Build production bundle
npm run build

# Run linting
npm run lint

# Preview production build
npm run preview

# TypeScript type checking
npx tsc --noEmit
```

### Deployment
- Deployed on Netlify (configuration in `netlify.toml`)
- Build command: `npm run build` (from r-place-frontend directory)
- Publish directory: `dist`

## Architecture Overview

### Technology Stack
- **Frontend Framework**: React 19 with TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS v4 (CSS-first approach with custom neon theme tokens)
- **Real-time**: Supabase (WebSocket channels + persistence)
- **Deployment**: Netlify

### Project Structure
```
r_place/
├── r-place-frontend/       # Main React application
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── CanvasBoard.tsx      # Main r/place canvas with pan/zoom/click
│   │   │   ├── Palette.tsx          # Color palette selector with cooldown
│   │   │   ├── TickerBar.tsx        # Crypto ticker display
│   │   │   ├── BackgroundShader.tsx # WebGL animated background
│   │   │   ├── OnboardingDemo.tsx   # User onboarding flow
│   │   │   └── DemoCta.tsx          # Demo call-to-action
│   │   ├── lib/
│   │   │   └── supabaseClient.ts    # Supabase client singleton
│   │   ├── App.tsx        # Main app component (32×32 board, board ID 2)
│   │   └── index.css      # Tailwind CSS entry with neon theme tokens
├── supabase/
│   └── migrations/        # Database migrations
└── netlify.toml          # Netlify deployment config

```

### Core Architecture Patterns

1. **Canvas State Management**
   - Board data stored as `Uint16Array` (32×32 pixels)
   - Each pixel value is an index into the color palette
   - Local state synced with localStorage and Supabase
   - Base64 encoding for persistence

2. **Real-time Synchronization**
   - Supabase Realtime channels for pixel updates
   - Channel naming: `board-{boardId}` (currently using board ID 2)
   - Presence tracking for active users
   - Optimistic updates with server reconciliation

3. **Cooldown System**
   - 3-second cooldown after placing a pixel
   - Client-side enforcement only (no server validation yet)
   - Visual feedback via overlay timer

4. **User Identity**
   - Guest users auto-generated with format: `guest_[random]`
   - Stored in localStorage as `rplace_user_v1`
   - Each user has ID, name, and preferred color

### Key Implementation Details

- **Canvas Rendering**: Direct canvas 2D API manipulation for performance
- **Pan/Zoom**: Mouse wheel zoom, click-and-drag pan
- **Pixel Grid**: Visual grid overlay at high zoom levels
- **Board Persistence**: Dual storage (localStorage + Supabase `boards` table)
- **Environment Variables**: 
  - `VITE_SUPABASE_URL`: Supabase project URL
  - `VITE_SUPABASE_ANON_KEY`: Supabase anonymous key

### Database Schema

```sql
-- boards table: stores canvas state
CREATE TABLE public.boards (
  id INT PRIMARY KEY,
  data TEXT NOT NULL  -- Base64-encoded Uint16Array
);
```

Row Level Security policies allow anonymous read/write access (demo mode).