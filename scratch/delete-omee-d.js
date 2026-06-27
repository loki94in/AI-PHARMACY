import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.db');

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const rows = await db.all("SELECT key, value FROM app_settings WHERE key LIKE 'pharmarack_%'");
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  await db.close();

  const token = settings['pharmarack_session_token'];
  if (!token) {
    console.error('No Pharmarack session token found in database.');
    return;
  }
  const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

  console.log('Fetching live Pharmarack cart details...');
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

  if (!response.ok) {
    console.error(`Failed to fetch cart. HTTP status: ${response.status}`);
    return;
  }

  const data = await response.json();
  if (!data || data.StatusCode !== 200 || !Array.isArray(data.IList)) {
    console.error('Unexpected cart response structure:', data);
    return;
  }

  let matchedItems = [];

  for (const store of data.IList) {
    if (Array.isArray(store.lineItems)) {
      for (const item of store.lineItems) {
        const productName = item.ProductName || '';
        if (productName.toUpperCase().includes('OMEE D')) {
          matchedItems.push({
            storeId: store.StoreId,
            storeName: store.StoreName,
            productId: item.ProductId,
            productCode: item.ProductCode,
            productName: productName,
            company: item.Company || '',
            packaging: item.Packing || '',
            rate: item.PTR || item.HiddenPTR || 0,
            mrp: item.MRP || '0',
            scheme: item.Scheme || ''
          });
        }
      }
    }
  }

  if (matchedItems.length === 0) {
    console.log('No items containing "OMEE D" were found in the cart.');
    return;
  }

  console.log(`Found ${matchedItems.length} matching item(s) to delete:`);
  for (const item of matchedItems) {
    console.log(`- "${item.productName}" (ID: ${item.productId}) from "${item.storeName}"`);
  }

  for (const item of matchedItems) {
    console.log(`Forwarding deletion of "${item.productName}" to local backend server (port 3000)...`);
    
    const payload = {
      items: [{
        productId: item.productId,
        storeId: item.storeId,
        qty: 0,
        isDeleted: true,
        productCode: item.productCode,
        productName: item.productName,
        company: item.company,
        packaging: item.packaging,
        rate: item.rate,
        scheme: item.scheme
      }]
    };

    const res = await fetch('http://localhost:3000/api/pharmarack/cart/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      console.log(`Successfully completed delete API call on local server for "${item.productName}"!`);
    } else {
      const errText = await res.text().catch(() => '');
      console.error(`Local server returned error: ${res.status} | ${errText}`);
    }
  }
}

main().catch(console.error);
