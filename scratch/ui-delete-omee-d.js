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
  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('Chrome path not found!');
    return;
  }

  const pharmarackProfilePath = path.resolve(__dirname, '..', 'data', 'pharmarack_profile');
  cleanProfileLockFiles(pharmarackProfilePath);

  console.log('Launching browser with active profile...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: pharmarackProfilePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1024']
  });

  try {
    const [page] = await browser.pages();
    await page.setViewport({ width: 1280, height: 1024 });

    // Handle any alert/confirm dialogs automatically (e.g. confirm delete)
    page.on('dialog', async dialog => {
      console.log(`[Dialog] Automatically accepting dialog: "${dialog.message()}"`);
      await dialog.accept();
    });

    console.log('Navigating to cart page...');
    await page.goto('https://retailers.pharmarack.com/cart', { waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Current page URL:', page.url());
    console.log('Waiting for "Loading..." indicator to disappear...');
    
    // Poll for the loading message to disappear
    let loaded = false;
    for (let i = 0; i < 20; i++) { // try up to 40 seconds
      await new Promise(r => setTimeout(r, 2000));
      const hasLoadingText = await page.evaluate(() => {
        const bodyText = document.body.textContent || '';
        return bodyText.includes('Loading...');
      });
      if (!hasLoadingText) {
        console.log('Loading text disappeared!');
        loaded = true;
        break;
      }
      console.log(`Still loading... (${(i+1)*2}s)`);
    }

    // Give it extra time to stabilize
    await new Promise(r => setTimeout(r, 4000));

    console.log('Locating Expand All coordinates (leaf node)...');
    const expandCoords = await page.evaluate(() => {
      const clickables = Array.from(document.querySelectorAll('*'));
      const expandBtn = clickables.find(el => el.children.length === 0 && el.textContent && el.textContent.trim().includes('Expand all'));
      if (expandBtn) {
        const { left, top, width, height } = expandBtn.getBoundingClientRect();
        return { x: left + width / 2, y: top + height / 2, html: expandBtn.outerHTML };
      }
      return null;
    });

    if (expandCoords) {
      console.log(`Clicking Expand All (${expandCoords.html}) at (${expandCoords.x}, ${expandCoords.y})...`);
      await page.mouse.click(expandCoords.x, expandCoords.y);
      await new Promise(r => setTimeout(r, 4000)); // wait for expansion animations
    } else {
      console.log('Could not locate Expand All coordinates (leaf node).');
    }

    // Scroll firstBtn into view in page evaluate and return coordinates
    console.log('Looking for OMEE D CAP in the DOM (leaf node)...');
    const clickCoords = await page.evaluate(() => {
      // Look for any element containing 'OMEE D' (leaf node)
      const elements = Array.from(document.querySelectorAll('*'));
      let targetElement = null;
      for (const el of elements) {
        if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
          targetElement = el;
          break;
        }
      }

      if (!targetElement) {
        return { success: false, error: 'Could not find text element matching OMEE D' };
      }

      // Find container row
      let container = targetElement;
      while (container && container.tagName !== 'TR' && container.tagName !== 'LI' && !container.classList.contains('cart-item') && !container.classList.contains('item-row')) {
        container = container.parentElement;
      }
      if (!container) {
        container = targetElement;
        for (let i = 0; i < 5; i++) {
          if (container && container.parentElement) container = container.parentElement;
        }
      }

      if (!container) {
        return { success: false, error: 'Could not resolve container row' };
      }

      // Look for the circle-X button inside the container row
      const firstBtn = container.querySelector('button');
      if (firstBtn) {
        // Scroll the button into view instantly so its coordinates are within the viewport
        firstBtn.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
        return { success: true };
      }

      return { success: false, error: 'Button control not found in container' };
    });

    if (clickCoords.success) {
      // Wait for scrolling to settle
      await new Promise(r => setTimeout(r, 2000));

      // Re-evaluate coordinates after scrolling
      const finalCoords = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        let targetElement = null;
        for (const el of elements) {
          if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
            targetElement = el;
            break;
          }
        }
        if (!targetElement) return null;

        let container = targetElement;
        while (container && container.tagName !== 'TR' && container.tagName !== 'LI' && !container.classList.contains('cart-item') && !container.classList.contains('item-row')) {
          container = container.parentElement;
        }
        if (!container) {
          container = targetElement;
          for (let i = 0; i < 5; i++) {
            if (container && container.parentElement) container = container.parentElement;
          }
        }
        if (!container) return null;

        const firstBtn = container.querySelector('button');
        if (firstBtn) {
          const { left, top, width, height } = firstBtn.getBoundingClientRect();
          return { x: left + width / 2, y: top + height / 2, html: firstBtn.outerHTML };
        }
        return null;
      });

      if (finalCoords) {
        // Take screenshot of expanded state (scrolled to target)
        await page.screenshot({ path: path.resolve(__dirname, 'cart-before.png') });
        console.log('Saved expanded state screenshot to scratch/cart-before.png');

        console.log(`Clicking delete button (${finalCoords.html}) at scrolled coordinates (${finalCoords.x}, ${finalCoords.y}) using mouse click...`);
        await page.mouse.click(finalCoords.x, finalCoords.y);
        
        console.log('Waiting 6 seconds for cart update...');
        await new Promise(r => setTimeout(r, 6000));
        
        // Refresh page to verify
        console.log('Refreshing page to verify deletion...');
        await page.reload({ waitUntil: 'networkidle2' });
        
        // Wait for page loading to settle
        let verifiedLoaded = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const hasLoadingText = await page.evaluate(() => {
            return document.body.textContent.includes('Loading...');
          });
          if (!hasLoadingText) {
            verifiedLoaded = true;
            break;
          }
          console.log(`Verification reload still loading... (${(i+1)*2}s)`);
        }

        await new Promise(r => setTimeout(r, 3000));

        // Expand again to check
        const expandCoordsAfter = await page.evaluate(() => {
          const clickables = Array.from(document.querySelectorAll('*'));
          const expandBtn = clickables.find(el => el.children.length === 0 && el.textContent && el.textContent.trim().includes('Expand all'));
          if (expandBtn) {
            const { left, top, width, height } = expandBtn.getBoundingClientRect();
            return { x: left + width / 2, y: top + height / 2 };
          }
          return null;
        });
        if (expandCoordsAfter) {
          console.log('Clicking Expand All post-deletion to verify...');
          await page.mouse.click(expandCoordsAfter.x, expandCoordsAfter.y);
          await new Promise(r => setTimeout(r, 3000));
        }

        await page.screenshot({ path: path.resolve(__dirname, 'cart-after.png') });
        console.log('Saved verification screenshot to scratch/cart-after.png');
        
        // Check if OMEE D is still present
        const isPresent = await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          for (const el of elements) {
            if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
              return true;
            }
          }
          return false;
        });

        if (!isPresent) {
          console.log('SUCCESS: OMEE D CAP is no longer in the cart!');
        } else {
          console.log('WARNING: OMEE D CAP is still present in the cart.');
        }
      } else {
        console.error('Failed to locate coordinates after scrolling.');
      }
    } else {
      console.error('Failed to scroll target element into view:', clickCoords.error);
    }

  } catch (err) {
    console.error('Browser execution error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
