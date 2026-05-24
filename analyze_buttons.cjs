const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, 'src', 'ui', 'ui-demo.html');
const content = fs.readFileSync(htmlPath, 'utf8');

const buttons = [];
// Match <button...>...</button>
const buttonRegex = /<button([^>]*)>(.*?)<\/button>/gs;
let match;
while ((match = buttonRegex.exec(content)) !== null) {
  const attrs = match[1];
  const text = match[2].replace(/<[^>]+>/g, '').trim(); // strip inner HTML tags like icons
  
  // Extract id
  const idMatch = attrs.match(/id="([^"]+)"/);
  const id = idMatch ? idMatch[1] : null;
  
  // Extract onclick
  const onClickMatch = attrs.match(/onclick="([^"]+)"/);
  const onClick = onClickMatch ? onClickMatch[1] : null;
  
  // Try to find if there's an event listener in the script block for this ID
  let hasListener = false;
  if (id) {
    hasListener = content.includes(`document.getElementById('${id}').addEventListener`);
  }
  
  buttons.push({
    text: text || '(Icon Button)',
    id: id || '(No ID)',
    wiredUp: !!(onClick || hasListener),
    action: onClick || (hasListener ? 'Event Listener' : 'None')
  });
}

const mdLines = ['# UI Buttons Status Report', '', '| Button Text | ID | Is Wired Up? | Action | Status |', '|---|---|---|---|---|'];
buttons.forEach(b => {
  const status = b.wiredUp ? '🟢 Functional' : '🔴 Placeholder';
  mdLines.push(`| ${b.text} | ${b.id} | ${b.wiredUp ? 'Yes' : 'No'} | \`${b.action}\` | ${status} |`);
});

fs.writeFileSync(path.join(__dirname, 'buttons_report.md'), mdLines.join('\n'));
console.log('Report generated.');
