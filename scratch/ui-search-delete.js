import puppeteer from 'puppeteer';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // Handle any alert/confirm dialogs automatically
    page.on('dialog', async dialog => {
      console.log(`[Dialog] Accepting dialog: "${dialog.message()}"`);
      await dialog.accept();
    });

    console.log('Navigating to search page...');
    await page.goto('https://retailers.pharmarack.com/search', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('Current page URL:', page.url());
    console.log('Waiting for search input to be visible...');
    
    // Find the search input
    const searchInputSelector = 'input[placeholder*="search" i], input[placeholder*="Search" i], input[type="text"]';
    await page.waitForSelector(searchInputSelector, { timeout: 15000 });
    
    console.log('Typing query "OMEE D CAP" into search input...');
    await page.type(searchInputSelector, 'OMEE D CAP');
    await page.keyboard.press('Enter');
    
    console.log('Waiting 6 seconds for search results...');
    await new Promise(r => setTimeout(r, 6000));
    
    // Save screenshot of search results
    await page.screenshot({ path: path.resolve(__dirname, 'search-results.png') });
    console.log('Saved search results screenshot to scratch/search-results.png');

    console.log('Looking for OMEE D CAP in the search results...');
    const result = await page.evaluate(() => {
      // Find element containing OMEE D (leaf node)
      const elements = Array.from(document.querySelectorAll('*'));
      let targetElement = null;
      for (const el of elements) {
        if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
          targetElement = el;
          break;
        }
      }

      if (!targetElement) {
        return { success: false, error: 'Could not find product matching OMEE D in search results' };
      }

      // Find container row or card
      let container = targetElement;
      while (
        container && 
        container.tagName !== 'TR' && 
        container.tagName !== 'LI' && 
        !container.classList.contains('product-row') && 
        !container.classList.contains('product-card') &&
        !container.classList.contains('item-row')
      ) {
        container = container.parentElement;
      }
      
      if (!container) {
        container = targetElement;
        for (let i = 0; i < 5; i++) {
          if (container && container.parentElement) container = container.parentElement;
        }
      }

      if (!container) {
        return { success: false, error: 'Could not resolve product container row' };
      }

      // Scroll container into view
      container.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });

      // Look for a delete/remove button, a trash icon, or a minus button
      // Let's check for standard class names/attributes first
      const deleteBtn = container.querySelector('button[title*="Delete"], button[title*="Remove"], a[title*="Delete"], a[title*="Remove"], .delete, .remove, .btn-delete, .btn-remove, [class*="delete" i], [class*="remove" i]');
      if (deleteBtn) {
        const { left, top, width, height } = deleteBtn.getBoundingClientRect();
        return { success: true, type: 'standard-delete', x: left + width / 2, y: top + height / 2, html: deleteBtn.outerHTML };
      }

      // Try looking for any trash icon
      const trashIcon = container.querySelector('i[class*="trash"], svg[class*="trash"], [class*="trash" i]');
      if (trashIcon) {
        const { left, top, width, height } = trashIcon.getBoundingClientRect();
        return { success: true, type: 'trash-icon', x: left + width / 2, y: top + height / 2, html: trashIcon.outerHTML };
      }

      // Look for any button/link that says Delete/Remove
      const buttons = Array.from(container.querySelectorAll('button, a, svg, i'));
      for (const btn of buttons) {
        const text = (btn.textContent || btn.getAttribute('title') || '').toLowerCase();
        if (text.includes('delete') || text.includes('remove') || text.includes('clear')) {
          const { left, top, width, height } = btn.getBoundingClientRect();
          return { success: true, type: 'text-match', x: left + width / 2, y: top + height / 2, html: btn.outerHTML };
        }
      }

      // Fallback: look for the first button in the container
      const firstBtn = container.querySelector('button');
      if (firstBtn) {
        const { left, top, width, height } = firstBtn.getBoundingClientRect();
        return { success: true, type: 'first-button-fallback', x: left + width / 2, y: top + height / 2, html: firstBtn.outerHTML };
      }

      return { success: false, error: 'Could not find any delete button or button inside product container', containerHtml: container.outerHTML };
    });

    console.log('UI coordinates resolution result:', result);

    if (result.success) {
      // Wait for scroll to settle
      await new Promise(r => setTimeout(r, 1500));

      // Re-evaluate coordinates after scroll
      const finalCoords = await page.evaluate((type) => {
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
        while (
          container && 
          container.tagName !== 'TR' && 
          container.tagName !== 'LI' && 
          !container.classList.contains('product-row') && 
          !container.classList.contains('product-card') &&
          !container.classList.contains('item-row')
        ) {
          container = container.parentElement;
        }
        if (!container) {
          container = targetElement;
          for (let i = 0; i < 5; i++) {
            if (container && container.parentElement) container = container.parentElement;
          }
        }
        if (!container) return null;

        let deleteBtn = null;
        if (type === 'standard-delete') {
          deleteBtn = container.querySelector('button[title*="Delete"], button[title*="Remove"], a[title*="Delete"], a[title*="Remove"], .delete, .remove, .btn-delete, .btn-remove, [class*="delete" i], [class*="remove" i]');
        } else if (type === 'trash-icon') {
          deleteBtn = container.querySelector('i[class*="trash"], svg[class*="trash"], [class*="trash" i]');
        } else if (type === 'text-match') {
          const buttons = Array.from(container.querySelectorAll('button, a, svg, i'));
          deleteBtn = buttons.find(btn => {
            const text = (btn.textContent || btn.getAttribute('title') || '').toLowerCase();
            return text.includes('delete') || text.includes('remove') || text.includes('clear');
          });
        } else {
          deleteBtn = container.querySelector('button');
        }

        if (deleteBtn) {
          const { left, top, width, height } = deleteBtn.getBoundingClientRect();
          return { x: left + width / 2, y: top + height / 2 };
        }
        return null;
      }, result.type);

      if (finalCoords) {
        console.log(`Clicking delete button at (${finalCoords.x}, ${finalCoords.y}) using mouse click...`);
        await page.mouse.click(finalCoords.x, finalCoords.y);
        
        console.log('Waiting 6 seconds for cart update...');
        await new Promise(r => setTimeout(r, 6000));
        
        await page.screenshot({ path: path.resolve(__dirname, 'search-after.png') });
        console.log('Saved search after screenshot to scratch/search-after.png');
        console.log('SUCCESS: Click completed.');
      } else {
        console.error('Failed to locate coordinates after scrolling.');
      }
    } else {
      console.error('Failed to resolve delete button coordinates:', result.error);
      if (result.containerHtml) {
        console.log('Container HTML structure:\n', result.containerHtml);
      }
    }

  } catch (err) {
    console.error('Browser execution error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
