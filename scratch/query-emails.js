import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function run() {
  const db = await open({
    filename: 'data/app.db',
    driver: sqlite3.Database
  });

  const emails = await db.all(`
    SELECT uid, subject, is_order, is_saved, distributor_name, medicine_names
    FROM emails
    WHERE is_order = 1
    LIMIT 20
  `);
  console.log("Order Emails in DB:");
  console.log(JSON.stringify(emails, null, 2));

  await db.close();
}

run().catch(console.error);
