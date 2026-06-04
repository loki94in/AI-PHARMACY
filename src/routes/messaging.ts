// Messaging Hub API (Agent 2)
import express from 'express';
import { initClient, sendMessage, currentQr, isReady, forceReconnect } from '../whatsappClient.js';
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
    
    // Trigger initialization if it hasn't started or QR isn't ready
    initClient().catch(console.error);
    
    res.json({ isReady: false, qrUrl: null, message: 'Initializing WhatsApp client. Waiting for QR...' });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Force reconnect and clear session
router.post('/reconnect', async (req, res) => {
  try {
    // Return early to the client, the forceReconnect runs asynchronously 
    // and takes a few seconds to destroy and restart the browser
    forceReconnect().catch(console.error);
    res.json({ success: true, message: 'Reconnecting...' });
  } catch (err) {
    console.error('Reconnect error:', err);
    res.status(500).json({ error: 'Failed to reconnect' });
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

// Get all WhatsApp chats
router.get('/chats', async (req, res) => {
  try {
    const { getChats } = await import('../whatsappClient.js');
    const chats = await getChats();
    // Sanitize the objects to prevent circular JSON stringify issues
    const sanitizedChats = chats.map(c => ({
      id: c.id._serialized,
      name: c.name || c.id.user,
      unreadCount: c.unreadCount,
      timestamp: c.timestamp,
      isGroup: c.isGroup,
      lastMessage: c.lastMessage ? c.lastMessage.body : null
    }));
    res.json(sanitizedChats);
  } catch (err: any) {
    console.error('Error fetching chats:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch chats' });
  }
});

// Get messages for a specific chat
router.get('/chats/:id/messages', async (req, res) => {
  try {
    const { getChatMessages } = await import('../whatsappClient.js');
    const messages = await getChatMessages(req.params.id);
    const sanitizedMessages = messages.map(m => ({
      id: m.id._serialized,
      body: m.body,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
      type: m.type,
      hasMedia: m.hasMedia
    }));
    res.json(sanitizedMessages);
  } catch (err: any) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch messages' });
  }
});

export default router;
