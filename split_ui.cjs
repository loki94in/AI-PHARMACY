const fs = require('fs');
const path = require('path');

const inputHtmlPath = path.join(__dirname, 'ui-demo.html');
const outputDir = path.join(__dirname, 'src', 'ui', 'pages');

if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

const htmlContent = fs.readFileSync(inputHtmlPath, 'utf8');

// Regex to match <div class="page..." id="pageX"> ... </div>
// It's tricky to match nested divs with regex, but since we know the structure:
// <!-- ── PAGE X: ... ── -->
// <div class="page" id="pageX">
// ...
// </div> (before the next PAGE comment or </main>)

const pageSections = htmlContent.split(/<!-- ── PAGE \d+: /);

const routes = [];

for (let i = 1; i < pageSections.length; i++) {
    const section = pageSections[i];
    
    // Extract page title from comment: "POS Billing ── -->"
    const titleEndIndex = section.indexOf('── -->');
    let title = "Unknown";
    if (titleEndIndex !== -1) {
        title = section.substring(0, titleEndIndex).trim();
    }
    
    // Find the actual <div class="page" id="page...">
    const divStartIndex = section.indexOf('<div class="page');
    if (divStartIndex !== -1) {
        // Find the end by looking for the last </div> before the end of the section
        let divEndIndex = section.lastIndexOf('</div>');
        if (divEndIndex !== -1) {
            let pageContent = section.substring(divStartIndex, divEndIndex + 6);
            
            // Clean up: find the id
            const idMatch = pageContent.match(/id="page(\d+)"/);
            const pageId = idMatch ? idMatch[1] : i;
            
            const fileName = `page${pageId}.html`;
            fs.writeFileSync(path.join(outputDir, fileName), pageContent);
            console.log(`Extracted ${fileName} - ${title}`);
            
            routes.push({
                id: `page${pageId}`,
                title: title,
                file: `src/ui/pages/${fileName}`
            });
        }
    }
}

fs.writeFileSync(path.join(__dirname, 'routes.json'), JSON.stringify({ routes }, null, 2));
console.log('Created routes.json');
