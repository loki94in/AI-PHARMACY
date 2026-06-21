import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { dbManager } from '../database/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '..', '..', 'data', 'app.db');

const router = express.Router();

function findChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : null
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function getPharmarackSettings() {
  const db = await dbManager.getConnection();
  await db.run('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)');
  const rows = await db.all("SELECT key, value FROM app_settings WHERE key LIKE 'pharmarack_%'");
  const settings: Record<string, string> = {};
  rows.forEach(r => {
    settings[r.key] = r.value;
  });
  return settings;
}

// Search endpoint
router.get('/search', async (req, res) => {
  const q = (req.query.q as string || '').toLowerCase().trim();
  if (!q) {
    return res.json([]);
  }

  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
    }

    try {
      const payload = {
        SearchKeyword: q,
        StoreId: [],
        NonMappedStoreId: [],
        Count: 50,
        SkipCount: 0,
        isMappedSearch: null,
        IsStock: 2,
        IsScheme: 2,
        IsSort: 1,
        CartSource: 'MOVP'
      };

      const response = await fetch('https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/search', {
        method: 'POST',
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Content-Type': 'application/json',
          'devicetype': 'web',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://retailers.pharmarack.com/',
          'Origin': 'https://retailers.pharmarack.com'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });
      
      if (response.ok) {
        const data: any = await response.json();
        if (data && Array.isArray(data.data)) {
          const mappedProducts = data.data.map((p: any) => ({
            name: p.ProductName || p.ProductFullName || '',
            packaging: p.Packing || '',
            distributor: p.StoreName || '',
            rate: p.PTR !== undefined ? p.PTR : null,
            mrp: p.MRP !== undefined ? p.MRP : null,
            mapped: p.IsMapped === 1,
            stock: p.Stock !== undefined ? String(p.Stock) : 'High',
            scheme: p.Scheme || p.SchemeDescription || p.ProductScheme || '',
            productId: p.ProductId,
            storeId: p.StoreId
          }));
          return res.json(mappedProducts);
        } else {
          console.error('Pharmarack search response structure unexpected:', data);
          return res.status(503).json({ error: 'Search failed, unexpected response from server', code: 'UNEXPECTED_RESPONSE' });
        }
      } else {
        const status = response.status;
        console.error(`Pharmarack search response status: ${status}`);
        if (status === 401 || status === 403) {
          return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
        }
        return res.status(503).json({ error: 'Connection error, please check internet or reconnect', code: 'CONNECTION_ERROR' });
      }
    } catch (err: any) {
      console.error('Pharmarack live API search failed:', err.message);
      return res.status(503).json({ error: 'Connection error, please check internet or reconnect', code: 'CONNECTION_ERROR' });
    }


  } catch (err: any) {
    console.error('Pharmarack search simulator error:', err);
    res.status(500).json({ error: 'Failed to search Pharmarack catalog' });
  }
});

// Launch non-headless login window
router.post('/login-window', async (req, res) => {
  const chromePath = findChromePath();
  if (!chromePath) {
    return res.status(404).json({ error: 'Google Chrome was not found on your system. Please install Google Chrome to use this feature.' });
  }

  // Clear existing session token in database so polling detects the transition
  try {
    const db = await dbManager.getConnection();
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_session_token', '')");
  } catch (err) {
    console.error('Error clearing old session token:', err);
  }

  res.json({ success: true, message: 'Opening login window...' });

  (async () => {
    try {
      console.log('Launching Chrome from:', chromePath);
      const pharmarackProfilePath = path.resolve(__dirname, '..', '..', 'data', 'pharmarack_profile');
      const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: false,
        defaultViewport: null,
        userDataDir: pharmarackProfilePath,
        args: ['--start-maximized']
      });

      const [page] = await browser.pages();
      
      let extractedToken = '';
      page.on('request', request => {
        const headers = request.headers();
        const auth = headers['authorization'] || headers['Authorization'];
        if (auth && auth.length > 15) {
          let tokenVal = auth;
          if (auth.startsWith('Bearer ') || auth.startsWith('bearer ')) {
            tokenVal = auth.substring(7);
          }
          if (tokenVal && tokenVal.length > 10) {
            extractedToken = tokenVal;
          }
        }
      });

      await page.goto('https://retailers.pharmarack.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });

      let lastUsername = '';
      let lastPassword = '';

      for (let i = 0; i < 300; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const isClosed = !browser.connected || (await browser.pages().catch(() => [])).length === 0;
        if (isClosed) {
          console.log('Pharmarack login window closed by user.');
          break;
        }

        // Dynamically scrape input fields for username & password
        try {
          const creds = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            let u = '';
            let p = '';
            for (const input of inputs) {
              if (input.type === 'password') {
                p = input.value;
              } else if (
                input.type === 'text' || 
                input.type === 'tel' || 
                input.type === 'number' || 
                input.type === 'email'
              ) {
                const id = (input.id || '').toLowerCase();
                const name = (input.name || '').toLowerCase();
                const placeholder = (input.placeholder || '').toLowerCase();
                if (
                  id.includes('username') || name.includes('username') ||
                  id.includes('mobile') || name.includes('mobile') || placeholder.includes('mobile') ||
                  id.includes('phone') || name.includes('phone') ||
                  id.includes('login') || name.includes('login')
                ) {
                  u = input.value;
                } else if (!u && input.value) {
                  u = input.value;
                }
              }
            }
            return { u, p };
          });
          if (creds.u) lastUsername = creds.u;
          if (creds.p) lastPassword = creds.p;
        } catch (e) {
          // Ignore navigation/detachment errors during evaluate
        }

        if (extractedToken) {
          console.log('Extracted Pharmarack Session Token from request headers!');
          const db = await dbManager.getConnection();
          await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_session_token', ?)", [extractedToken]);
          await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");
          if (lastUsername) {
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_username', ?)", [lastUsername]);
          }
          if (lastPassword) {
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_password', ?)", [lastPassword]);
          }
          break;
        }

        const currentUrl = page.url();
        if (currentUrl.includes('pharmarack.com') && !currentUrl.includes('/login') && !currentUrl.includes('/forgot')) {
          console.log('Login redirect detected:', currentUrl);
          
          await new Promise(resolve => setTimeout(resolve, 2000));

          if (extractedToken) {
            const db = await dbManager.getConnection();
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_session_token', ?)", [extractedToken]);
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");
            if (lastUsername) {
              await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_username', ?)", [lastUsername]);
            }
            if (lastPassword) {
              await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_password', ?)", [lastPassword]);
            }
            break;
          }

          const cookies = await page.cookies();
          const token = await page.evaluate(() => {
            const findTokenInString = (str: string): string => {
              if (str.startsWith('{') || str.startsWith('[')) {
                try {
                  const parsed = JSON.parse(str);
                  if (parsed && typeof parsed === 'object') {
                    const keys = ['token', 'access_token', 'accessToken', 'jwt', 'session', 'sessionToken', 'id_token'];
                    for (const k of keys) {
                      if (parsed[k] && typeof parsed[k] === 'string' && parsed[k].length > 10) {
                        return parsed[k];
                      }
                    }
                    for (const k of Object.keys(parsed)) {
                      if (typeof parsed[k] === 'object' || typeof parsed[k] === 'string') {
                        const res = findTokenInString(typeof parsed[k] === 'string' ? parsed[k] : JSON.stringify(parsed[k]));
                        if (res) return res;
                      }
                    }
                  }
                } catch (e) {}
              }
              return '';
            };

            for (let j = 0; j < localStorage.length; j++) {
              const key = localStorage.key(j) || '';
              const val = localStorage.getItem(key) || '';
              if (val.length > 10) {
                if (
                  key.toLowerCase().includes('token') || 
                  key.toLowerCase().includes('jwt') || 
                  key.toLowerCase().includes('auth') || 
                  key.toLowerCase().includes('session') ||
                  key.toLowerCase().includes('user')
                ) {
                  const nested = findTokenInString(val);
                  if (nested) return nested;
                  return val;
                }
              }
            }

            for (let j = 0; j < sessionStorage.length; j++) {
              const key = sessionStorage.key(j) || '';
              const val = sessionStorage.getItem(key) || '';
              if (val.length > 10) {
                if (
                  key.toLowerCase().includes('token') || 
                  key.toLowerCase().includes('jwt') || 
                  key.toLowerCase().includes('auth') || 
                  key.toLowerCase().includes('session') ||
                  key.toLowerCase().includes('user')
                ) {
                  const nested = findTokenInString(val);
                  if (nested) return nested;
                  return val;
                }
              }
            }
            return '';
          });

          const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
          const sessionVal = token || cookieStr;

          if (sessionVal) {
            console.log('Extracted Pharmarack Session Token!');
            
            const db = await dbManager.getConnection();
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_session_token', ?)", [sessionVal]);
            await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");
            if (lastUsername) {
              await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_username', ?)", [lastUsername]);
            }
            if (lastPassword) {
              await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_password', ?)", [lastPassword]);
            }
            break;
          }
        }
      }

      await browser.close();
      console.log('Pharmarack login window closed.');
    } catch (err: any) {
      console.error('Error during Pharmarack login window scraping:', err);
    }
  })();
});

// Add to Pharmarack cart
router.post('/cart/add', async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items provided' });
  }

  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    const payload = {
      CartSource: 'MOVP',
      CartItems: items.map((item: any) => ({
        ProductId: Number(item.productId) || 0,
        StoreId: Number(item.storeId) || 0,
        Quantity: Number(item.qty) || 1,
        Rate: item.rate !== undefined ? Number(item.rate) : 0,
        Scheme: item.scheme || ''
      }))
    };

    if (!token) {
      return res.status(401).json({ error: 'Need to login to Pharmarack to add items to cart', code: 'NEED_LOGIN' });
    }

    let cartSuccess = false;
    let lastError = '';

    // Try primary API endpoint
    try {
      const response1 = await fetch('https://retailers.pharmarack.com/api/v2/cart', {
        method: 'POST',
        headers: {
          'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
          'Content-Type': 'application/json',
          'devicetype': 'web',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://retailers.pharmarack.com/',
          'Origin': 'https://retailers.pharmarack.com'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });
      
      if (response1.ok) {
        cartSuccess = true;
      } else {
        const errText = await response1.text().catch(() => '');
        lastError = `retailers.pharmarack.com/api/v2/cart status: ${response1.status}. Reason: ${errText || 'Unknown'}`;
      }
    } catch (err: any) {
      lastError = err.message;
    }

    // Try secondary backup search-proxy cart endpoint if first failed
    if (!cartSuccess) {
      try {
        const response2 = await fetch('https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/cart', {
          method: 'POST',
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://retailers.pharmarack.com/',
            'Origin': 'https://retailers.pharmarack.com'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000)
        });
        
        if (response2.ok) {
          cartSuccess = true;
        } else {
          const errText = await response2.text().catch(() => '');
          lastError = `pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/cart status: ${response2.status}. Reason: ${errText || 'Unknown'} (Previous: ${lastError})`;
        }
      } catch (err: any) {
        lastError = `Secondary error: ${err.message} (Previous: ${lastError})`;
      }
    }

    if (cartSuccess) {
      return res.json({ success: true, message: 'Successfully added to Pharmarack cart!', mode: 'Live' });
    } else {
      return res.status(503).json({ error: 'Failed to add items to actual Pharmarack cart', details: lastError });
    }
  } catch (err: any) {
    console.error('Pharmarack cart route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch current Pharmarack cart
router.get('/cart', async (req, res) => {
  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
    }

    // Try primary cart endpoint
    let cartData: any = null;
    let lastError = '';

    const endpoints = [
      'https://retailers.pharmarack.com/api/v2/cart',
      'https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/cart'
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://retailers.pharmarack.com/',
            'Origin': 'https://retailers.pharmarack.com'
          },
          signal: AbortSignal.timeout(8000)
        });

        if (response.ok) {
          cartData = await response.json();
          break;
        } else {
          lastError = `${url} status: ${response.status}`;
          if (response.status === 401 || response.status === 403) {
            return res.status(401).json({ error: 'Session expired. Please re-login from the Learning page.', code: 'SESSION_EXPIRED' });
          }
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!cartData) {
      return res.status(503).json({ error: 'Could not fetch cart from Pharmarack. ' + lastError });
    }

    // Normalise different possible response shapes
    let items: any[] = [];
    if (Array.isArray(cartData)) {
      items = cartData;
    } else if (cartData.data && Array.isArray(cartData.data)) {
      items = cartData.data;
    } else if (cartData.CartItems && Array.isArray(cartData.CartItems)) {
      items = cartData.CartItems;
    } else if (cartData.cartItems && Array.isArray(cartData.cartItems)) {
      items = cartData.cartItems;
    }

    const normalised = items.map((item: any) => ({
      productId: item.ProductId || item.productId,
      storeId: item.StoreId || item.storeId,
      productName: item.ProductName || item.productName || item.Name || item.name || 'Unknown Product',
      packaging: item.Packing || item.packaging || item.Pack || '',
      distributor: item.StoreName || item.storeName || item.distributor || '',
      qty: item.Quantity || item.quantity || item.qty || 1,
      rate: item.Rate || item.rate || item.PTR || null,
      mrp: item.MRP || item.mrp || null,
      scheme: item.Scheme || item.scheme || '',
      amount: item.Amount || item.amount || item.TotalAmount || null,
    }));

    return res.json({ success: true, mode: 'Live', items: normalised, total: normalised.length });
  } catch (err: any) {
    console.error('Pharmarack cart fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-verify saved session token and update mode
router.get('/auto-verify', async (req, res) => {
  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      const db = await dbManager.getConnection();
      await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Simulation')");
      return res.json({ healthy: false, mode: 'Simulation', reason: 'NO_TOKEN', needs_login: true, message: 'No session token found' });
    }

    let healthy = false;
    let reason = 'EXPIRED';
    let message = 'Session expired';

    const endpoints = [
      'https://retailers.pharmarack.com/api/v2/cart',
      'https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/cart'
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://retailers.pharmarack.com/',
            'Origin': 'https://retailers.pharmarack.com'
          },
          signal: AbortSignal.timeout(4000)
        });

        if (response.ok) {
          healthy = true;
          break;
        } else {
          if (response.status === 401 || response.status === 403) {
            reason = 'EXPIRED';
            message = 'Session expired or invalid token';
          } else {
            reason = 'SERVER_ERROR';
            message = `Server returned status ${response.status}`;
          }
        }
      } catch (err: any) {
        reason = 'NETWORK_ERROR';
        message = err.message || 'Network timeout/connection error';
      }
    }

    const db = await dbManager.getConnection();
    if (healthy) {
      await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");
      return res.json({ healthy: true, mode: 'Live', message: 'Session active and verified' });
    } else {
      await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");
      return res.json({ healthy: false, mode: 'Live', reason, needs_login: true, message });
    }
  } catch (err: any) {
    console.error('Session auto-verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Check Pharmarack session status
router.get('/session-status', async (req, res) => {
  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      return res.json({ healthy: false, mode: 'Live', reason: 'NO_TOKEN', message: 'Session not linked' });
    }

    let healthy = false;
    let reason = 'EXPIRED';
    let message = 'Session expired';

    const endpoints = [
      'https://retailers.pharmarack.com/api/v2/cart',
      'https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/cart'
    ];

    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://retailers.pharmarack.com/',
            'Origin': 'https://retailers.pharmarack.com'
          },
          signal: AbortSignal.timeout(4000)
        });

        if (response.ok) {
          healthy = true;
          break;
        } else {
          if (response.status === 401 || response.status === 403) {
            reason = 'EXPIRED';
            message = 'Session expired or invalid token';
          } else {
            reason = 'SERVER_ERROR';
            message = `Server returned status ${response.status}`;
          }
        }
      } catch (err: any) {
        reason = 'NETWORK_ERROR';
        message = err.message || 'Network timeout/connection error';
      }
    }

    return res.json({ healthy, mode: 'Live', reason: healthy ? undefined : reason, message: healthy ? 'Session active' : message });
  } catch (err: any) {
    console.error('Session status check error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

