import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'data', 'app.db');

async function main() {
  const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
  try {
    const item = await db.get(
      `SELECT im.*, m.name as medicine_name 
       FROM inventory_master im 
       LEFT JOIN medicines m ON im.medicine_id = m.id 
       WHERE im.id = 103`
    );
    console.log('--- INVENTORY ITEM 103 ---');
    console.log(JSON.stringify(item, null, 2));
  } catch (err) {
    console.error('Error querying database:', err);
  } finally {
    await db.close();
  }
}

main();
