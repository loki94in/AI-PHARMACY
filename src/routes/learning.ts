// Learning Engine API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

// Submit learning data (e.g., from POS) for future model improvements
router.post('/', async (req, res) => {
  const { payload } = req.body;
  if (!payload) return res.status(400).json({ error: 'payload required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['LEARNING_DATA', JSON.stringify(payload).slice(0, 200)]
    );
    await db.close();
    res.json({ success: true, message: 'Learning data received' });
  } catch (error) {
    console.error('Learning endpoint error:', error);
    res.status(500).json({ error: 'Failed to store learning data' });
  }
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || ''
});

// Analyze legacy data structure using Claude
router.post('/analyze', async (req, res) => {
  const { sampleData } = req.body;
  if (!sampleData) return res.status(400).json({ error: 'sampleData is required' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ 
      error: 'ANTHROPIC_API_KEY is not set in .env. Please add your key to use the AI Engine.' 
    });
  }

  try {
    const prompt = `You are a Pharmacy Database Migration Expert. 
I am migrating an old legacy database to my new SQLite schema. 
My new schema requires these core fields: item_name, quantity, price, expiry_date, batch_number.

Here is a sample of the raw data from the legacy system (it might be CSV, SQL, or JSON):
---
${sampleData}
---

Please analyze the structure of this data and generate a JSON mapping. 
Return ONLY a valid JSON object where the keys are my new schema fields (item_name, quantity, price, expiry_date, batch_number) and the values are the corresponding exact column/field names from the legacy data. If a field doesn't exist, map it to null.`;

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });

    const aiResponse = message.content[0].type === 'text' ? message.content[0].text : '';
    
    // Extract JSON from response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const mapping = JSON.parse(jsonMatch[0]);
      res.json({ success: true, mapping, raw: aiResponse });
    } else {
      res.json({ success: false, error: 'Could not parse JSON from AI', raw: aiResponse });
    }
  } catch (error: any) {
    console.error('AI Analysis error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Apply processed learning model to database
router.post('/apply-model', async (req, res) => {
  const { rawData, mapping } = req.body;
  if (!rawData || !mapping) return res.status(400).json({ error: 'rawData and mapping required' });
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    // For demo, store raw data and mapping in action_logs
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['LEARNING_APPLY', JSON.stringify({ rawData, mapping })]
    );
    await db.close();
    res.json({ success: true, message: 'Learning model applied' });
  } catch (error) {
    console.error('Apply model error:', error);
    res.status(500).json({ error: 'Failed to apply learning model' });
  }
});
export default router;
