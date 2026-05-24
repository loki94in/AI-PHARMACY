# PC Application

*This file outlines the desktop (PC) component of Pharmacy Genius OS.*

## Overview
- Language / UI Framework: Python + PyQt5 (or PySide2)
- Core modules: POS Billing, Dashboard, Inventory Management, Purchases, Returns, CRM, Reports, Backup, Settings, Messaging Hub.

## Feature Flags
- `ai_camera`
- `email_parser`
- `whatsapp`
- `learning_engine`
- `legal_register`
- `cloud_backup`

## Architecture
- Encrypted SQLite (SQLCipher) database.
- Modular UI pages loaded based on feature‑flag state.
- Background threads for backup, email parsing, and archive/purge.

---
*Further implementation details will be added here.*