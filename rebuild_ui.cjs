const fs = require('fs');
const path = require('path');

const inputHtmlPath = path.join(__dirname, 'ui-demo.html');
const outputHtmlPath = path.join(__dirname, 'ui-demo.html');
const pagesDir = path.join(__dirname, 'src', 'ui', 'pages');

const htmlContent = fs.readFileSync(inputHtmlPath, 'utf8');

const pageSections = htmlContent.split(/(<!-- ── PAGE \d+: .*? ── -->)/);

let newHtmlContent = pageSections[0]; // Header part

for (let i = 1; i < pageSections.length; i += 2) {
    const comment = pageSections[i];
    let sectionContent = pageSections[i + 1];
    
    // Find page ID from comment
    const match = comment.match(/PAGE (\d+):/);
    if (match) {
        const pageId = match[1];
        const pageFilePath = path.join(pagesDir, `page${pageId}.html`);
        
        if (fs.existsSync(pageFilePath)) {
            const newPageContent = fs.readFileSync(pageFilePath, 'utf8');
            
            // sectionContent currently contains the old page html + any trailing stuff before the next comment.
            // We need to replace the <div class="page"...>...</div> part.
            // A simpler approach: we know the structure is:
            // comment
            // \n<div class="page" id="pageX">...</div>\n
            
            // Just append the comment and the new page content
            newHtmlContent += comment + '\n' + newPageContent + '\n';
            
            // We need to preserve anything that came AFTER the last page (like </main> <script> etc)
            if (i + 2 >= pageSections.length) {
                // This is the last section. Find the closing </main>
                const mainIndex = sectionContent.lastIndexOf('</main>');
                if (mainIndex !== -1) {
                    newHtmlContent += sectionContent.substring(mainIndex);
                }
            }
        } else {
            newHtmlContent += comment + sectionContent;
        }
    } else {
        newHtmlContent += comment + sectionContent;
    }
}

fs.writeFileSync(outputHtmlPath, newHtmlContent);
const srcUiDemoPath = path.join(__dirname, 'src', 'ui', 'ui-demo.html');
fs.writeFileSync(srcUiDemoPath, newHtmlContent);
console.log('Successfully rebuilt ui-demo.html and src/ui/ui-demo.html with all the latest updates!');
