import express from 'express';
import { listPlugins, loadAllPlugins, runHook } from '../plugins/pluginHost.js';

const router = express.Router();

// GET /api/plugins — list all loaded plugins with status
router.get('/plugins', (_req, res) => {
  try {
    const plugins = listPlugins();
    res.json({ success: true, plugins });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/plugins/reload — reload all plugins from disk
router.post('/plugins/reload', (_req, res) => {
  try {
    const result = loadAllPlugins();
    const plugins = listPlugins();
    res.json({ success: true, ...result, plugins });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/plugins/run-hook — run a named hook with a JSON context payload
router.post('/plugins/run-hook', async (req, res) => {
  const { hookName, ctx } = req.body ?? {};
  if (!hookName) return res.status(400).json({ success: false, error: 'hookName is required' });
  try {
    const result = await runHook(hookName, ctx ?? {});
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
