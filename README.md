# AI Pharmacy OS — Unified Platform Guide

Welcome to the **AI Pharmacy OS** repository. This platform consists of a local desktop-oriented server application (PC Counter) and a companion React Native (Expo) Android application. This document serves as the official workflow manual and user guide.

---

## 🚀 System Architecture Overview

```mermaid
graph TD
    subgraph PC Server (Local Machine)
        DB[(SQLite app.db)] <--> Express[Express.js Server]
        Express <--> DesktopUI[HTML5 Web Interface]
        Express --> WhatsApp[WhatsApp Web JS Client]
        Express --> Tesseract[Tesseract OCR Engine]
    end

    subgraph Mobile App (Expo / React Native)
        AppLock[Biometric App Lock] --> AndroidUI[Chat & Navigation Shell]
        AndroidUI <--> APIClient[lib/api.ts Client]
        APIClient <--> Express
        Express -- SSE Stream --> NotificationService[expo-notifications]
    end
```

---

## 💻 PC Application Workflow

The PC application serves as the main billing hub, invoice generator, and database server.

### 1. POS Billing Counter (`page1.html`)
- **Medicine Autocomplete**: The search bar queries the local SQLite inventory on keypress. Select a medicine to load it into the billing grid.
- **Editable Table Rows**: You can manually edit the name, batch, expiry, quantity, and discount rate directly in the grid. Totals calculate on the fly.
- **Save & Print**: Finalize invoice checkouts. Tapping `Save & Print [F11]` generates a styled PDF invoice and routes it to the local printer queue.

### 2. Stamp & Signature Designer (`stamp-designer.html`)
- **Canvas-based Extraction**: Upload a photo of a physical stamp or signature written on white paper.
- **Filters**: Customize ink colors (Royal Blue, Red, Black/Grey) and enable **Adaptive Shadow Removal** to eliminate gradient shadows.
- **Database Upload**: Extracted transparent PNGs are saved to the server and automatically overlaid on generated PDF billing documents.

### 3. Product Trace & Lifecycle Ledger (`page9.html`)
- **Audit Ledger**: A unified table displaying procurement history (purchases) and counter checkout history (sales) side-by-side.
- **Trace Filter**: Enter any keyword (medicine name, batch, distributor, invoice number) to track exact lot lifecycles.

---

## 📱 Android Mobile App Workflow

The Expo mobile app enables remote monitoring, inventory lookups, prescription scans, and checkout operations directly from the pharmacist's phone.

### 1. Security Lock Screen (`AppLock.tsx`)
- **Activation**: Enable or disable the App Lock under the **More** settings tab.
- **Authentication**: On app startup, the screen requests **Fingerprint/Face ID** validation.
- **PIN Fallback**: If biometric verification fails, enter the custom 4-digit passcode (defaults to `1234`) to unlock.

### 2. Conversational Chat Assistant (`index.tsx`)
- **Assistant Main Tab**: Located as the primary landing tab. Type natural commands or tap action chips:
  - `"find ONDEM"` or `"search amoxicillin"`: Queries the inventory database and lists matches in an **interactive horizontal card carousel** with stock counts and direct "Add to Bill" actions.
  - `"billing"` or `"create bill"`: Spawns a navigation shortcut to checkout.
  - `"notify"` or `"send alert"`: Triggers a local push notification test.
  - `"backup"`: Initiates a transaction database backup script.

### 3. Real-Time Push Alerts (SSE)
- **Background Event Listener**: Connects to the backend Event-Stream (`/api/notifications/stream`) on app launch.
- **Alert Dispatch**: Dispatches native notifications directly to the Android status bar when critical tasks complete or inventory thresholds are breached.

---

## 🛠️ Installation & Setup Guide

### 1. PC Server Setup
1. Install Node.js (v18+) on your PC.
2. In the project root, install dependencies and start:
   ```bash
   npm install
   npm start
   ```
3. The server runs locally on port `3000`.

### 2. Android App Setup (Expo Go)
1. Install Expo Go on your Android 9+ mobile device.
2. Navigate to the mobile directory, install, and run:
   ```bash
   cd pharmacy-mobile
   npm install
   npx expo start
   ```
3. Connect your phone to the **same Wi-Fi network** as the PC.
4. Scan the Metro QR code using Expo Go.
5. On first launch, enter your PC's local IP address (e.g. `http://192.168.1.50:3000`) to link the apps.
