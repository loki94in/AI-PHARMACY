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

// In-memory cache for search queries to prevent upstream rate limits (429)
const searchCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Search endpoint
router.get('/search', async (req, res) => {
  const q = (req.query.q as string || '').toLowerCase().trim();
  if (!q) {
    return res.json([]);
  }

  const storeId = req.query.storeId ? Number(req.query.storeId) : null;
  const isMapped = req.query.isMapped === 'true';
  const hasStoreFilter = storeId !== null && !isNaN(storeId);
  const cacheKey = storeId ? `${q}_store_${storeId}_mapped_${isMapped}` : q;

  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      const mode = settings['pharmarack_mode'] || 'Simulation';
      if (mode === 'Simulation') {
        const mockProducts = [
          {
            name: `${q.charAt(0).toUpperCase() + q.slice(1)} 650mg Tablet (Simulated)`,
            packaging: "15 tabs",
            distributor: "Diamond Drug Stores (Simulated)",
            rate: 28.50,
            mrp: 32.00,
            mapped: true,
            stock: "High",
            scheme: "10+1",
            productId: 2001,
            productCode: "MOCK-PROD-1",
            company: "Generic Pharma",
            storeId: 101
          },
          {
            name: `${q.charAt(0).toUpperCase() + q.slice(1)} 100ml Syrup (Simulated)`,
            packaging: "1 bottle",
            distributor: "Aaru Pharma (Simulated)",
            rate: 45.00,
            mrp: 50.00,
            mapped: false,
            stock: "15",
            scheme: "5+1",
            productId: 2002,
            productCode: "MOCK-PROD-2",
            company: "Generic Health",
            storeId: 102
          }
        ];
        return res.json(mockProducts);
      }
      return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
    }

    try {
      const payload: any = {
        SearchKeyword: q,
        StoreId: hasStoreFilter && isMapped ? [storeId] : [],
        NonMappedStoreId: hasStoreFilter && !isMapped ? [storeId] : [],
        Count: 50,
        SkipCount: 0,
        isMappedSearch: hasStoreFilter ? isMapped : null,
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
            productId: p.PrProductId || p.ProductId || p.ProductCode,
            productCode: p.ProductCode || '',
            company: p.Company || '',
            storeId: p.StoreId
          }));
          
          // Cache successful response
          searchCache.set(cacheKey, { timestamp: Date.now(), data: mappedProducts });
          
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

// Fetch store list grouped by mapped vs non-mapped
router.get('/distributors', async (req, res) => {
  try {
    const settings = await getPharmarackSettings();
    const token = settings['pharmarack_session_token'] || '';

    if (!token) {
      return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
    }

    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    const response = await fetch('https://pharmretail-api.pharmarack.com/user/api/v2/store-list', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'devicetype': 'web',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://retailers.pharmarack.com/',
        'Origin': 'https://retailers.pharmarack.com'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ error: 'Session expired. Please login again.', code: 'NEED_LOGIN' });
    }
    if (!response.ok) {
      return res.status(503).json({ error: `Pharmarack API returned status ${response.status}` });
    }

    const data: any = await response.json();
    if (!data || !data.success || !data.data || !Array.isArray(data.data.Stores)) {
      return res.status(503).json({ error: 'Unexpected response structure from Pharmarack store list API' });
    }

    const stores = data.data.Stores.map((s: any) => ({
      storeId: s.StoreId,
      storeName: s.StoreName || 'Unknown Store',
      isMapped: s.Ismapped === 1,
      partyCode: s.PartyCode || '',
      address: s.Address1 || '',
      city: s.City || '',
      mobileNumber: s.MobileNumber || '',
      email: s.Email || '',
      contactPerson: s.ContactPerson || '',
      remarks: s.OrderRemarks || ''
    }));

    const mapped = stores.filter((s: any) => s.isMapped);
    const nonMapped = stores.filter((s: any) => !s.isMapped);

    return res.json({ success: true, mapped, nonMapped });
  } catch (err: any) {
    console.error('Pharmarack distributors fetch error:', err);
    return res.status(500).json({ error: 'Internal server error: ' + err.message });
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
          const creds = await page.evaluate(`(() => {
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
          })()`) as { u: string; p: string };
          if (creds.u) lastUsername = creds.u;
          if (creds.p) lastPassword = creds.p;
        } catch (e) {
          // Ignore navigation/detachment errors during evaluate
        }

        const currentUrl = page.url();
        const isOnMainApp = currentUrl.includes('pharmarack.com') && 
                            !currentUrl.includes('/login') && 
                            !currentUrl.includes('/otp') && 
                            !currentUrl.includes('/verification') && 
                            !currentUrl.includes('/forgot');

        if (extractedToken && isOnMainApp) {
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

        if (isOnMainApp) {
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
          const token = await page.evaluate(`(() => {
            const findTokenInString = (str) => {
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
          })()`) as string;

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

    if (!token) {
      const mode = settings['pharmarack_mode'] || 'Simulation';
      if (mode === 'Simulation') {
        return res.json({ success: true, message: 'Successfully added to Pharmarack cart (Simulated)!', mode: 'Simulation' });
      }
      return res.status(401).json({ error: 'Need to login to Pharmarack to add items to cart', code: 'NEED_LOGIN' });
    }

    // Try to enrich each item's properties from the searchCache or on-the-fly search
    for (const item of items) {
      if (!item.productCode || !item.productName) {
        // Look in search cache
        for (const [_, cacheEntry] of searchCache.entries()) {
          const matched = cacheEntry.data.find((p: any) => p.productId === item.productId && p.storeId === item.storeId);
          if (matched) {
            item.productCode = matched.productCode;
            item.productName = matched.name;
            item.storeName = matched.distributor;
            item.company = matched.company;
            item.mrp = matched.mrp;
            item.rate = matched.rate;
            break;
          }
        }
      }

      // If still missing, query search API on-the-fly
      if (!item.productCode && token) {
        try {
          let cleanKeyword = (item.product || item.name || '').trim();
          cleanKeyword = cleanKeyword.replace(/\s*\([^)]*\)\s*$/, '').trim();
          const searchPayload = {
            SearchKeyword: cleanKeyword,
            StoreId: [],
            NonMappedStoreId: [],
            Count: 10,
            SkipCount: 0,
            isMappedSearch: null,
            IsStock: 2,
            IsScheme: 2,
            IsSort: 1,
            CartSource: 'MOVP'
          };
          const searchRes = await fetch('https://pharmretail-elasticsearch.pharmarack.com/open-search/api/v2/search', {
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
            body: JSON.stringify(searchPayload),
            signal: AbortSignal.timeout(4000)
          });
          if (searchRes.ok) {
            const searchData: any = await searchRes.json();
            if (searchData && Array.isArray(searchData.data)) {
              const matched = searchData.data.find((p: any) => p.PrProductId === item.productId && p.StoreId === item.storeId) || searchData.data[0];
              if (matched) {
                item.productCode = matched.ProductCode || '';
                item.productName = matched.ProductName || matched.ProductFullName || '';
                item.storeName = matched.StoreName || '';
                item.company = matched.Company || '';
                item.mrp = matched.MRP || 0;
                item.rate = matched.PTR || 0;
              }
            }
          }
        } catch (err) {
          console.error('On-the-fly search enrichment failed:', err);
        }
      }
    }

    let cartSuccess = false;
    let lastError = '';

    // Primary: Call the official AddUserProductCartDetail API
    try {
      for (const item of items) {
        const rateVal = Number(item.rate || item.ptr || item.PTR || 0);
        const payload = {
          StoreId: Number(item.storeId) || 0,
          StoreName: item.storeName || '',
          ProductCode: item.productCode || '',
          Quantity: Number(item.qty || item.Quantity || 1),
          PTR: rateVal,
          Free: 0,
          HiddenPTR: rateVal,
          NetRate: rateVal,
          Scheme: item.scheme || '',
          SchemeType: '',
          GSTPercentage: 0,
          ItemGSTValue: 0,
          CartSource: 'MOVP',
          DeliveryOption: '',
          RemarkForStore: '',
          ProductAddedBy: 0,
          Priority: '',
          OrderPlaced: 0,
          OrderPlacedBy: 0,
          CreatedBy: 0,
          ProductName: item.productName || item.product || '',
          StoreProductName: item.productName || item.product || '',
          StoreWiseAmount: 0,
          StoreWiseGSTAmount: 0,
          IsDeleted: 0,
          AllowMinQty: 0,
          AllowMaxQty: 0,
          StepUpValue: 1,
          AllowMOQ: true,
          MinItemLimit: 0,
          MaxItemLimit: 0,
          MinAmountLimit: 0,
          MaxAmountLimit: 0,
          DODIsPrefenceSet: 0,
          IsDODPreferenceSet: 0,
          DisplayHalfSchemeOn: '',
          DisplayHalfScheme: '0',
          RetailerSchemePreference: 1,
          HalfSchemeValueToRetailer: 0,
          RoundOffDisplayHS: '',
          MinOrderQuantity: 0,
          MaxOrderQuantity: 0,
          IsDODProduct: 0,
          IsDODProductCheck: 0,
          IsDODProductSelected: 0,
          OrderDeliveryModeStatus: 1,
          OrderRemarks: 1,
          SpecialRate: 0,
          Stock: 999,
          RShowPtr: 1,
          IsPartyLocked: 0,
          RewardSchemeId: 0,
          IsProductChecked: 1,
          DeliveryPerson: '',
          DeliveryPersonCode: '',
          RShowPtrForAllCompanies: 1,
          Company: item.company || '',
          IsGroupWisePTR: 0,
          IsGroupWisePTRRetailer: 0,
          RateValidity: null,
          IsShowNonMappedOrderStock: 1,
          RStockVisibility: 0,
          IsMapped: (item.mapped === false || item.isMapped === false) ? 0 : 1,
          ProductId: Number(item.productId) || 0,
          MRP: String(item.mrp || rateVal),
          ProductWiseAmount: 0,
          ProductWiseGSTAmount: 0,
          ProductWiseSchemeAmount: 0,
          ProductWiseSchemeGSTAmount: 0,
          StoreWiseSchemeAmount: 0,
          StoreWiseSchemeGSTAmount: 0,
          ProductLock: 0,
          BoxPacking: '0',
          CasePacking: item.packaging || item.Packing || '1 strip',
          Packing: item.packaging || item.Packing || '1 strip'
        };

        const response = await fetch('https://pharmretail-api.pharmarack.com/cart/api/v1/AddUserProductCartDetail', {
          method: 'POST',
          headers: {
            'Authorization': token.startsWith('Bearer ') ? token : `Bearer ${token}`,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://retailers.pharmarack.com/',
            'Origin': 'https://retailers.pharmarack.com'
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(6000)
        });

        if (response.ok) {
          const resJson = await response.json();
          if (resJson && resJson.StatusCode === 200) {
            cartSuccess = true;
          } else {
            lastError = `AddUserProductCartDetail response: ${resJson.message || 'Unknown error'}`;
            cartSuccess = false;
            break;
          }
        } else {
          const errText = await response.text().catch(() => '');
          lastError = `AddUserProductCartDetail status: ${response.status}. Details: ${errText}`;
          cartSuccess = false;
          break;
        }
      }
    } catch (err: any) {
      lastError = err.message;
      cartSuccess = false;
    }

    // Tier 2: Headless Browser context evaluate fallback
    if (!cartSuccess) {
      const chromePath = findChromePath();
      if (chromePath) {
        console.log('API cart requests failed. Initiating headless browser fallback...');
        const pharmarackProfilePath = path.resolve(__dirname, '..', '..', 'data', 'pharmarack_profile');
        let browser;
        try {
          browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            userDataDir: pharmarackProfilePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
          });
          const [page] = await browser.pages();
          
          await page.goto('https://retailers.pharmarack.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          for (const item of items) {
            const rateVal = Number(item.rate || item.ptr || item.PTR || 0);
            const payload = {
              StoreId: Number(item.storeId) || 0,
              StoreName: item.storeName || '',
              ProductCode: item.productCode || '',
              Quantity: Number(item.qty || item.Quantity || 1),
              PTR: rateVal,
              Free: 0,
              HiddenPTR: rateVal,
              NetRate: rateVal,
              Scheme: item.scheme || '',
              SchemeType: '',
              GSTPercentage: 0,
              ItemGSTValue: 0,
              CartSource: 'MOVP',
              DeliveryOption: '',
              RemarkForStore: '',
              ProductAddedBy: 0,
              Priority: '',
              OrderPlaced: 0,
              OrderPlacedBy: 0,
              CreatedBy: 0,
              ProductName: item.productName || item.product || '',
              StoreProductName: item.productName || item.product || '',
              StoreWiseAmount: 0,
              StoreWiseGSTAmount: 0,
              IsDeleted: 0,
              AllowMinQty: 0,
              AllowMaxQty: 0,
              StepUpValue: 1,
              AllowMOQ: true,
              MinItemLimit: 0,
              MaxItemLimit: 0,
              MinAmountLimit: 0,
              MaxAmountLimit: 0,
              DODIsPrefenceSet: 0,
              IsDODPreferenceSet: 0,
              DisplayHalfSchemeOn: '',
              DisplayHalfScheme: '0',
              RetailerSchemePreference: 1,
              HalfSchemeValueToRetailer: 0,
              RoundOffDisplayHS: '',
              MinOrderQuantity: 0,
              MaxOrderQuantity: 0,
              IsDODProduct: 0,
              IsDODProductCheck: 0,
              IsDODProductSelected: 0,
              OrderDeliveryModeStatus: 1,
              OrderRemarks: 1,
              SpecialRate: 0,
              Stock: 999,
              RShowPtr: 1,
              IsPartyLocked: 0,
              RewardSchemeId: 0,
              IsProductChecked: 1,
              DeliveryPerson: '',
              DeliveryPersonCode: '',
              RShowPtrForAllCompanies: 1,
              Company: item.company || '',
              IsGroupWisePTR: 0,
              IsGroupWisePTRRetailer: 0,
              RateValidity: null,
              IsShowNonMappedOrderStock: 1,
              RStockVisibility: 0,
              IsMapped: (item.mapped === false || item.isMapped === false) ? 0 : 1,
              ProductId: Number(item.productId) || 0,
              MRP: String(item.mrp || rateVal),
              ProductWiseAmount: 0,
              ProductWiseGSTAmount: 0,
              ProductWiseSchemeAmount: 0,
              ProductWiseSchemeGSTAmount: 0,
              StoreWiseSchemeAmount: 0,
              StoreWiseSchemeGSTAmount: 0,
              BoxPacking: '0',
              CasePacking: item.packaging || item.Packing || '1 strip',
              Packing: item.packaging || item.Packing || '1 strip'
            };

            const contextResult = await page.evaluate(`async (payload, token) => {
              try {
                let res = await fetch('https://pharmretail-api.pharmarack.com/cart/api/v1/AddUserProductCartDetail', {
                  method: 'POST',
                  headers: {
                    'Authorization': token.startsWith('Bearer ') ? token : 'Bearer ' + token,
                    'Content-Type': 'application/json',
                    'devicetype': 'web'
                  },
                  body: JSON.stringify(payload)
                });
                if (res.ok) {
                  let rJson = await res.json();
                  if (rJson && rJson.StatusCode === 200) return { success: true };
                  return { success: false, error: rJson.message || 'Verification failed' };
                }
                let errText = await res.text().catch(() => '');
                return { success: false, error: 'Status: ' + res.status + ' | ' + errText };
              } catch (e) {
                return { success: false, error: e.message };
              }
            }`, payload, token) as { success: boolean; error?: string };

            if (contextResult && contextResult.success) {
              cartSuccess = true;
            } else {
              cartSuccess = false;
              lastError += ` | Headless context error: ${contextResult?.error || 'Unknown'}`;
              break;
            }
          }

          // Tier 3: UI automation fallback
          if (!cartSuccess) {
            console.log('Page context evaluation failed. Trying UI automation...');
            await page.goto('https://retailers.pharmarack.com/search', { waitUntil: 'networkidle2', timeout: 30000 });
            
            for (const item of items) {
              const searchSelector = 'input[placeholder*="search" i], input[placeholder*="medicine" i], input[type="search"]';
              await page.waitForSelector(searchSelector, { timeout: 10000 });
              await page.focus(searchSelector);
              await page.keyboard.down('Control');
              await page.keyboard.press('KeyA');
              await page.keyboard.up('Control');
              await page.keyboard.press('Backspace');
              await page.type(searchSelector, item.name || item.productName || item.product || '');
              await page.keyboard.press('Enter');
              
              await new Promise(r => setTimeout(r, 3000));
              
              const addBtnSelector = 'button[class*="add" i], button[id*="add" i], button[title*="add" i], .add-to-cart, .btn-add';
              await page.waitForSelector(addBtnSelector, { timeout: 10000 });
              await page.click(addBtnSelector);
              await new Promise(r => setTimeout(r, 2000));
            }
            cartSuccess = true;
            console.log('Successfully added items to cart using UI automation fallback!');
          }
        } catch (pwErr: any) {
          console.error('Headless browser fallback failed:', pwErr.message);
          lastError += ` | Headless fallback error: ${pwErr.message}`;
        } finally {
          if (browser) await browser.close();
        }
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
    const mode = settings['pharmarack_mode'] || 'Simulation';

    if (!token) {
      if (mode === 'Simulation') {
        const mockDistributors = [
          {
            storeId: 101,
            storeName: "Diamond Drug Stores (Simulated)",
            lineTotal: 450.00,
            deliveryPersons: [{ name: "Rajesh Kumar", code: "D01" }],
            items: [
              {
                productId: 2001,
                storeId: 101,
                productCode: "DOLO650",
                productName: "Dolo 650mg Tablet",
                company: "Micro Labs Ltd",
                packaging: "15 tabs",
                qty: 10,
                ptr: 27.50,
                mrp: 30.90,
                scheme: "10+1",
                stock: 150,
                amount: 275.00,
                cartSource: "MOVP",
                isChecked: true,
                createdDate: new Date().toISOString()
              },
              {
                productId: 2002,
                storeId: 101,
                productCode: "IND10",
                productName: "Inderal 10mg Tablet",
                company: "Abbott Healthcare",
                packaging: "15 tabs",
                qty: 5,
                ptr: 35.00,
                mrp: 39.50,
                scheme: "",
                stock: 45,
                amount: 175.00,
                cartSource: "MOVP",
                isChecked: true,
                createdDate: new Date().toISOString()
              }
            ]
          },
          {
            storeId: 102,
            storeName: "Aaru Pharma (Simulated)",
            lineTotal: 180.00,
            deliveryPersons: [],
            items: [
              {
                productId: 2003,
                storeId: 102,
                productCode: "CIP500",
                productName: "Ciplox 500mg Tablet",
                company: "Cipla Ltd",
                packaging: "10 tabs",
                qty: 6,
                ptr: 30.00,
                mrp: 34.00,
                scheme: "5+1",
                stock: 12,
                amount: 180.00,
                cartSource: "MOVP",
                isChecked: true,
                createdDate: new Date().toISOString()
              }
            ]
          }
        ];
        return res.json({ success: true, mode: 'Simulation', distributors: mockDistributors, totalItems: 3 });
      }
      return res.status(401).json({ error: 'Need to login', code: 'NEED_LOGIN' });
    }

    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    const response = await fetch('https://pharmretail-api.pharmarack.com/cart/api/v1/GetUserCartDetails', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'devicetype': 'web',
        'Accept': 'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://retailers.pharmarack.com/',
        'Origin': 'https://retailers.pharmarack.com'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (response.status === 401 || response.status === 403) {
      return res.status(401).json({ error: 'Session expired. Please re-login from the Learning page.', code: 'SESSION_EXPIRED' });
    }
    if (!response.ok) {
      return res.status(503).json({ error: `Pharmarack API returned ${response.status}` });
    }

    const cartData: any = await response.json();

    if (!cartData || cartData.StatusCode !== 200 || !Array.isArray(cartData.IList)) {
      return res.status(503).json({ error: 'Unexpected cart response shape' });
    }

    // Parse IList → lineItems structure (grouped by distributor)
    const distributors = cartData.IList.map((store: any) => ({
      storeId: store.StoreId,
      storeName: store.StoreName,
      lineTotal: store.lineTotal || 0,
      deliveryPersons: (store.DeliveryPersonList || []).map((d: any) => ({
        name: d.SalesmanName || '', code: d.SalesmanCode || ''
      })),
      items: (store.lineItems || []).map((item: any) => ({
        productId: item.ProductId,
        storeId: item.StoreId,
        productCode: item.ProductCode || '',
        productName: item.ProductName || 'Unknown Product',
        company: item.Company || '',
        packaging: item.Packing || '',
        qty: item.Quantity || 1,
        ptr: item.PTR || item.HiddenPTR || 0,
        mrp: item.MRP ? parseFloat(item.MRP) : 0,
        scheme: item.Scheme || '',
        stock: item.Stock ?? null,
        amount: item.ProductWiseAmount || 0,
        cartSource: item.CartSource || '',
        isChecked: item.IsProductChecked === 1,
        createdDate: item.CreatedDate || '',
      }))
    }));

    const totalItems = distributors.reduce((s: number, d: any) => s + d.items.length, 0);

    return res.json({ success: true, mode: 'Live', distributors, totalItems });
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

// Logout endpoint (clears credentials & Puppeteer Chrome profile folder to delete cookies)
router.post('/logout', async (req, res) => {
  try {
    const db = await dbManager.getConnection();
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_username', '')");
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_password', '')");
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_session_token', '')");
    await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pharmarack_mode', 'Live')");

    const pharmarackProfilePath = path.resolve(__dirname, '..', '..', 'data', 'pharmarack_profile');
    if (fs.existsSync(pharmarackProfilePath)) {
      fs.rmSync(pharmarackProfilePath, { recursive: true, force: true });
      console.log('Cleared Pharmarack Puppeteer profile directory.');
    }

    res.json({ success: true, message: 'Logged out and cleared Pharmarack session successfully' });
  } catch (err: any) {
    console.error('Error during Pharmarack logout:', err);
    res.status(500).json({ error: 'Failed to clear session: ' + err.message });
  }
});

export default router;

