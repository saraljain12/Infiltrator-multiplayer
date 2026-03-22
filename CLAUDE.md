# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Infiltrator is a real-time multiplayer "Find the Spy" party game. Players join a party, receive secret words (except the spy), then vote to eliminate the spy across rounds. The spy wins by guessing the civilians' word after being eliminated.

## Commands

### Backend (`/backend`)
```bash
npm run dev          # Start dev server with hot-reload (nodemon + ts-node)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled server
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:migrate   # Apply pending migrations
```

### Frontend (`/frontend`)
```bash
npm run dev      # Start Vite dev server
npm run build    # TypeScript check + Vite build
npm run lint     # ESLint
npm run preview  # Preview production build
```

### Environment
Backend requires a `.env` in `/backend`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/infiltrator"
```
Frontend API and WebSocket base URL is hardcoded to `http://localhost:3001` / `ws://localhost:3001` in `src/lib/api.ts` and `src/lib/ws.ts`.

## Architecture

### Backend (Node.js + Fastify + TypeScript + Prisma + PostgreSQL)

Organized as Fastify plugins under `src/modules/`:
- **`party/`** — Party creation/joining, game start, role assignment (`roleAssignment.ts`)
- **`player/`** — Authenticated player info (role + word)
- **`voting/`** — Vote submission with auto-resolution, spy guess handling
- **`websocket/`** — WebSocket route + `websocket.service.ts` which maintains a `Map<partyCode, Set<WebSocket>>` and dispatches typed events to all party members

Auth is session-token based: a 64-char hex token is issued on create/join, stored in localStorage, and sent as `Authorization: Bearer <token>` header (or `?token=` query param for WebSocket upgrades).

### Frontend (React 19 + React Router v7 + Vite)

Three pages reflecting game lifecycle:
- `Home.tsx` — Create or join a party
- `Lobby.tsx` — Waiting room; host starts game
- `Game.tsx` — Active game: voting, spy-guess phase, results

`lib/api.ts` wraps `fetch` with auth headers. `lib/ws.ts` wraps the browser WebSocket with an EventEmitter-style `subscribe(event, handler)` API.

All client state (sessionToken, playerId, partyCode) is stored in `localStorage` and reconstructed on page load.

### Game State Machine

```
Party status: lobby → in_progress → finished
Round status: voting → spy_guessing → completed
```

**Voting auto-resolution**: when all alive players have voted, `resolveRound()` fires automatically. Ties are broken randomly. If the eliminated player is the spy, round transitions to `spy_guessing`; otherwise it goes straight to `completed` and a new round starts.

### WebSocket Events (server → client)
`player_joined`, `game_started`, `vote_cast`, `spy_guessing`, `spy_guess_result`, `round_completed`, `round_started`, `game_over`

### Database Schema (Prisma / PostgreSQL)
- **Party** — code (6-char unique), status, wordA/wordB, desiredInfiltratorCount, hasSpy, hostPlayerId
- **Player** — displayName, role (`civilian`/`infiltrator`/`spy`), isAlive, sessionToken, partyId
- **Round** — roundNumber, status, eliminatedPlayerId, spyGuess, spyGuessCorrect, partyId
- **Vote** — roundId, voterId, targetId (unique per voter per round)
