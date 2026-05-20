# Quick Start Guide

## 🚀 Get Running in 3 Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Your API Key
Create a `.env` file:
```bash
GROQ_API_KEY=your_actual_groq_api_key_here
```

Get your free API key at: https://console.groq.com/keys

### 3. Start the Server
```bash
npm start
```

Open http://localhost:3000 in your browser!

---

## 🎮 How to Play

1. **Create Game**: Enter a category (e.g., "Fruits") and number of players (3-12)
2. **Reveal Roles**: Pass device to each player, they click their reveal button
   - **Insiders** see the secret word
   - **Impostor** doesn't see the word
3. **Play**: Take turns asking yes/no questions about the word
4. **Vote**: Guess who the impostor is!

---

## ⚙️ Change the AI Model

Edit **ONE file**: `config.js`

```javascript
module.exports = {
  MODEL_NAME: 'llama-3.3-70b-versatile', // ← Change this line only
  // ...
};
```

Popular alternatives:
- `llama-3.3-70b-versatile` - Fast and accurate
- `mixtral-8x7b-32768` - Long context

See all models: https://console.groq.com/docs/models

---

## 📦 Deploy to Render

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect your repo
4. Add environment variable: `GROQ_API_KEY`
5. Deploy!

Render automatically:
- Installs dependencies
- Starts the server on the correct port
- Gives you a public URL

---

## 🐛 Troubleshooting

**Server won't start?**
- Check that your `.env` file exists with a valid `GROQ_API_KEY`

**"API key not set" error?**
- Make sure `.env` is in the project root
- Verify the key is valid at https://console.groq.com/keys

**Port already in use?**
- Add `PORT=3001` to your `.env` file

---

## 📝 Example .env File

```bash
# Required
GROQ_API_KEY=your_groq_api_key_here

# Optional
PORT=3000
```

That's it! You're ready to play! 🎭

