-- Migration 003: License state storage in app_settings
-- All license state is stored as key-value rows.
-- The app_settings table already exists (created by existing code).

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_key',              '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_current_nonce',    '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_last_validated',   '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_expiry',           '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_install_date',     '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_revoked',          'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_session_token',    '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('license_security_worker_downloaded', 'false');
