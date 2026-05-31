# 🃏 CABO — Multiplayer Card Game

A real-time multiplayer implementation of the card game **Cabo**, built with React + TypeScript + Supabase.

---

## 🎮 How to Play

### Objective
Have the **lowest total card value** in your hand when someone calls "Cabo".

### Setup
- Each player receives **4 cards** face-down
- At the start of each round, players get **5 seconds** to peek at their **bottom 2 cards**
- Memorize them — you won't see them again unless you use a special ability

### On Your Turn
1. **Draw** a card from the deck
2. Choose one of:
   - **Discard it** — throw the drawn card away, keep your hand as-is
   - **Swap it** — replace one of your hand cards with the drawn card (old card goes to discard)
   - **Use its special ability** *(if value ≥ 7)*

### Special Card Abilities
| Value | Card | Ability |
|-------|------|---------|
| 7, 8  | 7 / 8 | **Peek** — look at one of your own cards for 3 seconds |
| 9, 10 | 9 / 10 | **Spy** — look at one opponent's card for 3 seconds |
| J     | Jack | **Blind Swap** — swap one of your cards with an opponent's (without seeing either) |
| Q     | Queen | **Seen Swap** — peek at both cards for 3 seconds, then swap |
| K     | King | **Seen Swap** — same as Queen |
| A–6   | Ace–6 | No special ability |

### Calling Cabo
- On **your turn**, instead of drawing, you can call **"Cabo"**
- Every other player gets **one final turn**, then the round ends
- All cards are revealed and scored

### Scoring
- Each card is worth its **face value** (Ace = 1, Jack = 11, Queen = 12, King = 13)
- The player with the **lowest total** wins the round
- Scores accumulate across **10 rounds**
- The player with the **lowest total score** after 10 rounds wins the game

---

## Features

### Multiplayer
- Real-time multiplayer powered by Supabase Realtime (WebSocket)
- 2 to 6 players per game
- 1 to 3 decks of cards (configurable per game)
- Game lobby — create or join games by ID
- Waiting room — live player list, copy-to-share game ID
- Auto-reconnect — rejoins your active game on refresh

### Gameplay
- Full 52-card deck (Ace through King, all 4 suits) per deck
- Peek phase — 5-second window to memorize your bottom cards at round start
- Blind Swap and Seen Swap — full special ability implementation
- Action log — live feed of game events
- 10-round game with cumulative scoring
- Review Cards — see everyone's final hand before next round starts

### Security and Anti-Cheat
- Server-side game logic — all moves validated by Supabase Edge Functions
- Row Level Security (RLS) — database enforces card visibility (you can never see opponent hidden cards via API)
- Turn enforcement — Edge Functions reject moves that aren't your turn
- Google OAuth — secure authentication, no passwords
- Hidden card values — opponent card values are null in API responses until revealed

### Visual Design
- Dark, premium casino aesthetic
- Bicycle-inspired card designs with suit pip layouts
- Smooth animations for swaps, peeks, and card reveals
- Responsive layout

---

## Getting Started

### Prerequisites
- Node.js 18+
- A Supabase account (supabase.com)
- Google Cloud project with OAuth 2.0 credentials

### Installation

```bash
git clone https://github.com/nirvan206/cabov2
cd cabov2
npm install
cp .env.example .env
# Fill in your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### Database Setup

1. Go to your Supabase Dashboard → SQL Editor
2. Run the migration file: `supabase/migrations/001_initial.sql`
3. This creates all tables, RLS policies, and enables Realtime

### Auth Setup

1. In Supabase → Authentication → Sign In / Providers → Google
2. Enable Google and paste your Google OAuth Client ID and Secret
3. Add `https://your-project.supabase.co/auth/v1/callback` as an Authorized Redirect URI in Google Cloud Console

### Deploy Edge Functions

```bash
npm install -g supabase
supabase login
supabase link --project-ref your-project-ref
supabase functions deploy
```

### Run Locally

```bash
npm run dev
```

---

## Security

| Layer | Protection |
|-------|-----------|
| Auth | Supabase Google OAuth — no passwords stored |
| API Keys | Only VITE_SUPABASE_ANON_KEY is in the frontend (safe to expose with RLS) |
| Service Role Key | Only used in Edge Functions via Deno.env — never in frontend code |
| Card Values | Hidden server-side via get-state function — opponents can never query your cards |
| Turn Validation | Every move is validated server-side before the database is mutated |
| RLS Policies | Database rejects unauthorized reads/writes even if someone bypasses the frontend |
| .gitignore | .env and all secret files are excluded from version control |

Never commit your .env file. Use .env.example as a template.

---

## Project Structure

```
cabo-game/
├── src/
│   ├── components/
│   │   ├── Auth/          # Login screen
│   │   ├── Lobby/         # Game browser + waiting room
│   │   └── Game/          # Table, cards, players, modals
│   ├── store/
│   │   ├── authStore.ts   # Auth state (Supabase session)
│   │   ├── mpStore.ts     # Multiplayer game state + Edge Function calls
│   │   └── gameStore.ts   # Local game logic (offline/AI mode)
│   ├── lib/
│   │   └── supabase.ts    # Supabase client singleton
│   └── types/
│       └── game.ts        # TypeScript interfaces
├── supabase/
│   ├── migrations/        # SQL schema migrations
│   └── functions/         # Edge Functions (server-side game logic)
│       ├── create-game/
│       ├── join-game/
│       ├── start-game/
│       ├── get-state/
│       ├── draw/
│       ├── keep-discard/
│       ├── swap-drawn/
│       ├── peek/
│       ├── spy/
│       ├── blind-swap/
│       ├── swap-with-peek/
│       ├── call-cabo/
│       ├── next-round/
│       └── _shared/       # Shared utilities
├── .env.example           # Template — copy to .env
└── .gitignore             # Keeps secrets out of git
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Styling | Vanilla CSS |
| Animations | Framer Motion |
| State | Zustand |
| Auth | Supabase Auth (Google OAuth) |
| Database | PostgreSQL (Supabase) |
| Real-time | Supabase Realtime (WebSocket) |
| Backend Logic | Supabase Edge Functions (Deno) |
| Hosting | Vercel (frontend) + Supabase (backend) |

---

## License

MIT