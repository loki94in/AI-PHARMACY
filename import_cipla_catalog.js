import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const DB_PATH = './data/app.db';
const PDF_DIR = './pdf medini cpany catalog';

async function importCiplaCatalog() {
  console.log('Starting Cipla PDF Catalog Import...');
  
  if (!fs.existsSync(PDF_DIR)) {
    console.error(`Directory not found: ${PDF_DIR}`);
    return;
  }

  const files = fs.readdirSync(PDF_DIR).filter(file => file.toLowerCase().endsWith('.pdf'));
  if (files.length === 0) {
    console.log('No PDF files found in directory.');
    return;
  }

  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  console.log('Connected to SQLite Database.');

  for (const file of files) {
    const filePath = path.join(PDF_DIR, file);
    console.log(`\nParsing PDF: ${file}...`);
    
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const parsedData = await pdf(dataBuffer);
      const lines = parsedData.text.split('\n');
      console.log(`Extracted ${lines.length} raw lines from ${file}.`);

      const medicinesToInsert = [];

      for (let line of lines) {
        line = line.trim();
        // Regex to match lines starting with digits (index number)
        const match = line.match(/^\s*(\d+)\s*(.+)$/);
        if (match) {
          const itemText = match[2].trim();
          // Filter out header lines or irrelevant text
          if (itemText.length > 3 && !itemText.startsWith('CIPLA') && !itemText.startsWith('All Division')) {
            // Try to extract name and clean up packing at the end
            // E.g. "ACIVIR 200 DT10 TAB" -> Name: "ACIVIR 200 DT", Packing: "10 TAB"
            const packingMatch = itemText.match(/(.+?)(\d+\s*(?:TAB|CAP|S|ML|GM|MD|DROP|BOTT|TUBE)|BOTTLE|TUBE|DROP|DORPS|INJ\d+.*)$/i);
            
            let name = itemText;
            let category = 'Cipla';
            if (packingMatch) {
              name = packingMatch[1].trim();
            }

            medicinesToInsert.push({ name, manufacturer: 'Cipla Ltd.' });
          }
        }
      }

      console.log(`Found ${medicinesToInsert.length} potential medicines to import from ${file}.`);

      if (medicinesToInsert.length > 0) {
        await db.run('BEGIN TRANSACTION');
        const stmt = await db.prepare(
          'INSERT OR IGNORE INTO medicines (name, manufacturer, category) VALUES (?, ?, ?)'
        );

        let insertCount = 0;
        for (const med of medicinesToInsert) {
          const result = await stmt.run([med.name, med.manufacturer, 'Allopathy']);
          if (result.changes && result.changes > 0) {
            insertCount++;
          }
        }
        await stmt.finalize();
        await db.run('COMMIT');
        
        console.log(`✓ Successfully imported ${insertCount} new medicines from ${file}.`);
      }

    } catch (err) {
      console.error(`Error processing ${file}:`, err);
    }
  }

  const [{ count }] = await db.all('SELECT COUNT(*) as count FROM medicines');
  console.log(`\nTotal medicines in database now: ${count}`);

  await db.close();
}

importCiplaCatalog().catch(err => {
  console.error('Import failed:', err);
});
