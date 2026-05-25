import { Database } from 'better-sqlite3';

const db = new Database('./data/app.db', { readonly: false });

export function getTemplate(locale: string, key: string): string | null {
  const row = db.prepare('SELECT value FROM message_templates WHERE locale = ? AND key = ?').get(locale, key);
  return row ? row.value : null;
}

export function setTemplate(locale: string, key: string, value: string): void {
  const stmt = db.prepare(`
    INSERT INTO message_templates (locale, key, value) VALUES (?, ?, ?)
    ON CONFLICT(locale, key) DO UPDATE SET value = excluded.value
  `);
  stmt.run(locale, key, value);
}

export function deleteTemplate(locale: string, key: string): void {
  db.prepare('DELETE FROM message_templates WHERE locale = ? AND key = ?').run(locale, key);
}

export function listTemplates(locale: string): Array<{key: string; value: string}> {
  const rows = db.prepare('SELECT key, value FROM message_templates WHERE locale = ?').all(locale);
  return rows as {key: string; value: string}[];
}