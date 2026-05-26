/**
 * PostgreSQL COPY ... FROM stdin Parser
 *
 * Parses pg_dump output that uses COPY statements with tab-separated data.
 * Format:
 *   COPY public.table_name (col1, col2, ...) FROM stdin;
 *   val1\tval2\t...
 *   val1\tval2\t...
 *   \.
 */
/**
 * Parses a COPY header line and extracts table name and column list.
 * Example: COPY public.medicine (medicine_id, created_time, ...) FROM stdin;
 */
export function parseCopyHeader(line) {
    const match = line.match(/^COPY\s+public\.(\w+)\s*\(([^)]+)\)\s*FROM\s+stdin\s*;/i);
    if (!match)
        return null;
    const table = match[1];
    const columns = match[2].split(',').map(c => c.trim().replace(/"/g, ''));
    return { table, columns };
}
/**
 * Parses a tab-separated data row from a PostgreSQL COPY block.
 * \N represents NULL values.
 * Handles escaped characters: \t (tab), \n (newline), \\ (backslash).
 */
export function parseCopyDataRow(line, columns) {
    const values = [];
    let current = '';
    let i = 0;
    while (i < line.length) {
        if (line[i] === '\t') {
            // Field separator
            values.push(current === '\\N' ? null : unescapePgValue(current));
            current = '';
            i++;
        }
        else {
            current += line[i];
            i++;
        }
    }
    // Push last field
    values.push(current === '\\N' ? null : unescapePgValue(current));
    // Map to column names
    const row = {};
    for (let j = 0; j < columns.length; j++) {
        row[columns[j]] = j < values.length ? values[j] : null;
    }
    return row;
}
/**
 * Unescape PostgreSQL COPY text-format escape sequences.
 */
function unescapePgValue(val) {
    return val
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\\\/g, '\\');
}
/**
 * Check if a line indicates the end of COPY data block.
 */
export function isCopyEndMarker(line) {
    return line === '\\.';
}
/**
 * Check if a file is a PostgreSQL dump by examining first few lines.
 */
export function isPgDump(headerLines) {
    for (const line of headerLines) {
        if (line.includes('PostgreSQL database dump'))
            return true;
        if (line.startsWith('COPY public.'))
            return true;
        if (line.startsWith('SET statement_timeout'))
            return true;
    }
    return false;
}
