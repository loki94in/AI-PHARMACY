import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import fs from 'fs';
import path from 'path';

// Mock/use emailService parser
// Let's load the actual server modules or emulate the logic
// Since we are running in workspace, we can import our database connections
import { dbManager } from '../src/database/connection.js';
import { emailService } from '../src/services/emailService.js';

async function run() {
  const db = await dbManager.getConnection();
  
  const orderEmails = await db.all(`
    SELECT uid, subject, from_addr, body, date, is_order, is_saved, distributor_name, medicine_names
    FROM emails
    WHERE is_order = 1
    ORDER BY uid DESC
    LIMIT 10
  `);

  console.log(`Checking ${orderEmails.length} order emails...`);

  for (const email of orderEmails) {
    console.log(`\nEmail UID ${email.uid} - Subject: "${email.subject}"`);
    let cachedNames = [];
    try { cachedNames = JSON.parse(email.medicine_names || '[]'); } catch(e) {}
    console.log(`Cached names:`, cachedNames);

    // Fetch attachments
    const attachments = await db.all(
      'SELECT filename, size, content_type, local_path FROM email_attachments WHERE uid = ?',
      [email.uid]
    );
    console.log(`Attachments found: ${attachments.length}`);

    const parsedItems = [];
    for (const att of attachments) {
      console.log(`- Att: "${att.filename}" (Path: ${att.local_path})`);
      if (att.local_path && fs.existsSync(att.local_path)) {
        try {
          const resParse = await emailService.parseAndImportAttachment(att.local_path, false);
          if (resParse && resParse.success && resParse.items) {
            console.log(`  Parsed ${resParse.items.length} items from attachment.`);
            parsedItems.push(...resParse.items);
          } else {
            console.log(`  Attachment parsing returned success=false or no items`);
          }
        } catch (pe) {
          console.error(`  Error parsing attachment:`, pe.message);
        }
      } else {
        console.log(`  Attachment file does not exist locally`);
      }
    }

    const orderInfo = emailService.extractOrderInfo({
      subject: email.subject || '',
      body: email.body || '',
      from: email.from_addr || '',
      attachments: []
    });

    if (parsedItems.length === 0) {
      console.log(`No items parsed from attachments. Checking orderInfo.medicines...`);
      for (const med of orderInfo.medicines) {
        parsedItems.push({ name: med.name });
      }
    }

    const extracted = Array.from(new Set(parsedItems.map(i => i.name).filter(Boolean)));
    console.log(`Extracted names on-the-fly:`, extracted);
  }

  await dbManager.closeAll();
}

run().catch(console.error);
