const SALES_TAX_RATE = 0.05; // 5% inclusive GST used for sales invoices

export interface SalesItem {
  quantity?: number | string;
  unit_price?: number | string;
  loose_qty?: number | string;
  pack_size?: number | string;
  discount_per?: number | string;
  discountPer?: number | string;
}

export interface SalesTotals {
  subtotal: number;
  total: number;
  tax: number;
}

/**
 * Calculates subtotal, tax (inclusive GST), and rounded total for a sales invoice.
 * Mirrors the calculation that was previously inlined in sales.ts.
 */
export function calculateSalesTotals(items: SalesItem[], discount: number): SalesTotals {
  let subtotal = 0;
  for (const item of items) {
    const q = Number(item.quantity ?? 0);
    const l = Number(item.loose_qty ?? 0);
    const pSize = Number(item.pack_size ?? 10) || 10;
    const d = Number(item.discount_per ?? item.discountPer ?? 0);
    const uPrice = Number(item.unit_price ?? 0);
    const dPrice = uPrice * (1 - d / 100);
    subtotal += q * dPrice + l * (dPrice / pSize);
  }
  const total = Math.round(subtotal - discount);
  const tax = Number((total * SALES_TAX_RATE / (1 + SALES_TAX_RATE)).toFixed(2));
  return { subtotal, total, tax };
}

export interface PurchaseItem {
  qty?: number | string;
  quantity?: number | string;
  rate?: number | string;
  price?: number | string;
  discPer?: number | string;
  cd_per?: number | string;
  discRs?: number | string;
  cd_rs?: number | string;
  additional_discount?: number | string;
  cgst?: number | string;
  cgst_per?: number | string;
  sgst?: number | string;
  sgst_per?: number | string;
}

export interface PurchaseTotals {
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  originalAmount: number;
  grandTotal: number;
}

/**
 * Calculates purchase invoice totals including CGST/SGST.
 * Mirrors the calculation that was previously inlined in purchases.ts.
 */
export function calculatePurchaseTotals(
  items: PurchaseItem[],
  cdPer: number,
  cnAmount: number
): PurchaseTotals {
  let subtotal = 0;
  let totalCgst = 0;
  let totalSgst = 0;

  for (const item of items) {
    const qty = parseFloat(String(item.qty ?? item.quantity ?? 0)) || 0;
    const rate = parseFloat(String(item.rate ?? item.price ?? 0)) || 0;
    const discPer = parseFloat(String(item.discPer ?? item.cd_per ?? 0)) || 0;
    const discRs = parseFloat(String(item.discRs ?? item.cd_rs ?? 0)) || 0;
    const addDisc = parseFloat(String(item.additional_discount ?? 0)) || 0;
    const cgst = parseFloat(String(item.cgst ?? item.cgst_per ?? 0)) || 0;
    const sgst = parseFloat(String(item.sgst ?? item.sgst_per ?? 0)) || 0;

    const baseAmt = qty * rate;
    const lineDisc = discRs + addDisc + baseAmt * (discPer / 100);
    const taxable = baseAmt - lineDisc;

    subtotal += taxable;
    totalCgst += taxable * (cgst / 100);
    totalSgst += taxable * (sgst / 100);
  }

  const hasItemDiscount = items.some(item => {
    const dp = parseFloat(String(item.discPer ?? item.cd_per ?? 0)) || 0;
    const dr = parseFloat(String(item.discRs ?? item.cd_rs ?? 0)) || 0;
    return dp > 0 || dr > 0;
  });
  const globalCdDisc = hasItemDiscount ? 0 : subtotal * (cdPer / 100);
  const originalAmount = subtotal + totalCgst + totalSgst - globalCdDisc;
  const grandTotal = Math.max(0, originalAmount - cnAmount);

  return { subtotal, totalCgst, totalSgst, originalAmount, grandTotal };
}
