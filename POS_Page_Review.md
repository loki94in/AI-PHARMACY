# POS Page — Detailed Review

## 1. What the POS Page Is Supposed to Do

The POS (Point of Sale) page is the core billing interface for the pharmacy. A pharmacist uses it to build a bill from one or more medicines, attach patient and doctor details, apply discounts, choose a payment method, and save the sale — generating an invoice and automatically reducing stock in the database.

---

## 2. Layout Overview

The page is split into two zones:

**Left workspace (~75% width):**
- Context bar — patient, doctor, billing date
- Medicine search + scan area with live dropdown
- Cart table — the actual bill being built
- Bill summary — subtotal, discount, grand total, payment method, save button

**Right sidebar (~25% width):**
- Quick-add tiles for commonly sold medicines
- Multi-tab support (multiple open carts simultaneously)

---

## 3. How a Bill Is Built — Step by Step

### Step 1 — Fill Patient & Doctor (optional but important)

- **Patient / Customer** field: type a name and the app searches existing patients, showing suggestions. If the patient is new, just type the name and it is saved when the bill is completed.
- **Prescribing Doctor** field: type or select from a registered list. A `+` button opens a modal to register a new doctor with name, specialisation, phone, clinic, and registration number.
- **Billing Date** defaults to today but can be changed for backdated bills.

If payment method is set to **CREDIT**, both patient name and phone number are **required** — the app blocks checkout without them.

### Step 2 — Add Medicines to the Cart

There are four ways to add medicines:

**A. Search by name / composition / batch / price**
Type at least 3 characters in the search box. The app queries the inventory and shows a deduplicated dropdown — one row per medicine name. Each row shows:
- Medicine name + company + packaging
- Stock count (strips + loose tablets)
- MRP
- `+ Add` button (or click anywhere on the row)
- Substitutes section below if alternatives with the same composition are in stock

Selecting an entry adds it to the cart with the recommended quantity pre-filled (calculated from the patient's purchase history if available).

**B. Barcode / batch scan via keyboard**
Type a barcode or exact batch number. If there is exactly one matching result and its `item_code` matches the search term exactly, the medicine is auto-added and the search box is cleared.

**C. Camera scan (press `X` or the camera button)**
Opens the AI camera. It reads the strip label — extracts batch number, medicine name, MRP — and tries to match it against inventory in this order:
1. Search by batch number (most precise)
2. Search by medicine name
3. Search by MRP (fallback)

If no database match is found, it adds the item as a manual entry with the scanned values, allowing the pharmacist to update details in the cart.

**D. Quick-add tiles (right panel)**
Shows up to 12 top inventory items as one-click add buttons. Recommended quantity is pre-filled based on historical sales patterns.

**What does NOT appear in the dropdown:**
- Out-of-stock medicines (quantity = 0 OR `is_out_of_stock` flag set)
- Expired medicines
- Items flagged as only metadata (DL number, barcodes, etc.)

### Step 3 — Review and Edit the Cart

The cart is a table with one row per medicine. Each row shows and allows editing of:

| Column | What it is | Editable? |
|---|---|---|
| Medicine name | Name with edit icon to swap medicine | Yes — click edit icon |
| Qty (strips) | Number of full strips/packs | Yes |
| Loose (tablets) | Individual tablets within a pack | Yes |
| Pack size | Tablets per strip | Yes — saves to DB immediately |
| Batch | Batch number — click to see available batches dropdown | Yes |
| Expiry | Expiry date shown as a colour-coded badge (green/yellow/red) | Read only |
| MRP | Max retail price | Yes — saves to DB immediately |
| Discount% | Per-item discount percentage | Yes |
| Cost price | Purchase/cost price for profit calculation | Yes — saves to DB immediately |
| Stock | Available stock at time of adding | Read only |
| Subtotal | Calculated automatically | No |
| Delete | Remove row from cart | — |

**Batch switching:** clicking the Batch field shows a dropdown of all available batches for that medicine, each showing batch number and expiry date. Selecting a batch updates MRP, expiry, and stock automatically.

**Pack size auto-normalisation:** if loose qty reaches or exceeds pack size, it is automatically converted to full strips.

**Stock cap:** quantity cannot exceed available stock (enforced live as user types).

**F8 or Alt+E:** opens the Universal Medicine Edit modal for the focused cart row, allowing full medicine master data editing.

### Step 4 — Bill Summary and Payment

Below the cart:
- **Overall discount** field — applied on top of any per-item discounts
- **Subtotal**, **Discount amount**, **Grand Total** shown
- **Profit indicator** — shows estimated profit or warns if the bill would result in a net loss (checkout is blocked in that case)
- **Payment method** selector — CASH, UPI, CREDIT, CARD, etc.
- **Send WhatsApp** toggle — automatically sends bill PDF to patient's number (mandatory for CREDIT)
- **Refill setup** — if the patient has a refill profile, enables scheduling automatic reminders
- **Save Bill (Ctrl+S)** — submits the sale

### Step 5 — After Saving

- A barcode modal appears with the invoice number and a print/PDF option
- Stock is deducted in the database
- Cart is cleared and ready for the next bill
- If CREDIT, a WhatsApp PDF is sent automatically

---

## 4. Multi-Tab (Multiple Open Bills)

The POS supports multiple simultaneous open bills via tabs at the top. Each tab has its own independent cart, patient, doctor, discount, and payment method. Tabs are saved in `localStorage` so they survive page refresh. Up to a reasonable number of tabs can be open at once (no hard limit in current code).

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+S` | Save bill (or save patient profile if modal is open) |
| `Alt+P` | Open patient profile modal |
| `X` | Open camera scanner |
| `F8` or `Alt+E` | Open Universal Medicine Edit for focused row |
| `Escape` | Close any open modal |
| `Arrow Up / Down` | Navigate doctor/patient suggestion dropdowns |
| `Enter` | Select highlighted suggestion |

---

## 6. Current Known Behaviours and Issues

### Working correctly
- Search deduplicate by medicine name (multiple batches collapse to one row)
- Substitutes/alternatives deduplicate by base medicine name (stripping "STRIP OF X" packaging from name comparison)
- Out-of-stock medicines filtered by both the `is_out_of_stock` flag AND actual quantity = 0
- Expired medicines blocked at search level and again at checkout
- Auto-add on exact barcode match
- Camera scan with three-step fallback search
- Loss prevention block at checkout
- Credit billing requiring patient phone
- Live pack-size normalisation in cart
- Batch switching dropdown showing batch + expiry only (cleaned up, larger font)

### Current gaps / things to watch

1. **Manual entry has no validation** — when a medicine is added manually (not found in DB), MRP defaults to 0 and batch defaults to "MANUAL". The pharmacist must fill these before saving. There is no warning or visual cue that the row is manual.

2. **Quick-add tiles use inventory limit of 12** — these are the top 12 items from inventory at load time, not necessarily the most frequently sold. A more accurate approach would query the most frequently sold medicines from the sales history.

3. **Substitute shown for in-stock medicines only** — when an alternative has 0 stock after the base-name dedup, it is shown as an alternative. The filter applies to the main list but not to the alternatives sub-list inside each result. Alternatives should also be filtered for stock > 0.

4. **Row-level medicine change search** — when a pharmacist clicks the edit icon on a cart row to swap the medicine, the row search queries the API live but does not pass results through `consolidateSearchResults`. This means OOS or duplicate medicines can still appear in the row-level swap dropdown.

5. **Refill auto-checkout** — if a refill link brings the user to POS with URL params, the cart is hydrated from the refill data using `api.searchMedicine` per item. If stock is unavailable for a refill item, there is no clear alert — the item is simply added with quantity 0.

6. **No per-bill notes field** — there is nowhere to add a free-text note (e.g. "patient allergic to aspirin") that would be stored against the sale record.

---

## 7. How to Manage Bills

**Saving a bill:** Ctrl+S or the green "Save Bill" button. The bill becomes a sale record visible in the Sales History page.

**Editing a saved bill:** not possible from POS directly. Go to Sales History, find the invoice, and use the edit option there.

**Holding a bill mid-session:** switch to a new tab (the current cart is preserved in the existing tab). All tabs are saved in localStorage, so closing the browser and reopening resumes where you left off.

**Cancelling a bill:** clear the cart (trash icon) or close the tab.

**Backdating a bill:** change the Billing Date field before saving.

**Credit bills:** set payment method to CREDIT. Patient name and phone are mandatory. A WhatsApp PDF is sent automatically on save.
