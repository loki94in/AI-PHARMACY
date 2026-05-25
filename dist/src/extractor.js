import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse';
import { parse } from 'csv-parse/sync';
/**
 * Helper to dedupe and normalise a list of strings (case‑insensitive).
 */
function uniqNames(names) {
    const seen = new Set();
    const out = [];
    for (const n of names) {
        const key = n.trim().toLowerCase();
        if (!key)
            continue;
        if (!seen.has(key)) {
            seen.add(key);
            out.push(n.trim());
        }
    }
    return out;
}
/**
 * Extract product names from a PDF file.
 * Uses pdf-parse to get raw text, then applies a simple RegExp to capture
 * capitalised words that look like medicine names (e.g., "Paracip", "Acetoflex",
 * "CoughEx Syrup"). Adjust the pattern if your PDFs follow a different format.
 */
export async function extractFromPdf(filePath) {
    const data = await fs.promises.readFile(filePath);
    const pdfData = await pdfParse(data);
    const text = pdfData.text;
    // Simple heuristic: words that start with a capital letter and may contain
    // internal capitals (CamelCase) or spaces, optionally followed by a dosage.
    const nameRegex = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\b/g;
    const matches = text.match(nameRegex) || [];
    return uniqNames(matches);
}
/**
 * Extract product names from a CSV file.
 * The function looks for a header that includes the word "name" (case‑insensitive).
 * If such a column is found, all distinct values from that column are returned.
 */
export async function extractFromCsv(filePath) {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const records = parse(content, { columns: true, skip_empty_lines: true });
    if (!Array.isArray(records) || records.length === 0)
        return [];
    // Find the column that most likely holds product names.
    const header = Object.keys(records[0]);
    const nameCol = header.find((c) => /name/i.test(c));
    if (!nameCol)
        return [];
    const names = records.map((row) => String(row[nameCol] || '').trim()).filter(Boolean);
    return uniqNames(names);
}
/**
 * Merge a newly extracted list of names into the persistent suggestion file.
 * Returns the list of names that were actually added (i.e., not already present).
 */
export async function mergeIntoSuggestions(newNames) {
    const suggestionPath = path.resolve(__dirname, '..', 'data', 'suggested_names.json');
    let current = { suggested: [] };
    try {
        const raw = await fs.promises.readFile(suggestionPath, 'utf-8');
        current = JSON.parse(raw);
    }
    catch (_) {
        // ignore – file may not exist yet (will be created below)
    }
    const added = [];
    const existingSet = new Set(current.suggested.map((n) => n.toLowerCase()));
    for (const n of newNames) {
        if (!existingSet.has(n.toLowerCase())) {
            existingSet.add(n.toLowerCase());
            added.push(n);
        }
    }
    if (added.length > 0) {
        current.suggested = uniqNames([...current.suggested, ...added]);
        await fs.promises.writeFile(suggestionPath, JSON.stringify(current, null, 2), 'utf-8');
    }
    return added;
}
