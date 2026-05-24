# Make `ui-demo.html` Functional

Based on the `2026-05-23-page-wise-design.md` specifications, I will make `ui-demo.html` functional by implementing the JavaScript logic to handle Feature Flags dynamically. When a user toggles a feature flag in Page 14 (Settings), the corresponding UI elements across all pages will instantly show/hide or update.

## User Review Required
Please review the list of proposed changes to ensure all feature flag behaviors match your expectations.

## Proposed Changes

### Add IDs to Settings Toggles (Page 14)
I will assign specific IDs to the checkbox inputs in the Settings page:
- `flag-ai_camera`
- `flag-email_parser`
- `flag-whatsapp`
- `flag-cloud_backup`
- `flag-learning_engine`
- `flag-legal_register`
- `flag-custom_labels`
- `flag-cloud_export`

### Add Target Classes/IDs to Conditional UI Elements
I will add CSS classes to the elements that need to be toggled on or off based on the flags, such as:
- **`ai_camera`**: Scan area on Page 1, Batch scan on Page 5.
- **`email_parser`**: "Import from Email" button on Page 4, Orders sync UI on Page 6, Email Parser nav item and Page 10 contents.
- **`whatsapp`**: "Send WhatsApp" buttons on Page 7 & Page 15, Messaging Hub nav item (Page 19).
- **`learning_engine`**: Doctor suggestions sidebar on Page 1.
- **`cloud_backup`**: "Upload to Telegram" button on Page 13.
- **`legal_register`**: Schedule H1 toggle on Page 16 (will update its state).
- **`custom_labels`**: Dynamic template UI on Page 12.
- **`cloud_export`**: "Push to Cloud" button on Page 9.

### Implement JavaScript Logic
I will add a JavaScript function `updateFlags()` that:
1. Reads the current `checked` state of all feature flag toggles.
2. Toggles a CSS class (like `.hidden`) or updates `display` styles for the dependent UI elements.
3. Automatically runs on page load and whenever a toggle is changed.

## Verification Plan
1. Open `ui-demo.html` in the browser.
2. Navigate to Page 14 (Settings) and toggle various feature flags.
3. Navigate to dependent pages (like POS Billing, Purchases, Messaging Hub) and verify that the UI elements appear and disappear correctly based on the toggle state.
