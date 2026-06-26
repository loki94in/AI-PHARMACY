import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('data', 'app.db');
console.log('Connecting to database at:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Get date stats
  const stats = db.prepare(`
    SELECT 
      MIN(expiry_date) as min_date,
      MAX(expiry_date) as max_date,
      COUNT(*) as total_qty_gt_0
    FROM inventory_master
    WHERE quantity > 0
  `).get();
  console.log('Date range stats:', stats);
  
  // Count items expiring within different ranges from '2026-06-25'
  const ranges = [30, 60, 90, 180, 365, 365 * 2, 365 * 10, 365 * 50];
  for (const days of ranges) {
    const countRes = db.prepare(`
      SELECT COUNT(*) as count 
      FROM inventory_master 
      WHERE quantity > 0 
        AND date(expiry_date) <= date('2026-06-25', '+' || ? || ' days')
    `).get(days);
    console.log(`Expiring within ${days} days from 2026-06-25:`, countRes.count);
  }

  // Count items where date(expiry_date) is <= '2026-06-25' (already expired)
  const expiredRes = db.prepare(`
    SELECT COUNT(*) as count 
    FROM inventory_master 
    WHERE quantity > 0 
      AND date(expiry_date) <= '2026-06-25'
  `).get();
  console.log(`Already expired (<= 2026-06-25):`, expiredRes.count);

  // Let's print 10 rows around 2026-06-25
  const sampleRows = db.prepare(`
    SELECT im.id, m.name as medicine_name, im.expiry_date, im.quantity
    FROM inventory_master im
    JOIN medicines m ON im.medicine_id = m.id
    WHERE im.quantity > 0 AND date(im.expiry_date) <= '2027-01-01'
    ORDER BY im.expiry_date ASC
    LIMIT 20
  `).all();
  console.log('Sample rows expiring before 2027-01-01:');
  console.table(sampleRows);

  db.close();
} catch (err) {
  console.error('Error querying database:', err);
}
