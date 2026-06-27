import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  const pharmarackProfilePath = 'e:\\CURRENT PROJECT ON WORKING\\AI PHARMACY\\data\\pharmarack_profile';
  cleanProfileLockFiles(pharmarackProfilePath);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    userDataDir: pharmarackProfilePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,1024']
  });

  try {
    const [page] = await browser.pages();
    await page.setViewport({ width: 1280, height: 1024 });

    // Handle any dialog automatically
    page.on('dialog', async dialog => {
      console.log(`[Dialog] Accepted alert/confirm: "${dialog.message()}"`);
      await dialog.accept();
    });

    console.log('Navigating to search page...');
    await page.goto('https://retailers.pharmarack.com/search', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('Waiting 5 seconds for cart to load...');
    await new Promise(r => setTimeout(r, 5000));

    // Find the Omee D Cap text and delete button coordinates
    const target = await page.evaluate(() => {
      // Find all elements containing "Omee D"
      const allElements = Array.from(document.querySelectorAll('*'));
      let targetTextEl = null;

      for (const el of allElements) {
        if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
          const rect = el.getBoundingClientRect();
          if (rect.left > 800) { // in the sidebar
            targetTextEl = el;
            break;
          }
        }
      }

      if (!targetTextEl) {
        return { success: false, error: 'Could not find "Omee D" in the sidebar' };
      }

      const textRect = targetTextEl.getBoundingClientRect();
      const textTop = textRect.top;
      const textBottom = textRect.bottom;
      const textCenterY = textTop + textRect.height / 2;

      console.log(`Found Omee D text in sidebar at y=${textCenterY}`);

      // Now find all buttons in the sidebar (left > 800)
      const allButtons = Array.from(document.querySelectorAll('button, svg, [role="button"]'));
      let bestButton = null;
      let minDistance = Infinity;

      for (const btn of allButtons) {
        const rect = btn.getBoundingClientRect();
        if (rect.left > 800) {
          // Check if this button is vertically aligned with the text
          const btnCenterY = rect.top + rect.height / 2;
          const distanceY = Math.abs(btnCenterY - textCenterY);

          // We want the button closest vertically, but it must be on the right side of the item (close to the edge)
          // The delete button is usually on the far right (left > 1150)
          if (rect.left > 1150 && distanceY < 30) {
            if (distanceY < minDistance) {
              minDistance = distanceY;
              bestButton = {
                tagName: btn.tagName,
                className: btn.className,
                rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
                x: rect.left + rect.width / 2,
                y: rect.top + rect.height / 2,
                html: btn.outerHTML.slice(0, 150)
              };
            }
          }
        }
      }

      if (bestButton) {
        return {
          success: true,
          text: targetTextEl.textContent.trim(),
          textRect: { left: textRect.left, top: textRect.top, width: textRect.width, height: textRect.height },
          button: bestButton
        };
      }

      return {
        success: false,
        error: 'Found text but could not locate corresponding delete button on the right',
        textRect: { left: textRect.left, top: textRect.top, width: textRect.width, height: textRect.height }
      };
    });

    console.log('Target lookup result:', JSON.stringify(target, null, 2));

    if (target.success) {
      console.log(`Clicking delete button at (${target.button.x}, ${target.button.y})...`);
      await page.mouse.click(target.button.x, target.button.y);

      console.log('Waiting 6 seconds for delete to process...');
      await new Promise(r => setTimeout(r, 6000));

      // Capture screenshot to verify visually
      await page.screenshot({ path: 'e:\\CURRENT PROJECT ON WORKING\\AI PHARMACY\\scratch\\delete-search-after.png' });
      console.log('Saved screenshot to scratch/delete-search-after.png');

      // Verify if still present
      const stillPresent = await page.evaluate(() => {
        const allElements = Array.from(document.querySelectorAll('*'));
        for (const el of allElements) {
          if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
            const rect = el.getBoundingClientRect();
            if (rect.left > 800) return true;
          }
        }
        return false;
      });

      if (!stillPresent) {
        console.log('SUCCESS: Omee D is no longer in the sidebar cart!');
      } else {
        console.log('WARNING: Omee D is still present in the sidebar cart.');
      }
    } else {
      console.error('Target identification failed:', target.error);
    }

  } catch (err) {
    console.error('Execution error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
