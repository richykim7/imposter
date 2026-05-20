# 🎭 Impostor Game

A minimal but polished web app for an impostor/spyfall-style party game. One player is randomly selected as the impostor who doesn't know the secret word, while all other players are insiders who know it.

## Features

- 🤖 **AI-Powered Word Generation** - Uses Groq's OpenAI-compatible API to generate creative words from any category
- 🎲 **Crypto-Secure Randomness** - Impostor selection uses Node's `crypto.randomInt()` for fairness
- 🔒 **Privacy-First Reveal Flow** - Each player reveals their role privately with auto-hiding screens
- 📱 **Mobile-First Design** - Clean, modern dark theme that works beautifully on all devices
- 🚀 **Render-Ready** - Deploy in minutes with zero configuration
- ⚡ **No Database Required** - In-memory game state keeps things simple

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: Vanilla HTML/CSS/JavaScript (no frameworks)
- **AI**: Groq API (OpenAI-compatible)
- **Deployment**: Render-optimized

## Local Development

### Prerequisites

- Node.js 18+ installed
- A Groq API key (get one at [console.groq.com](https://console.groq.com/keys))

### Setup

1. Clone and install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory:

```bash
GROQ_API_KEY=your_groq_api_key_here
PORT=3000
```

3. Start the server:

```bash
npm start
```

4. Open your browser to `http://localhost:3000`

## Deployment to Render

### One-Click Deploy

1. Push this code to a GitHub repository
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Configure the service:
   - **Build Command**: (leave empty or use `npm install`)
   - **Start Command**: `npm start`
   - **Environment Variables**: Add `GROQ_API_KEY` with your Groq API key

### Manual Configuration

- **Name**: impostor-game (or your choice)
- **Region**: Choose closest to your users
- **Branch**: main
- **Runtime**: Node
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Required Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Your Groq API key from console.groq.com | Yes |
| `PORT` | Port number (Render sets this automatically) | No |

## How to Play

1. **Setup Game**
   - Enter a category (e.g., "Countries", "Animals", "Movies")
   - Choose number of players (3-12)
   - Click "Create Game"

2. **Reveal Roles**
   - Pass the device to each player
   - Each player clicks their "Reveal Player X" button
   - Screen shows if they're an IMPOSTOR or INSIDER
   - Insiders see the secret word, impostor doesn't
   - Screen auto-hides after 10 seconds

3. **Play the Game**
   - Players take turns asking yes/no questions
   - Insiders know the word and try to identify the impostor
   - The impostor tries to blend in and guess the word
   - After discussion, vote on who the impostor is!

4. **Reset**
   - Click "Reset" to start a new game

## API Documentation

### Endpoints

#### `GET /api/config`
Returns public configuration constants.

**Response:**
```json
{
  "minPlayers": 3,
  "maxPlayers": 12,
  "defaultPlayers": 3,
  "revealAutoHideSeconds": 10
}
```

#### `GET /api/status`
Returns current game status (without revealing secrets).

**Response (Active Game):**
```json
{
  "active": true,
  "category": "Animals",
  "numPlayers": 5,
  "revealedCount": 2,
  "createdAt": "2026-01-16T12:34:56.789Z"
}
```

**Response (No Active Game):**
```json
{
  "active": false
}
```

#### `POST /api/new-game`
Creates a new game with AI-generated word.

**Request:**
```json
{
  "category": "Countries",
  "numPlayers": 5
}
```

**Response:**
```json
{
  "success": true,
  "numPlayers": 5,
  "category": "Countries"
}
```

**Errors:**
- `400` - Invalid category or number of players
- `500` - API failure or server error

#### `POST /api/reveal`
Reveals a player's role and word (if insider).

**Request:**
```json
{
  "playerIndex": 0
}
```

**Response (Insider):**
```json
{
  "role": "INSIDER",
  "word": "Brazil",
  "category": "Countries",
  "playerIndex": 0
}
```

**Response (Impostor):**
```json
{
  "role": "IMPOSTOR",
  "word": null,
  "category": "Countries",
  "playerIndex": 2
}
```

**Errors:**
- `404` - No active game
- `400` - Invalid player index
- `403` - Player already revealed

#### `POST /api/reset`
Resets the current game.

**Response:**
```json
{
  "success": true,
  "message": "Game reset successfully"
}
```

## Configuration

### Changing the AI Model

The Groq model name is defined in exactly ONE place: `config.js`

To change the model, edit the `MODEL_NAME` constant:

```javascript
// config.js
module.exports = {
  MODEL_NAME: 'llama-3.3-70b-versatile', // Change here only
  // ... other config
};
```

Available Groq models:
- `llama-3.3-70b-versatile` (default)
- `openai/gpt-oss-120b`
- `mixtral-8x7b-32768`
- And more at [console.groq.com/docs/models](https://console.groq.com/docs/models)

### Game Settings

All game constants are in `config.js`:

```javascript
module.exports = {
  MODEL_NAME: 'llama-3.3-70b-versatile',
  MIN_PLAYERS: 3,
  MAX_PLAYERS: 12,
  DEFAULT_PLAYERS: 3,
  MIN_CATEGORY_LENGTH: 2,
  MAX_CATEGORY_LENGTH: 60,
  REVEAL_AUTO_HIDE_SECONDS: 10,
  // ... more
};
```

## Example cURL Requests

### Create a Game
```bash
curl -X POST http://localhost:3000/api/new-game \
  -H "Content-Type: application/json" \
  -d '{"category": "Movies", "numPlayers": 4}'
```

### Reveal Player 1
```bash
curl -X POST http://localhost:3000/api/reveal \
  -H "Content-Type: application/json" \
  -d '{"playerIndex": 0}'
```

### Check Game Status
```bash
curl http://localhost:3000/api/status
```

### Reset Game
```bash
curl -X POST http://localhost:3000/api/reset \
  -H "Content-Type: application/json"
```

## Architecture Decisions

### Why In-Memory State?

This app stores game state in server memory (not a database) for simplicity:
- ✅ Zero configuration
- ✅ Fast performance
- ✅ No persistence costs
- ⚠️ Game resets on server restart (perfect for party games!)

For persistent multi-game support, consider adding Redis or a database.

### Why Crypto-Secure Randomness?

The impostor selection uses Node's `crypto.randomInt()` instead of `Math.random()`:
- Cryptographically secure
- No bias or predictability
- Fair selection across all players

### Why Single Model Constant?

The Groq model name is defined in ONE place (`config.js`) to:
- Make model changes trivial (edit one line)
- Prevent version mismatches
- Enable easy experimentation

### Why No Framework?

Vanilla JS keeps the frontend:
- Under 200 lines of code
- Zero build steps
- Fast page loads
- Easy to understand and modify

## Security Notes

- The server never logs the secret word in production
- Each player can only reveal their role once
- Impostor selection is cryptographically random
- Input validation prevents injection attacks
- CORS disabled by default (single-origin app)

## Troubleshooting

### "GROQ_API_KEY environment variable not set"
Make sure you've created a `.env` file with your API key, or set the environment variable on Render.

### "Groq API error: 401"
Your API key is invalid. Get a new one from [console.groq.com](https://console.groq.com/keys).

### "Failed to create game"
Check the server logs. If the Groq API fails twice, the app uses a fallback word instead of breaking.

### Port already in use
Change the `PORT` in your `.env` file to another number (e.g., 3001).

## License

MIT
