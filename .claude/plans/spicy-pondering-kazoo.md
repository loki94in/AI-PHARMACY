# Telegram and Gmail Integration Plan

## Context
The user wants to enhance the application by:
1. Importing mails from Gmail inbox
2. Using Telegram as a persistent connection/middle layer between the application and users
3. Keeping the application always connected through Telegram

Currently, the application has:
- Basic Telegram setup in src/routes/utilities.ts (TelegramBot initialization and /telegram/send endpoint)
- Email parsing capability in src/routes/email.ts
- Email polling worker in src/worker/emailPoller.ts
- A complete Telegram bot design specification in docs/superpowers/specs/2026-05-24-telegram-bot-design.md

## Recommended Approach

### 1. Enhance Telegram Integration
Transform the current basic Telegram setup into a full-featured bot that:
- Receives commands from users (like /check <medicine> for availability)
- Sends notifications and updates to users
- Maintains persistent connection as requested

### 2. Complete Gmail Integration
Enhance the existing email capabilities to:
- Actively poll Gmail IMAP for incoming emails
- Parse emails for medicine orders, inquiries, etc.
- Trigger appropriate actions in the application based on email content
- Optionally send emails through Gmail/SMTP for outbound communication

### 3. Create Integration Bridge
Establish a communication layer where:
- Telegram bot acts as the primary user interface
- Gmail integration handles email-based workflows
- Both systems can trigger actions in the core application
- Application state changes can be pushed to users via Telegram

## Implementation Details

### Files to Modify/Create:

1. **src/telegramBot.ts** (NEW) - Dedicated Telegram bot implementation
   - Initialize TelegramBot with long polling
   - Implement command handlers (/check, /help, /status, etc.)
   - Integration with application services
   - Outbound messaging capabilities

2. **src/routes/telegram.ts** (NEW) - Telegram webhook/routes (if needed for webhook mode)
   - Alternative to long polling for production deployment

3. **src/services/emailService.ts** (NEW) - Enhanced email service
   - Builds upon existing emailPoller.ts
   - Adds SMTP sending capabilities
   - Implements email templating for order confirmations, etc.

4. **Enhance existing emailPoller.ts** 
   - Add better error handling and reconnection logic
   - Integrate with application services for processing email content
   - Add filtering for specific email types (orders, inquiries, etc.)

5. **Update src/routes/utilities.ts**
   - Remove basic Telegram setup (move to dedicated files)
   - Keep other utility routes intact

### Key Features to Implement:

#### Telegram Bot Features:
- `/check <medicine>` - Check medicine availability (per design spec)
- `/help` - Show available commands
- `/status` - Application/system status
- Automatic notifications for:
  - Low stock alerts
  - Order confirmations
  - Delivery updates
  - Promotional messages

#### Gmail Integration Features:
- Poll Gmail IMAP for new emails every 5 minutes (configurable)
- Parse emails for:
  - New medicine orders (extract medicine names, quantities)
  - Inquiry emails (auto-response or routing to appropriate department)
  - Supplier communications
- Send emails via SMTP:
  - Order confirmations
  - Shipping notifications
  - Newsletter/promotional content

#### Application Integration:
- Create service interfaces that both Telegram and Gmail can use
- Ensure thread safety for concurrent access
- Implement proper error handling and logging
- Add metrics/monitoring for both integrations

## Verification Plan

1. **Unit Tests**:
   - Test Telegram command parsing and responses
   - Test email parsing logic
   - Test service layer interactions

2. **Integration Tests**:
   - Test end-to-end flow: Telegram command → database query → response
   - Test end-to-end flow: Email received → parsed → action triggered → confirmation sent

3. **Manual Testing**:
   - Verify Telegram bot responds correctly to commands
   - Verify email polling picks up test emails
   - Verify outbound emails are sent correctly
   - Verify application state updates are reflected in both systems

4. **Environment Setup**:
   - Required environment variables:
     - TELEGRAM_BOT_TOKEN
     - TELEGRAM_CHAT_ID (optional, for default notifications)
     - IMAP_USER, IMAP_PASS, IMAP_HOST, IMAP_PORT, IMAP_TLS
     - SMTP_USER, SMTP_PASS, SMTP_HOST, SMTP_PORT (for outgoing mail)
     - EMAIL_POLL_INTERVAL (optional, defaults to 5 minutes)

## Risks and Mitigations

1. **API Rate Limits** (Telegram):
   - Mitigation: Implement rate limiting and queuing for outbound messages

2. **Email Provider Limits** (Gmail):
   - Mitigation: Respect Gmail's sending limits, implement backoff strategies
   - Consider using dedicated service account or SendGrid/SMTP relay for high volume

3. **Security**:
   - Mitigation: Never hardcode credentials, use environment variables only
   - Validate and sanitize all inputs from Telegram and email
   - Implement authentication for webhook endpoints if used

4. **Reliability**:
   - Mitigation: Implement reconnection logic for both Telegram and IMAP connections
   - Add health check endpoints
   - Implement persistent queuing for critical messages if connectivity is lost

## Phased Implementation

**Phase 1**: Core Telegram Bot
- Basic bot setup with /check and /help commands
- Integration with medicine lookup service
- Outbound messaging capability

**Phase 2**: Enhanced Gmail Integration
- Improved email polling with better error handling
- Email parsing for order/inquiry detection
- Basic outbound email capability

**Phase 3**: Advanced Features & Integration
- Telegram notifications for application events
- Two-way synchronization (Telegram ↔ Application ↔ Email)
- Administrative controls and monitoring
- Performance optimization and scaling considerations

This approach builds on existing code while creating a clean, maintainable integration that fulfills the user's requirement for using Telegram as a persistent connection layer and Gmail for email-based workflows.