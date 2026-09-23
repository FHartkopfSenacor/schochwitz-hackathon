Digital Twin Chatbot — Local Development

Run a local server to enable OpenAI-backed quote generation and serve the static UI.

1) Create an OpenAI API key

- Go to https://platform.openai.com/api-keys
- Create a new project key if needed
- Copy the key value and keep it private

2) Add the key to your environment before starting the app

Windows PowerShell:

```powershell
cd "c:\Users\fhartkopf\.vscode\projects\schochwitz-hackathon"
$env:OPENAI_API_KEY = "sk-...your-key..."
node server/index.js
```

Linux / macOS:

```bash
cd /path/to/schochwitz-hackathon
export OPENAI_API_KEY="sk-...your-key..."
node server/index.js
```

Optional: create a local `.env` in the `server` folder with:

```env
OPENAI_API_KEY=sk-...your-key...
# Required for projects configured for EU data residency:
OPENAI_API_BASE_URL=https://eu.api.openai.com/v1
```

The server defaults to the EU endpoint above. Override `OPENAI_API_BASE_URL` only when using a project configured for another OpenAI API region.

3) Open the app

Visit `http://localhost:3000` in your browser.
Upload a `style_profile_*.md` file. The app extracts the name and quote pool and sends the full uploaded profile to the server so the LLM can match the profile’s style.

How it works
- Frontend `app.js` sends the uploaded profile text plus the quote pool to `/api/generate`.
- Server `server/index.js` calls OpenAI with a profile-aware prompt that tries to mimic the profile's tone, language, and cadence.
- Each quote shown in the upper game box is sent to `/api/translate`; one structured OpenAI response supplies complete English, Polish, and German translations. The UI labels the result as OpenAI AI, local fallback logic, or no translation.
- If OpenAI is unavailable or no key is configured, the app falls back to local quote generation.

Security note: Keep the key in your shell or `.env` file only. Do not commit keys to source control.

# Digital Twin Chatbot — Local demo

Open the app through the local server. Upload a `style_profile_*.md` file (the hackathon prompt format works). The app will extract the name and quote pool, generate a 10-item round mixing real and AI-generated statements, and let you guess Real vs AI.

- Final score is saved to local history (ranking).
- Clear history with the button.
