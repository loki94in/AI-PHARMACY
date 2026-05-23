--title: "AI Pharmacy Documentation"
date: "2026-05-23"
version: "1.0"
--
# AI Pharmacy Documentation

## Table of Contents
- [System Core Philosophy & Rules](#system-core-philosophy--rules)
- [Page-wise System Directory](#page-wise-system-directory)
- [Core Workflow Explanations](#core-workflow-explanations)
- [End-of-Cycle Accounting & Security](#end-of-cycle-accounting--security)
- [Mobile Remote Viewer Bridge (The Data Link)](#mobile-remote-viewer-bridge-the-data-link)
- [Verification](#verification)

--
## System Core Philosophy & Rules

Zero-Budget Focus: Designed to be built entirely with free, open-source utilities and existing phone lines. No monthly subscription fees, message gateway costs, or recurring cloud server charges.

Offline-First Workflow: The core billing counter, stock database, prescription matching, and local computer functions run 100 % offline. Internet connectivity is used only for background tasks (downloading distributor emails, sending WhatsApp notifications).

Speed Optimized: Built to run at maximum speed with zero lag on a typical office computer, using lightweight text data rather than heavy files.

Instant Direct Access: No login screens or credential panels. The software opens immediately into the active billing screen to prioritize rapid customer service.

--
## Page-wise System Directory

The application consists of 18 distinct, interconnected sections. The Sales page serves as the central hub; other pages support business operations.

### Page 1: Sales (Main Billing Hub)
- Barcode/Name Input: Smart field for immediate item addition via hardware scanners or partial-name auto-suggest typing.
- AI Camera Scanner Button: One-click button triggers a desktop camera to snap a picture of a medicine pack, read printed text, and add it to the bill within one second.
- Quick-Adjust Toolbar: Instantly change quantities or apply per-row price changes using rapid keyboard navigation.
- Undo/Reverse Button: Single-click error corrector that cancels a mistakenly scanned item and updates stock values.
- Hold Bill Function: Suspends the current cart into a background tray to serve another walk-in customer, then resumes the original transaction.
- Smart-Hover Peek: Hovering over a drug row opens a read-only comparison window showing historical price logs from all suppliers.
- Smart-Suggest Sidebar: Selecting a doctor populates an adaptive list of their most frequent co-prescriptions.
- Customer Lookup: Fast search to tie a patient profile to the bill for automated reminders and CRM logs.
- Stock Override: Immediate administrative adjustment of physical shelf inventory directly from the counter desk.
- Billing Summary: Real-time panel displaying subtotals, tax/GST values, custom discounts, and final net payable amount.

### Page 2: Dashboard (Command Center)
- Real-Time Analytics: Live counters for today's cumulative sales, purchase expenses, and estimated net profit.
- System Action Monitors: Visual indicators tracking background task health (e.g., last email scan, last backup).
- Central Alert Queue: Warning flags for low stock, upcoming drug expirations, and new distributor invoices awaiting verification.

### Page 3: Inventory (Stock Master)
- Granular Fields: Records include product name, brand, HSN code, composition, pack size, and rack/bin locations.
- Legal Category Tags: Toggles assigning items to Regular/OTC, Schedule H1, or Substance/Narcotics groups.
- Growth Demand Indicators: Up/down arrows signal sales velocity trends.

### Page 4: Purchases (Distributor Entry)
- Dual-Inflow Ingestion: Supports automated processing from Gmail scraper queue or manual entry via paper bills.
- Margin/Rate Optimization: Side-by-side comparison matrix matching new purchase costs against historical records.
- Auto-Queue Barcode Print: Successful purchase invoices automatically push newly ingested items into a barcode-printing queue.

### Page 5: Returns (Correction Page)
- Sales Returns: Connects customer returns to original sales receipts, handling stock replacement or cash refunds.
- Purchase Returns: Generates vendor-specific return bills for expired or damaged batches.

### Page 6: Orders (Customer Special Requests)
- Custom Task Entry: Records special requests for unavailable medicines, linking them to customer profiles and phone numbers.
- Arrival Flags: Tracks fulfillment loop and alerts the store when a matching batch arrives via new purchase bills.

### Page 7: Alerts (Monitor)
- Expiry-Near Monitor: Color-coded alerts for batches approaching expiration (typically within 3 months).
- Non-Moving Stock Analyzer: Highlights stagnant capital tied up in items with no sales over custom intervals.

### Page 8: Customers (CRM & Patient Health Diaries)
- Profile Ledger: Database of patient contacts, transaction history, and recurring treatment dates.
- Outreach Portal: Manual or system-triggered hooks into WhatsApp threads for immediate communication.

### Page 9: Reports (Analyzer)
- Performance Ledger: Exports documents profiling total sales, purchase costs, gross margins, and tax summaries.
- Distributor Quality Matrix: Ranks vendors based on discounts and purchase costs.

### Page 10: Importing (Gmail/Data Link)
- Interval Scheduler: Controls how often the background service wakes (every 15, 30, or 60 minutes) to parse email boxes.
- Mapping Rule Filters: Criteria for targeting distributor email addresses and subject lines to safely capture PDF/CSV attachments.

### Page 11: Migration (Data Bridge)
- Universal File Uploader: Reads raw Excel or CSV exports from legacy software.
- Column Matching Intermediary: UI links old database keys (e.g., `Old_Meds_Name`) to new schema fields (e.g., `Product_Name`).

### Page 12: Barcode (Label Generator)
- Universal Document Generation: Batches items into printable formats for A4 sheets or thermal labels.
- Manual Batch Overrides: Fine-tune exact print counts per item before exporting to a printer.

### Page 13: Backup (Safety)
- Manual Overrides: `Backup Now` trigger generates an on-demand system checkpoint file.
- Status Logs: Visual history confirming successful local and off-site backup passes.

### Page 14: Settings (Control)
- Branding Registry: Stores shop name, logo, and mandatory drug license numbers for auto-populating documents.
- Rule Configuration: Custom low-stock thresholds, reminder timeframes, and WhatsApp template texts.

### Page 15: Support & Dispatch (Logistics Control)
- Audit Logging: Tamper-proof registry documenting every modification, price change, or return transaction with timestamps.
- Delivery Boy Dispatch Board: Interactive list showing pickup alerts, contact sheets, and live transaction statuses (Pending / Collected / Completed).

### Page 16: Archive & Maintenance (Database Hygiene)
- Billing Ledger Calendar: Visual month-by-month grid to review, manage, or re-print old bills.
- Auto-Purge Threshold: Automated boundary (100-150 bills); older records are purged to keep the system fast.

### Page 17: Legal Compliance & Controlled Substance Register
- Prescription Blockade: Hard-lock validation if a user attempts to save an H1 or Narcotic bill without a prescriber ID.
- Inspector Port: Read-only compliance report compiling doctor details, patient addresses, and drug volumes for inspectors.

--
## Core Workflow Explanations

### A. Automated Sequential Number System (Prefix Rule)
- Sales: `S-YYYY-XXXX`
- Purchases: `P-YYYY-XXXX`
- Returns: `R-YYYY-XXXX`
- Adjustments: `A-YYYY-XXXX`

These prefixes provide instantly searchable, unique identifiers for every transaction type.

### B. Smart-Hover Price Comparison Matrix
- Hovering over a drug shows the last 6+ purchase rows with columns: Distributor | Date | Qty | Rate | Discount.
- Green highlights the lowest historical purchase cost; red/yellow flags inflated rates.
- Clicking the `+` icon copies vendor name and price into a new purchase sheet.

### C. AI Camera "Snapshot-OCR" System
1. Press hotkey (e.g., F9) or click Start AI Camera.
2. Webcam captures a high-resolution still of the medicine box.
3. Offline filter enhances printed letters.
4. OCR extracts text within one second.
5. Fuzzy matching corrects minor errors (e.g., `ParacetamoI` → `Paracetamol`).
6. Item is added directly to the active bill.

### D. Automated Patient Care & Maintenance Cycles
- Special Order Alerts: Matches medicine names on new purchase sheets against pending special-order requests and sends WhatsApp notifications.
- Smart Medication Refill Loop: Calculates depletion dates and prepares refill notices between days 20-25 of the cycle.
- Adaptive Cancellation Logic: Cancels pending notifications if the patient purchases the medicine before the reminder window.

### E. Delivery Boy WhatsApp Dispatcher
- Vendor Mapping: Links distributors to specific delivery personnel.
- Background Trigger: New email invoice automatically routes a structured WhatsApp message to the assigned delivery boy.
- Watchdog Monitor: Escalates if status isn't updated within 4 hours.

### F. Automated Distributor-Wise Return Sorter
- AI camera reads batch numbers of expired medicines.
- Virtual basket cross-references purchase logs to identify the supplying distributor.
- Split Invoice Generation: Creates separate return documents grouped by distributor, applying original purchase costs.

### G. Smart Doctor-Wise Suggestion Engine
- Selecting a doctor analyses historic co-prescriptions.
- Sidebar suggests the most frequent accompanying medicines, ranked by popularity.

--
## End-of-Cycle Accounting & Security

### Financial Year Auto-Reset Logic
- Date-Locked Sequences: At midnight on 31 Mar, counters lock into that year's archive.
- Automated Format Migration: On 1 Apr, prefixes shift to the new fiscal year (e.g., `S-2026-XXXX` → `S-2027-0001`).
- Directory Partitioning: Database archives move to `C:\PharmacyData\YYYY-YY\Sales` etc., keeping active folders small.

### Backup & Recovery Loop
- Live Snapshots: Secure database copies in milliseconds while the shop operates.
- Hourly HDD Sync: Compresses snapshot to a date-stamped file and copies to secondary HDD.
- Off-Site Telegram Cloud Relay: When internet is available, uploads backup to a private Telegram channel.
- Master Security Key: Entire database encrypted with `config.key` stored on a USB drive outside the application folder.

--
## Mobile Remote Viewer Bridge (The Data Link)

```
+-------------------------------------------------------------------------+
|            MOBILE REMOTE VIEWER FLOW            |
+-------------------------------------------------------------------------+
|                                     |
| [LOCAL SHOP PC] (Offline Core)                     |
| - Generates encrypted business summary every 4 hours.          |
| - Emails file to private Gmail box.                  |
|                                     |
|                  ||                  |
|                  \/                  |
|                                     |
| [SECURE GMAIL BRIDGE] (Free Cloud Link)                |
| - Acts as encrypted storage post box.                  |
| - Works even when shop PC is off.                   |
|                                     |
|                  ||                  |
|                  \/                  |
|                                     |
| [YOUR MOBILE APP] (Android / iOS)                   |
| - Logs into private Gmail channel.                   |
| - Downloads latest update into local cache.               |
| - Displays stock and recent purchase rates instantly.         |
|                                     |
+-------------------------------------------------------------------------+
```

Offline Tolerance: If the shop PC is powered off, the mobile app continues to show the last known status, allowing you to answer customer inquiries at any hour.

--
## Verification

1. Open the edited `AI PHARMACY.MD` in a markdown viewer or IDE and verify that all headings render correctly and the Table of Contents links navigate to each section.
2. Run a spell-check/grammar lint (e.g., VS Code linter) to catch any remaining typos.
3. Preview the markdown (e.g., using the `markdown-preview` extension) to ensure tables, code blocks, and ASCII diagrams render as intended.
4. Request a peer review for clarity and completeness.
