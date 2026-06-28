/**
 * sample-enrichment.js — Example AI-Pharmacy plugin
 *
 * Demonstrates how to:
 *   1. Export a manifest
 *   2. Read from the DB using the sandboxed db.query() API
 *   3. Transform rows via onMedicinesRead hook
 *   4. Generate a simple report via generateReport hook
 *
 * Drop this file in the /plugins directory and click Reload in Settings.
 */

module.exports = {
  manifest: {
    name: 'Sample Enrichment',
    version: '1.0.0',
    description: 'Annotates medicine rows with a low-stock flag and generates a stock summary report.',
  },

  hooks: {
    /**
     * onMedicinesRead — receives { rows } and returns annotated rows.
     * Each medicine row gets a computed `low_stock` boolean field
     * (true when inventory quantity < 10).
     */
    onMedicinesRead: async function(ctx) {
      // Fetch inventory quantities for the current medicine ids
      const ids = (ctx.rows || []).map(function(r) { return r.id; });
      if (ids.length === 0) return ctx;

      const placeholders = ids.map(function() { return '?'; }).join(',');
      const inv = await db.query(
        'SELECT medicine_id, SUM(quantity) AS qty FROM inventory_master WHERE medicine_id IN (' + placeholders + ') GROUP BY medicine_id',
        ids
      );
      const qtyMap = {};
      inv.forEach(function(r) { qtyMap[r.medicine_id] = r.qty; });

      ctx.rows = ctx.rows.map(function(med) {
        return Object.assign({}, med, { low_stock: (qtyMap[med.id] ?? 0) < 10 });
      });
      return ctx;
    },

    /**
     * generateReport — returns an object with a summary of medicines
     * that are completely out of stock.
     */
    generateReport: async function() {
      const rows = await db.query(
        `SELECT m.id, m.name, COALESCE(SUM(i.quantity),0) AS total_qty
         FROM medicines m
         LEFT JOIN inventory_master i ON i.medicine_id = m.id
         GROUP BY m.id
         HAVING total_qty = 0
         ORDER BY m.name ASC
         LIMIT 50`
      );
      return {
        reportType: 'out-of-stock',
        generatedAt: new Date().toISOString(),
        count: rows.length,
        items: rows,
      };
    },
  },
};
