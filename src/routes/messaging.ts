// Messaging Hub API (Agent 2)
import express from 'express';
import { initClient, sendMessage } from '../whatsappClient.js';

const router = express.Router();

// Send a WhatsApp message via the hub
router.post('/send', async (req, res) => {
  const { number, message, mediaUrl } = req.body;
  if (!number || !message) {
    return res.status(400).json({ error: 'number and message required' });
  }
  try {
    await sendMessage(number, mediaUrl, message);
    res.json({ success: true, message: 'WhatsApp message sent' });
  } catch (err) {
    console.error('Messaging hub error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
