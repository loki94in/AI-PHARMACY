# OpenAI-to-Gemini Proxy Server

This proxy server enables developer tools and SDKs designed for OpenAI to interact seamlessly with Google's Gemini Models via the Google AI Studio API.

## Features

- **Express + Axios**: Built on Node.js.
- **Model Translation**: Transparently maps standard OpenAI models (like `gpt-4o`) to dynamic Gemini endpoints (`gemini-1.5-flash`).
- **OpenAI Compatibility**: Exposes `GET /v1/models` and `POST /v1/chat/completions` routes.
- **Payload Conversion**: Gracefully handles system prompts, alternating roles, and merges sequential turns.
- **Streaming Support**: Emits real-time Server-Sent Events (SSE) in standard OpenAI format.
- **Error Handling & Retries**: Automatic retries with backoff for rate limits and connection issues.

---

## Setup & Startup Instructions

### 1. Install Dependencies
Run the following command inside the `openai-gemini-proxy` directory to install the required packages:
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your details:
```bash
PORT=3000
OPENAI_API_KEY=test
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start the Server
To spin up the proxy server, execute:
```bash
node proxy.js
```
The server will boot and log the start status:
```
==================================================
 OpenAI-to-Gemini Proxy Server is running!
 Port: 3000
 Mode: OpenAI Compatibility
 Local Endpoint: http://localhost:3000/v1
==================================================
```

---

## Example Integrations

### Antigravity IDE
Point Antigravity or your IDE workspace to the local proxy server:
```env
OPENAI_BASE_URL=http://localhost:3000/v1
OPENAI_API_KEY=test
```

### OpenAI Node.js SDK
You can initialize the official OpenAI client using your local server url:
```javascript
const { OpenAI } = require('openai');

const openai = new OpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'test' // Must match the OPENAI_API_KEY value in .env
});

async function main() {
  const completion = await openai.chat.completions.create({
    model: 'gemini-1.5-flash',
    messages: [{ role: 'user', content: 'Say hello in 3 words.' }],
    stream: false,
  });
  console.log(completion.choices[0].message.content);
}
main();
```

### LiteLLM
Configure LiteLLM to point to the local proxy:
```bash
litellm --model openai/gemini-1.5-flash --api_base http://localhost:3000/v1 --api_key test
```
