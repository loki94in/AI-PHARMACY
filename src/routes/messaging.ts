// Messaging Hub API (Agent 2)
import express from 'express';
import { initClient, sendMessage, currentQr, isReady } from '../whatsappClient.js';
import QRCode from 'qrcode';

const router = express.Router();

// Get current WhatsApp authentication status and QR code
router.get('/qr', async (req, res) => {
  try {
    if (isReady) {
      return res.json({ isReady: true, qrUrl: null });
    }
    if (currentQr) {
      const qrUrl = await QRCode.toDataURL(currentQr);
      return res.json({ isReady: false, qrUrl });
    }
    res.json({ isReady: false, qrUrl: null, message: 'Waiting for QR generation...' });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

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
