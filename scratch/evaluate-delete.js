import puppeteer from 'puppeteer';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'data', 'app.db');

// Helper to find Chrome executable
function findChromePath() {
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\ratna\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
  ];
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Clean locks
function cleanProfileLockFiles(profilePath) {
  const locks = ['SingletonLock', 'lockfile', 'DevToolsActivePort'];
  for (const lock of locks) {
    const file = path.join(profilePath, lock);
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch (e) {}
    }
  }
}

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  const rows = await db.all("SELECT key, value FROM app_settings WHERE key LIKE 'pharmarack_%'");
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  await db.close();

  const token = settings['pharmarack_session_token'];
  if (!token) {
    console.error('No token found!');
    return;
  }

  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('Chrome path not found!');
    return;
  }

  const pharmarackProfilePath = path.resolve(__dirname, '..', 'data', 'pharmarack_profile');
  cleanProfileLockFiles(pharmarackProfilePath);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: pharmarackProfilePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const [page] = await browser.pages();
    await page.goto('https://retailers.pharmarack.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    const activeToken = token;

    // Hardcode item details for Omee D Cap
    const payload = {
      StoreId: 3799,
      StoreName: "PRO SUCCESS PHARMA AND SURGICAL",
      ProductCode: "1003595",
      Quantity: 1,
      PTR: 47,
      Free: 0,
      HiddenPTR: 47,
      NetRate: 47,
      Scheme: "",
      SchemeType: "",
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
      ProductName: "OMEE D CAP",
      StoreProductName: "OMEE D CAP",
      StoreWiseAmount: 0,
      StoreWiseGSTAmount: 0,
      IsDeleted: 1, // Delete flag
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
      RoundOffDisplayHS: '',
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
      Company: "ALKEM (GEM)",
      IsGroupWisePTR: 0,
      IsGroupWisePTRRetailer: 0,
      RateValidity: null,
      IsShowNonMappedOrderStock: 1,
      RStockVisibility: 0,
      IsMapped: 1,
      ProductId: 1003595,
      MRP: "59",
      ProductWiseAmount: 0,
      ProductWiseGSTAmount: 0,
      ProductWiseSchemeAmount: 0,
      ProductWiseSchemeGSTAmount: 0,
      StoreWiseSchemeAmount: 0,
      StoreWiseSchemeGSTAmount: 0,
      BoxPacking: '0',
      CasePacking: '1 strip',
      Packing: '1 strip'
    };

    console.log('Evaluating API call in browser context...');

    const result = await page.evaluate(async (p, tok) => {
      try {
        const auth = tok.startsWith('Bearer ') ? tok : 'Bearer ' + tok;
        const res = await fetch('https://pharmretail-api.pharmarack.com/cart/api/v1/AddUserProductCartDetail', {
          method: 'POST',
          headers: {
            'Authorization': auth,
            'Content-Type': 'application/json',
            'devicetype': 'web',
            'Accept': 'application/json, text/plain, */*'
          },
          body: JSON.stringify(p)
        });

        const status = res.status;
        const text = await res.text();
        return { status, text };
      } catch (e) {
        return { error: e.message };
      }
    }, payload, activeToken);

    console.log('Result:', result);

  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
