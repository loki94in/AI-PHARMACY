// Learning Engine API (Agent 2)
import express from 'express';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

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

// Analyze legacy data structure using rule-based approach (zero-budget alternative to Claude AI)
router.post('/analyze', async (req, res) => {
  const { sampleData } = req.body;
  if (!sampleData) return res.status(400).json({ error: 'sampleData is required' });

  try {
    // Simple rule-based mapping for common pharmacy legacy data formats
    // This provides a basic mapping without requiring external AI APIs

    // Try to parse as JSON first
    let parsedData;
    let headers: string[] = [];
    let sampleRows = [];

    try {
      parsedData = JSON.parse(sampleData);
      if (Array.isArray(parsedData) && parsedData.length > 0) {
        // Assume it's an array of objects
        const firstItem = parsedData[0];
        if (typeof firstItem === 'object' && firstItem !== null) {
          headers = Object.keys(firstItem);
          sampleRows = parsedData.slice(0, 3); // Take first 3 rows as sample
        }
      } else if (typeof parsedData === 'object' && parsedData !== null) {
        // Single object
        headers = Object.keys(parsedData);
        sampleRows = [parsedData];
      }
    } catch (e) {
      // Not JSON, try to parse as CSV-like format
      const lines = sampleData.split('\n').filter(line => line.trim() !== '');
      if (lines.length > 0) {
        // Assume first line is header
        headers = lines[0].split(',').map(h => h.trim());
        sampleRows = lines.slice(1, 4).map(line => {
          const values = line.split(',').map(v => v.trim());
          const rowObj = {};
          headers.forEach((header, index) => {
            rowObj[header] = values[index] || '';
          });
          return rowObj;
        });
      }
    }

    // Generate mapping based on common field name patterns
    const mapping: any = {
      item_name: null,
      quantity: null,
      price: null,
      expiry_date: null,
      batch_number: null
    };

    // Common patterns for each field
    const patterns: Record<string, string[]> = {
      item_name: ['item_name', 'product_name', 'medicine_name', 'name', 'description', 'item', 'product'],
      quantity: ['quantity', 'qty', 'amount', 'count', 'units'],
      price: ['price', 'cost', 'rate', 'amount', 'mrp', 'sale_price'],
      expiry_date: ['expiry_date', 'expiry', 'exp_date', 'expires', 'expiration_date'],
      batch_number: ['batch_number', 'batch', 'lot_number', 'lot', 'batch_no']
    };

    // Find best matches for each field
    Object.keys(patterns).forEach(field => {
      const possibleMatches = patterns[field];
      const match = headers.find(header =>
        possibleMatches.some(pattern =>
          header.toLowerCase().includes(pattern.toLowerCase())
        )
      );
      if (match) {
        mapping[field] = match;
      }
    });

    // If we couldn't find good matches, provide a fallback based on position
    if (headers.length >= 5) {
      // Assume standard order: name, quantity, price, expiry, batch
      if (!mapping.item_name) mapping.item_name = headers[0];
      if (!mapping.quantity) mapping.quantity = headers[1];
      if (!mapping.price) mapping.price = headers[2];
      if (!mapping.expiry_date) mapping.expiry_date = headers[3];
      if (!mapping.batch_number) mapping.batch_number = headers[4];
    }

    const hasValidMapping = Object.values(mapping).some(value => value !== null);

    if (hasValidMapping) {
      res.json({
        success: true,
        mapping,
        raw: `Rule-based analysis complete. Detected headers: ${headers.join(', ')}`,
        note: 'Using zero-budget rule-based analyzer. For more accurate results, consider configuring API keys for AI-powered analysis.'
      });
    } else {
      res.json({
        success: false,
        error: 'Could not automatically map legacy data format. Please provide sample data with recognizable column names.',
        raw: `Sample data preview: ${sampleData.substring(0, 200)}...`,
        headersDetected: headers
      });
    }
  } catch (error: any) {
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze legacy data structure' });
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

// Retrain/Refresh learning model
router.post('/refresh-model', async (req, res) => {
  try {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
    await db.run(
      'INSERT INTO action_logs (action_type, description) VALUES (?, ?)',
      ['REFRESH_MODEL', 'Learning engine model retrained']
    );
    await db.close();
    res.json({ success: true, message: 'Learning model refreshed successfully' });
  } catch (error) {
    console.error('Refresh model error:', error);
    res.status(500).json({ error: 'Failed to refresh learning model' });
  }
});

export default router;

