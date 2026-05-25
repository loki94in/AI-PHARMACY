CREATE TABLE IF NOT EXISTS message_templates (
    locale TEXT NOT NULL,
    key    TEXT NOT NULL,
    value  TEXT NOT NULL,
    PRIMARY KEY (locale, key)
);