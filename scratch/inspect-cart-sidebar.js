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

    console.log('Navigating to search page...');
    await page.goto('https://retailers.pharmarack.com/search', { waitUntil: 'networkidle2', timeout: 60000 });
    
    console.log('Waiting 5 seconds for sidebar/cart to load...');
    await new Promise(r => setTimeout(r, 5000));

    const analysis = await page.evaluate(() => {
      // Find all elements containing "Omee D"
      const allElements = Array.from(document.querySelectorAll('*'));
      const matches = [];

      for (const el of allElements) {
        if (el.children.length === 0 && el.textContent && el.textContent.toUpperCase().includes('OMEE D')) {
          const rect = el.getBoundingClientRect();
          matches.push({
            tagName: el.tagName,
            text: el.textContent.trim(),
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            classes: el.className
          });
        }
      }

      // Find the specific Omee D in the sidebar (left > 800)
      const sidebarMatches = matches.filter(m => m.rect.left > 800);
      
      // Let's also log the parent tree and siblings for sidebar matches
      const details = [];
      for (const m of sidebarMatches) {
        // Find the actual DOM element
        const domElements = Array.from(document.querySelectorAll('*'));
        const el = domElements.find(d => 
          d.children.length === 0 && 
          d.textContent && 
          d.textContent.trim() === m.text && 
          d.getBoundingClientRect().left > 800
        );

        if (el) {
          // Walk up to find the container row
          let container = el.parentElement;
          let depth = 0;
          const containerChain = [];
          
          while (container && depth < 5) {
            const cRect = container.getBoundingClientRect();
            // Get all buttons and SVGs in this parent
            const buttons = Array.from(container.querySelectorAll('button, svg, img, i, [role="button"]')).map(btn => {
              const bRect = btn.getBoundingClientRect();
              return {
                tagName: btn.tagName,
                className: btn.className,
                html: btn.outerHTML.slice(0, 200),
                rect: { left: bRect.left, top: bRect.top, width: bRect.width, height: bRect.height }
              };
            });

            containerChain.push({
              depth,
              tagName: container.tagName,
              className: container.className,
              rect: { left: cRect.left, top: cRect.top, width: cRect.width, height: cRect.height },
              buttonsCount: buttons.length,
              buttons
            });
            container = container.parentElement;
            depth++;
          }

          details.push({
            match: m,
            chain: containerChain
          });
        }
      }

      return {
        allMatches: matches,
        sidebarMatches,
        details
      };
    });

    console.log('--- Probing Results ---');
    console.log('All Matches for "Omee D":', JSON.stringify(analysis.allMatches, null, 2));
    console.log('\nSidebar Matches:', JSON.stringify(analysis.sidebarMatches, null, 2));
    console.log('\nDetailed Chain for Sidebar Match:');
    console.log(JSON.stringify(analysis.details, null, 2));

  } catch (err) {
    console.error('Probing error:', err);
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

main().catch(console.error);
