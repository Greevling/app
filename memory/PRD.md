# Soulbound — Product Requirements Document

## Original Problem Statement
> "I have a game idea. So the game is about a soul-like creature in a platformer that takes over 'bodies'. So each level is a different person that the soul takes over and helps them through a mission that reflects their life. The levels are the same length as certain songs that I've made and since the level is a scroller they need to complete the levels before the song is done."

## User Choices (Feb 2026)
- Songs: user uploads their own tracks later (placeholders for now)
- Levels: 5+ (MVP ships with 5)
- Art style: pixel art / retro 8-bit
- Mechanics: run, jump, collect items reflecting the character's story
- Tech: HTML5 Canvas + React

## Personas
- **The Musician-Developer (Primary)** — makes original songs, wants to bind them to bespoke platformer levels that share their emotional theme.
- **The Player** — plays through 5 short, poetic levels; enjoys pixel-art narrative games (Journey / Celeste / Undertale vibe).

## Architecture
- **Frontend** — React 19 + Tailwind + Shadcn/UI + HTML5 Canvas game engine (`src/game/engine.js`), routes: `/`, `/levels`, `/play/:levelId`, `/about`, `/upload`.
- **Backend** — FastAPI + Motor/MongoDB. Static level definitions in `LEVELS`. Local disk storage for audio uploads under `/app/backend/uploads/`.
- **Endpoints**: `GET /api/levels`, `GET /api/levels/{id}`, `POST/GET /api/scores`, `POST /api/songs/upload`, `GET /api/songs/{id}/audio`, `DELETE /api/songs/{id}`.

## Implemented (Feb 2026 — v0.1)
- Cinematic pixel-art main menu with glowing "SOULBOUND" title, CRT + grain overlays.
- Level Select bento grid with 5 characters (Elena/Marcus/Yuki/Kofi/Iris) — each with unique color palette, life theme, story intro/outro.
- Canvas platformer: soul-possessed player, gravity + jump, procedurally generated obstacles (pits, spikes) and collectibles scaled to song duration, camera scrolling, parallax stars, mountains, animated finish line, 3-health respawn.
- Story intro overlay before each level, in-game HUD (character portrait + soul orb, song progress bar, elapsed/remaining time, collectibles count, health pips, pause).
- Pause overlay (resume / restart / abandon) + ESC toggle.
- Result overlay with epilogue text, time, collectibles; score persistence.
- Song Upload page: multipart audio upload (mp3/wav/ogg/m4a), auto-detects duration client-side, preview/delete, binds song duration to level runtime.

## Prioritized Backlog

### P0 (next)
- Real audio-reactive obstacles (spawn beats aligned to song waveform / user-defined beat markers).
- Per-character sprite art (currently rendered as generic possessed silhouette with color-tinted soul flame).

### P1
- Best-time leaderboards per level (backend already stores scores, need UI).
- Custom level editor: paint obstacles/collectibles onto the song timeline.
- Mobile touch controls (tap to jump).

### P2
- Additional chapters / bodies beyond the initial 5.
- Story branches based on collectibles gathered (multiple epilogues).
- Save/resume session; per-user profiles.
- Object-storage backed audio (currently local disk — ephemeral on redeploy).

## Test Credentials
None (public app, no auth).
