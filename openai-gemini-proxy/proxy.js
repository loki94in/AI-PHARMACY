const express = require('express');
const cors = require('cors');
const axios = require('axios');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'test';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Verify that the Gemini API Key is configured
if (!GEMINI_API_KEY) {
  console.error('CRITICAL: GEMINI_API_KEY is not defined in the environment or .env file.');
  process.exit(1);
}

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Authentication middleware to validate incoming Bearer token
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // If OPENAI_API_KEY is configured to 'test' or empty, we allow access without strict validation
  if (OPENAI_API_KEY === 'test' || !OPENAI_API_KEY) {
    return next();
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: {
        message: 'Missing or invalid Authorization header. Expected Bearer token.',
        type: 'invalid_request_error',
        code: 'unauthorized'
      }
    });
  }

  const token = authHeader.split(' ')[1];
  if (token !== OPENAI_API_KEY) {
    return res.status(401).json({
      error: {
        message: 'Invalid API key provided.',
        type: 'invalid_request_error',
        code: 'invalid_api_key'
      }
    });
  }

  next();
};

/**
 * Maps OpenAI model names to Gemini models dynamically.
 * Defaults to the requested model if it's already a Gemini model.
 */
function mapModel(modelName) {
  const name = modelName.toLowerCase();
  if (name.includes('gpt-4') || name.includes('gpt-3.5') || name.includes('gpt-4o')) {
    // Forward standard OpenAI requests to gemini-1.5-flash by default as it is fast and cheap
    return 'gemini-1.5-flash';
  }
  // Return the requested model directly (e.g. gemini-1.5-pro, gemini-1.5-flash, gemini-2.0-flash-exp)
  return modelName;
}

/**
 * Converts OpenAI chat messages format to Google Gemini generateContent format.
 */
function convertMessagesToGemini(openaiMessages) {
  let systemInstruction = '';
  const contents = [];

  openaiMessages.forEach((msg) => {
    const role = msg.role;
    const content = typeof msg.content === 'string' ? msg.content : (Array.isArray(msg.content) ? msg.content.map(p => p.text || '').join(' ') : '');

    if (role === 'system') {
      // Collect all system messages and combine them
      systemInstruction = systemInstruction ? `${systemInstruction}\n${content}` : content;
    } else {
      // Map OpenAI roles to Gemini roles
      // OpenAI: 'user', 'assistant' -> Gemini: 'user', 'model'
      const geminiRole = role === 'assistant' ? 'model' : 'user';
      contents.push({
        role: geminiRole,
        parts: [{ text: content }]
      });
    }
  });

  // Gemini requires alternating roles starting with 'user'. Let's validate and normalize.
  const normalizedContents = [];
  contents.forEach((item) => {
    if (normalizedContents.length === 0) {
      if (item.role !== 'user') {
        // Prepend empty user message if assistant starts first
        normalizedContents.push({ role: 'user', parts: [{ text: '' }] });
      }
      normalizedContents.push(item);
    } else {
      const lastItem = normalizedContents[normalizedContents.length - 1];
      if (lastItem.role === item.role) {
        // Merge consecutive messages of the same role
        lastItem.parts[0].text = `${lastItem.parts[0].text}\n\n${item.parts[0].text}`;
      } else {
        normalizedContents.push(item);
      }
    }
  });

  const payload = {
    contents: normalizedContents
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }]
    };
  }

  return payload;
}

/**
 * Helper to call Axios with retries for robust request forwarding.
 */
async function axiosWithRetry(config, retries = 3, delay = 1000) {
  try {
    return await axios(config);
  } catch (error) {
    const status = error.response ? error.response.status : null;
    // Retry on 429 (rate limit) or 5xx server errors
    if (retries > 0 && (status === 429 || (status >= 500 && status < 600))) {
      console.warn(`[Retry Warning] Request failed with status ${status}. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return axiosWithRetry(config, retries - 1, delay * 2);
    }
    throw error;
  }
}

// GET /v1/models: OpenAI compatibility endpoint listing models
app.get('/v1/models', authenticate, (req, res) => {
  res.json({
    object: 'list',
    data: [
      { id: 'gemini-1.5-flash', object: 'model', created: 1715644800, owned_by: 'google' },
      { id: 'gemini-1.5-pro', object: 'model', created: 1715644800, owned_by: 'google' },
      { id: 'gemini-2.0-flash-exp', object: 'model', created: 1734048000, owned_by: 'google' }
    ]
  });
});

// POST /v1/chat/completions: The primary chat completion proxy endpoint
app.post('/v1/chat/completions', authenticate, async (req, res) => {
  try {
    const {
      model,
      messages,
      temperature,
      max_tokens,
      top_p,
      stop,
      stream
    } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        error: {
          message: 'messages is a required array field.',
          type: 'invalid_request_error',
          code: 'bad_request'
        }
      });
    }

    const targetModel = mapModel(model || 'gemini-1.5-flash');
    const geminiPayload = convertMessagesToGemini(messages);

    // Populate generation configuration parameters if provided
    const generationConfig = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
    if (top_p !== undefined) generationConfig.topP = top_p;
    if (stop !== undefined) {
      generationConfig.stopSequences = Array.isArray(stop) ? stop : [stop];
    }
    if (Object.keys(generationConfig).length > 0) {
      geminiPayload.generationConfig = generationConfig;
    }

    const createdTime = Math.floor(Date.now() / 1000);
    const responseId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;

    if (stream) {
      // Set up headers for Server-Sent Events (SSE)
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
      
      const response = await axios({
        method: 'post',
        url,
        data: geminiPayload,
        responseType: 'stream'
      });

      let buffer = '';

      response.data.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        // Save the last incomplete line back to the buffer
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue;
          try {
            const rawJson = line.substring(6); // remove 'data: ' prefix
            const parsed = JSON.parse(rawJson);
            const textContent = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const finishReason = parsed.candidates?.[0]?.finishReason || null;

            const openAiChunk = {
              id: responseId,
              object: 'chat.completion.chunk',
              created: createdTime,
              model: targetModel,
              choices: [
                {
                  index: 0,
                  delta: textContent ? { content: textContent } : {},
                  finish_reason: finishReason ? finishReason.toLowerCase() : null
                }
              ]
            };

            res.write(`data: ${JSON.stringify(openAiChunk)}\n\n`);
          } catch (e) {
            console.error('Error parsing SSE stream line:', e.message);
          }
        }
      });

      response.data.on('end', () => {
        // Send final chunk
        res.write('data: [DONE]\n\n');
        res.end();
      });

      response.data.on('error', (err) => {
        console.error('Stream processing error:', err.message);
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
      });

    } else {
      // Non-streaming handler
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${GEMINI_API_KEY}`;

      const response = await axiosWithRetry({
        method: 'post',
        url,
        data: geminiPayload
      });

      const geminiData = response.data;
      const candidate = geminiData.candidates?.[0];
      const textContent = candidate?.content?.parts?.[0]?.text || '';
      const finishReason = candidate?.finishReason || 'STOP';

      const promptTokens = geminiData.usageMetadata?.promptTokenCount || 0;
      const completionTokens = geminiData.usageMetadata?.candidatesTokenCount || 0;
      const totalTokens = geminiData.usageMetadata?.totalTokenCount || 0;

      const openAiResponse = {
        id: responseId,
        object: 'chat.completion',
        created: createdTime,
        model: targetModel,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: textContent
            },
            finish_reason: finishReason.toLowerCase()
          }
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens
        }
      };

      res.json(openAiResponse);
    }

  } catch (error) {
    console.error('Error serving chat completion request:', error.response?.data || error.message);
    const status = error.response?.status || 500;
    const errMessage = error.response?.data?.[0]?.error?.message || error.response?.data?.error?.message || error.message;

    res.status(status).json({
      error: {
        message: errMessage,
        type: 'api_error',
        code: 'gemini_error'
      }
    });
  }
});

// Start the Express server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` OpenAI-to-Gemini Proxy Server is running!`);
  console.log(` Port: ${PORT}`);
  console.log(` Mode: OpenAI Compatibility`);
  console.log(` Local Endpoint: http://localhost:${PORT}/v1`);
  console.log(`==================================================`);
});
