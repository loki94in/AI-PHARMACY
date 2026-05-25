---
name: project-ai-pharmacy-telegram-email-features
description: Current features being designed for AI Pharmacy: Telegram order management and email-triggered delivery notifications
metadata:
  type: project
---

Feature 1: Telegram Order Management for Owners/Managers
- Purpose: Allow pharmacy owners/managers to view and update order status via Telegram
- Flow: /orders command → shows recent orders list → user selects order → bot shows details → user picks new status → bot updates database
- Status Options: pending, processing, shipped, delivered, cancelled
- Integration: Extends existing telegramBot.ts, reuses sales_invoices table patterns
- Decision: Interactive command flow selected over direct commands or inline keyboards

Feature 2: Email-Triggered WhatsApp/Telegram Notifications for Delivery Boys
- Purpose: Automatically notify delivery boys when order emails arrive from distributors
- Flow: EmailService polls inbox → detects order-related emails → extracts distributor/order info → sends formatted WhatsApp & Telegram messages
- Content: Full order details with distributor pickup info and pharmacy delivery address, designed to be noticeable/popup-style
- Integration: Enhances existing EmailService, uses whatsappClient.ts and TelegramBotService
- Decision: Enhanced EmailService approach selected over separate service or event-driven

Shared Context:
- Project uses SQLite database with sales_invoices table for orders
- Existing services: EmailService (IMAP/SMTP), WhatsApp client, TelegramBotService
- Environment variables used for configuration (DB_PATH, TELEGRAM_BOT_TOKEN, etc.)
- Follows Windows-specific conventions from CLAUDE.md (line endings, command usage)
- Both features designed to integrate with existing codebase patterns
- Notifications designed to be attention-grabbing with popup-style appearance