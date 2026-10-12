# Frankie Labs

A gallery of chill, real-time multiplayer browser games. Play over a shared
room code (**2 players**, or **2–4** for Ludo, **2–5** for Lotería, Blackjack,
Crossword Clash & Battleship),
or hit **Play vs Computer** on any game's join screen to take on built-in bots
solo (offline).
In an online room, the **host can also add bots** to fill open seats, so you can
mix real friends and CPUs in the same game. Pick one from the home screen:

- **Paper Numbers** — one player is the **Finder** (races to spot a target number
  on a 10×10 grid; claimed numbers turn red) while the other is the **Dotter**
  (fills a 64-dot sheet). Finding the number swaps roles — first to fill all 64
  dots wins.
- **Tic-Tac-Toe** — the classic 3-in-a-row duel.
- **Connect 4** — drop discs and line up four.
- **High-Low** — the guesser secretly calls higher or lower, then the *opponent
  deals a card blind* (they can't see the call). Each round starts from a fresh
  random card. Correct call scores; first to 6.
- **Battleship** — now for **2–5 admirals** on a bigger **12×12** ocean with a
  **six-ship fleet** (Carrier, Battleship, Destroyer, Cruiser, Submarine, Patrol
  Boat). Arrange your fleet (shuffle a **random** layout or **place each ship by
  hand**); the game starts once **everyone** readies up. On your turn, **pick
  which opponent to fire at** (tabs show each rival and how many of their ships
  are left) — sink a whole fleet to knock that admiral out, and the **last fleet
  afloat wins**. A side panel lists **every ship kind and size** and which remain
  to sink, for your target and for your own fleet. Opponent ship positions are
  masked server-side (`redact`) so they can't be read off the wire.
- **Dots & Boxes** — pick a **quick** (5×5) or **long** (8×8) board, then take
  turns drawing the edges of the grid; close the fourth side of a box to claim it
  and take another turn. Most boxes wins.
- **Ludo** — the classic **2–4 player** race on the cross board. Roll the die,
  release a token on a 6, chase your tokens clockwise around the shared loop, and
  land on rivals to send them back to their pen (except on safe squares). Turn up
  your colour's home column into the centre; first to get all four tokens home
  wins. Rolling a 6 — or capturing / finishing a token — earns another roll. Solo
  play lets you pick 2–4 players (you plus bots); online, up to four share a room
  code and the host starts once everyone's in. Before Start, each player **picks
  their colour** in the lobby (solo play gets a setup screen) from a wide palette
  of solids, gradients, and a full **rainbow** — one colour per player, locked in
  once the game begins. When **all four** of your pieces are stuck in the pen,
  **guess the die** before you roll — land the guess (or roll a 6) and one piece
  breaks free. A **scrollable history** under the board tracks every roll, move,
  capture, and wildcard.
- **Uno Frenzy!** — Uno's colour/number matching plus a deck of chaos: **Swap**
  trades entire hands, **Steal** yanks cards from your rival, and **Frenzy** buries
  them under six. Classic Skip / Reverse / +2 / Wild / +4 included. Empty your hand
  first to win. (Opponent hands are masked server-side via `redact`.)
- **Blackjack 21** — a neon, suit-free race to 21 for **2–5 players** (mix
  friends and bots). Hit, Stand, or Double Down; the best hand under 22 takes the
  round. Pick a mode in the lobby: **Casino** — everyone starts with **1,000** in
  mixed-denomination chips, bets before each hand, and the winner rakes the pot
  (bust the table, or hold the biggest stack after 20 hands) — or **15 Rounds**,
  where whoever wins the most of 15 hands takes the match. Every rival's hole cards stay hidden (`redact`) until the
  reveal.
- **Lotería Millennial** — the Mexican bingo of images with a millennial twist,
  for **2–5 players**. Pick **Clásico** or **Frenzy** to start. Each player gets a
  4×4 **tabla**; one carta is sung at a time, the slot **flashes** on your tabla
  if you hold it, you drop a **frijol** (bean) on it, then everyone taps **Listo**
  — the next carta is only sung once *all* players are ready. Fill the **whole
  tabla**, then shout **¡Lotería!**. In **Frenzy**, a 🎁 **mystery power-up** pops
  up for a random player at random moments — use it and it's either **"¡1 Free
  Bean!!"** (for you) or **"a random player just got a free bean… awww"**; you
  don't know which until you gamble. The deck blends classic cartas with modern
  chaos (El WiFi, El Aguacate, El Mezcal, El Selfie) and a bunch of very personal
  trip cartas — **El Ajolote**, **La Piedra del Sol** (Museo de Antropología),
  **La Ciudadela**, **La Casa de Tacuba**, **El Chapultepec**, **El Matcha**
  (Matcha Mío Café), **El Zócalo** (Palacio Nacional & its vendors), and **Tacos
  Del Valle**. The deck's un-sung tail is masked server-side (`redact`) so nobody
  peeks ahead.
- **Crossword Clash** — a **2–5 player** brain-teaser race over one shared
  crossword (mix friends and bots). Pick a clue, type the answer, and if you're
  right you **claim** that word: its letters lock in for everyone and you bank
  **points equal to the word's length** — first to fill the whole grid ends it,
  most points wins. Choose a mode to start: **Normal** — a snappy **4×4** grid
  with friendly clues — or **Hard** — a chunkier **5×5** grid with terser,
  trickier clues. Wrong guesses never cost anything in either mode; only a
  correct answer claims the word. Every player gets exactly **3× 🔍 hints**, a
  power-up that reveals one more letter of your selected word, just for you.
  **Play Again** deals a fresh board in the same mode (no re-picking). There are
  **hundreds of puzzles** (240 Normal + 160 Hard) — generated offline (grids
  solved &amp; every crossing verified, clues drawn from dictionary definitions)
  and dealt from a **shuffle-bag** so a session never repeats a board until the
  whole pool is used up. The data is lazy-loaded (its own async chunk) so it
  never weighs down the rest of the site. Answers never travel on the wire —
  game state only carries which words have been claimed — so nothing leaks to a
  peer's console.
- **Road to Citizenship** — a **hub of citizenship games** for the U.S.
  naturalization test, **solo or 1–6 friends** over one room code (with bots to
  fill empty seats). After you join and enter your name, the **host picks the
  game** in the lobby:
  - **Citizenship Trivia** — everyone answers the **same** question at once from
    the **official USCIS civics questions** (options shuffled each time); once the
    whole room has locked in, the round **reveals** — the correct choice, a short
    fact, and each player's ✓/✗ — and scores update. Most correct after **10
    questions** wins (solo, you're scored against the USCIS **60% pass mark**).
  - **The Civic Path** — a **strategy board game**. On your turn you answer a
    random-category civics question to earn a **resource card** (📜 History,
    🗺️ Geography, 🏛️ Legislative, ⚖️ Rights). Complete a full set to build a
    **Civic Milestone**; **trade** with the bank (4:1) or **negotiate** card
    swaps with other players to fill the sets you're short on. Build **3
    milestones** to unlock the **citizenship exam**, then answer **6 of 10**
    official USCIS questions to win (miss it and you lose a milestone — regroup
    and try again). Empty seats fill with **bots** on three difficulty tiers
    (**Novice / Citizen / Scholar** set how often they answer correctly) and with
    distinct personas — **Govbot-y** aggressively hoards Legislative & History
    cards, so humans have to adapt.
  - **Citizenship Jeopardy!** — a quiz-board showdown on a grid of civics
    categories × dollar values ($200–$800). The player in control picks a clue
    and answers; answer right to **bank the value** and keep control, miss it and
    it **subtracts** — then rivals get to **steal** it in turn (answer or pass).
    Play out the whole board; the **biggest bank wins**. It's turn-based (no
    real-time buzzer) so humans and bots compete fairly, and empty seats fill with
    the same difficulty-tiered **bots**.

  The answer key never travels on the wire before it's safe: game state masks
  each question's correct answer, other players' picks, unanswered exam questions,
  and un-played Jeopardy clues (`redact`) so nothing leaks to a peer's console.
  Time-sensitive and
  location-specific questions from the official 100 (current office-holders, your
  state's senators/representative/governor/capital) are left out so every answer
  stays correct.

  All three games draw from an expanded bank of **500+** civics, U.S. history and
  geography questions — the official USCIS set plus data-driven additions (all 50
  state capitals, the Presidents in order, key constitutional amendments) and
  curated facts — and every game **reshuffles a fresh, category-balanced set**, so
  sessions rarely repeat. The Jeopardy activity log keeps the **full history**,
  scrollable.

When a game ends, the final board stays on screen behind the result panel — hit
**View Final Board** to inspect exactly how it played out before heading back.

## ⚡ Projects

The home screen is the projects gallery — the things I'm building. (Tap the
**mini Pikachu** in the top-right to jump over to the games.) First up
is **VibeCheck**: type any company (or tap a featured profile) to generate an
immersive, scrollable visual story — the rundown, fast facts, a timeline, and
fun facts. Two key-free data sources, both working for every visitor:

- **Wikipedia** (fallback) — real data from Wikipedia's public API (search +
  article summary + infobox). Great for established brands; niche or private
  companies may not have an article.
- **Featured profiles** — for companies Wikipedia can't cover (small VC firms,
  private startups), profiles are **pre-generated offline** by a GitHub Action
  running Ollama + Gemma, grounded from the web, and committed as JSON under
  `src/projects/vibecheck/data/`. The static site reads those, so they resolve
  instantly for everyone — no live model, no key, no server. See
  [docs/VIBECHECK_FEATURED.md](docs/VIBECHECK_FEATURED.md) to run/extend it.

On search, a matching featured profile wins; otherwise it falls back to Wikipedia.

Also in the gallery:

- **Place Timelapse** — watch any place on Earth change over time, from a year of
  NASA satellite imagery to the ground-level Street View history of a spot.
- **Govbot Social** — the social-media presence built for **Govbot**, the bot
  that auto-posts legislative bill updates. Its card links straight out to the
  live "Social Media Posts Dashboard" (a separate GitHub Pages site, opened in a
  new tab) — every post across **Bluesky, X, Threads &amp; Instagram**,
  filterable, with live Bluesky feeds and links to each account.
- **AI Art** — a gallery of AI-generated images and the exact **prompts** behind
  them, migrated from Notion. Browse a clean masonry grid, tap any image to read
  its full prompt, and **copy it to your clipboard** with one tap to paste into
  your favourite image generator. Every piece **credits its creator**, links to
  the **original** post, tags a **theme**, and names the **AI model** used; a
  search box and model filter chips keep all 112 pieces browsable. Images are
  self-hosted (compressed WebP under `public/projects/ai-art/`) so the gallery is
  fully standalone — nothing loads from Notion at runtime.

### Swappable images (monthly refresh)

Two spots load from fixed paths so you can refresh them whenever you like (a new
one each month works great) — just upload/replace one file, no code change:

- `public/projects/homescreen.jpg` — the big hero banner atop the home screen.
- `public/projects/icon.png` — the little icon on the **Games** portal button in
  the top-right of the home screen.

Upload a file with that exact name (GitHub → **Add file → Upload files**) and it
appears on the next deploy. If a file is missing, that spot falls back to the
Pikachu icon so nothing breaks. See
[public/projects/README.md](public/projects/README.md) for formats and sizing.

Each project is a self-contained component under `src/projects/` registered in
`src/projects/index.ts`, and is **lazy-loaded** so opening the home screen
never downloads a project's (heavier) code until you actually open it.

Every game is fully **peer-to-peer**: the two browsers connect directly via WebRTC
(using [PeerJS](https://peerjs.com) for the initial handshake), so there's no
backend server to run or pay for. That's what lets it live on GitHub Pages.

**Play it:** https://frankies2727.github.io/frankie-labs/

## Adding a game

Each game is a self-contained `GameDefinition` in `src/games/` (initial state,
`start`, a pure `reducer`, and a `Board` component). Add it to the registry in
`src/games/index.ts` and it shows up in the gallery automatically — the
peer-to-peer networking in `src/hooks/usePeerSession.ts` is game-agnostic. Set
`minPlayers`/`maxPlayers` (both default 2) to seat more than two — the lobby, the
"Play vs Computer" flow, and the host's start gate all adapt automatically. A
game that reads well alone can set `minPlayers: 1` so the host can also start
solo (its `redact` keeps hidden-answer games honest — see below).

A single card can also be a **hub of several games**: **Road to Citizenship**
(`src/games/road/`) is one `GameDefinition` whose `LobbyExtra` lets the host pick
a sub-game after everyone joins, and whose `reducer`/`Board`/`redact`/`botMove`
just delegate to the chosen sub-game (Citizenship Trivia or The Civic Path). Each
sub-game keeps its own nested state and returns any game-over lift to the hub, so
new games can be added under the same card without touching the networking.

To make a peer-to-peer game playable solo against CPUs, add an optional `botMove(state, botId)` to its
definition that returns the action the bot should take (or `null` when it isn't
the bot's turn). Games with a `botMove` automatically get the **Play vs Computer**
button; `src/hooks/useLocalSession.ts` runs the same `reducer` locally and drives
the bot after each move.

## How to play

1. One player opens the site, enters a **room code** + name, and joins.
2. They share that same room code with a friend.
3. The friend enters the same code — the two browsers link up directly.
4. Hit **Start** and play. Both players must be online at the same time.

> The room's "host" is whoever joins the code first; their browser is the
> authoritative game state. If they close the tab, the game ends.

### Playing across networks

One player taps **Host a new room** and gets a room code to send; everyone else
types it under **Join**. Only the host ever claims a code — if the host's tab is
closed, joiners are told so instead of quietly opening an empty room of their own.
The host should keep the game open on screen while friends join; a phone that
backgrounds the tab re-registers the room as soon as it comes back.

Two players on the same wifi connect directly over their local addresses. Once
the players are on different networks — a friend in another state, someone on
cellular data, a school or office wifi — that direct path is usually blocked and
the connection has to be relayed through a **TURN** server.

The app uses Metered's free [Open Relay](https://www.metered.ca/tools/openrelay/)
(UDP, TCP and TLS on ports 80/443, so it gets through strict firewalls), signing
short-lived credentials in the browser with the shared secret Metered publishes
for public use. It's shared and best-effort (20 GB/month across everyone), so if
joins start failing point the game at your own TURN server —
[coturn](https://github.com/coturn/coturn) self-hosted, or a hosted provider.
Set these at build time, in `.env.local` or as repository **variables**
(Settings → Secrets and variables → Actions → Variables), which the Pages
workflow passes to the build:

```
VITE_TURN_URLS="turn:turn.example.com:3478,turns:turn.example.com:5349"
VITE_TURN_USERNAME="username"
VITE_TURN_CREDENTIAL="password"
```

When `VITE_TURN_URLS` is set it replaces the public relay entirely. Anything
baked into a static site is readable by every visitor, so use a TURN account
with a usage cap you're happy to share, not a key that bills you without limit.

If a join can't be completed, the room-code screen comes back with the reason
instead of spinning — the handshake retries a few times and then gives up.

## Run locally

**Prerequisites:** Node.js

```bash
npm install
npm run dev      # Vite dev server
```

Open two browser tabs/windows on the same room code to test both sides.

## Deploy (GitHub Pages)

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the
static site and publishes it to GitHub Pages.

One-time setup: in the repo's **Settings → Pages**, set **Source** to
**GitHub Actions**.

The site is served from `/frankie-labs/` (configured via `base` in `vite.config.ts`);
update that if you rename the repo.

## 🎈 Externally-hosted games

A game that lives on its own site doesn't have an in-app state/reducer/board, so
it isn't a `GameDefinition`. Add it to `EXTERNAL_GAMES` in `src/games/index.ts`
instead — id, name, tagline, accent, emoji and `href`. It renders as a normal
gallery card that opens in a new tab (`Play ↗`), and `/play/<id>` redirects to
the real site so a shared link still lands somewhere sensible.

**Balloon Rumble** (`https://pepper-apex-brave-coral.grok.me/`) is the first
one.
