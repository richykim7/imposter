(Old project, fixed some bugs recently.)

# Impostor Game

A web-based impostor/spyfall-style party game with AI-generated words. Each
role reveal flips a playing card. Works pass-and-play on one device, or
multi-device with each player joining via a code.

## Features

- **Pass-and-play OR multi-device** — works either way with the same code
- **AI-powered words** — drop any Groq / OpenAI / OpenRouter / Anthropic key
  in `.env` and the server picks the provider from the key prefix. No key →
  offline word-pack fallback.
- **Multi-impostor** (1 to floor((n-1)/2))
- **Difficulty modes** (easy / medium / hard) drive how mainstream the picks are
- **Everyone-gets-a-word mode** — impostor gets a *different* word
- **Imposter-gets-a-hint mode** — abstract 1–2 word hint
- **Chaos mode (opt-in)** — 1 in 20 rounds, everyone is an impostor
- **Round chaining** with same code, same or different category
- **Re-viewable reveals** — missed the 10s auto-hide? Tap the card again
- **Per-player tokens** so others can't peek at your role or end the round
- **Share link with `?code=…`** routes new visitors to the join screen
- **Crypto-grade RNG** — Node's `crypto.randomInt` for all shuffles; impostor
  selection is uniform within chi-square significance across 120k+ trials per
  configuration

## Run it

```bash
npm install
cp env.template .env        # optional — add an LLM key for AI words
npm start
```

Open <http://localhost:3000>. Drop any one of the following in `.env` (or your
shell) and the server auto-detects the provider from the key prefix:

| Env var | Provider |
|---|---|
| `LLM_API_KEY` | auto-detected from prefix (`gsk_`, `sk-`, `sk-or-`, `sk-ant-`) |
| `GROQ_API_KEY` | Groq |
| `OPENAI_API_KEY` | OpenAI |
| `OPENROUTER_API_KEY` | OpenRouter |
| `ANTHROPIC_API_KEY` | Anthropic |

Override the default model with `LLM_MODEL=...` if you want a specific one.
With no key, the app runs in offline mode using built-in word packs
(countries, cities, animals, movies, food, sports, fruits, vegetables,
professions, colors, instruments, drinks).

## Test

```bash
npm test           # full integration simulator (126 assertions)
npm run test:rng   # randomizer uniformity (chi-square on 120k+ trials)
```

## How to play

1. **Host** enters a category, picks player count and impostor count, creates
   the game.
2. **Share** the 6-character code (or the `?code=…` link) with other devices,
   or just pass one device around.
3. **Each player reveals their own role.** The impostor doesn't see the word;
   everyone else does. (Or with "everyone gets a word", the impostor sees a
   *different* word.)
4. **Talk it out**, vote on the impostor.
5. **Host** taps "Show the hand" to end the round; results appear for all players.
6. **New round, same code** — pick the same category or a new one. Player
   slots are preserved across rounds.

## Architecture

- **Backend** (`server.js` + `lib/`) — Express, in-memory state, token-based
  authorization, `crypto.randomInt` for all randomness.
- **Frontend** (`public/`) — vanilla JS, polling-based sync on `roundId`.
- **No DB** — state lives in memory and is cleaned up after 24h. Game state
  is lost on server restart.

### Authorization model

Each game has:
- A **hostToken** issued at creation (held by the creator).
- A **playerToken** per joined slot, issued via `/api/game/:code/join`.

A slot's `playerToken` authorizes revealing that slot; otherwise the
`hostToken` authorizes it (so pass-and-play, where no one else has joined,
"just works"). Once a player joins a slot, the host can no longer peek at it
— preventing cheating in multi-device games.

## License

MIT
