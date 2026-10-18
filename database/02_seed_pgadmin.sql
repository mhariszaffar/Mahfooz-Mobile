-- ============================================================================
-- Mahfooz Mobile - seed data (pgAdmin-compatible)
-- Run in pgAdmin Query Tool: it has NO psql backslash commands.
-- TRUNCATEs existing data first, so it can be run repeatedly.
-- ============================================================================
TRUNCATE audit_log, cnic_registration_attempt, app_session, otp, notification,
         dispute, case_timeline, theft_case, account_recovery_question,
         device, account, pta_approved_imei RESTART IDENTITY CASCADE;

-- ============================================================================
-- Mahfooz Mobile — seed data (matches the website's demo dataset)
--
-- Load AFTER 01_schema.sql:   psql -d mahfooz -f 02_seed.sql
--
-- The two keys below are DEMO ONLY. In production they come from a KMS/vault
-- and are NEVER committed (concept doc, Data Protection). Override at load time:
--   psql -d mahfooz -v enc_key="$ENC_KEY" -v idx_key="$IDX_KEY" -f 02_seed.sql
-- ============================================================================

SET client_encoding = 'UTF8';

BEGIN;

-- ---------------------------------------------------------------------------
-- PTA type-approved IMEI registry
--   * first five are approved AND linked to the demo users below
--   * next three are approved but UNLINKED (available to register)
--   * last one is a REVOKED approval (is_active=false) -> registration refused
-- ---------------------------------------------------------------------------
INSERT INTO pta_approved_imei (imei, brand, model, approval_ref, approved_on, is_active) VALUES
  ('490154203237518', 'Apple',   'iPhone 13 Pro',   'PTA-TA-2021-0098', '2021-11-02', true),
  ('356938035643809', 'Samsung', 'Galaxy S23',      'PTA-TA-2023-0415', '2023-02-17', true),
  ('013888003685123', 'Apple',   'iPad Air (2022)', 'PTA-TA-2022-0251', '2022-04-09', true),
  ('358765102345671', 'Nokia',   'G21',             'PTA-TA-2022-0133', '2022-03-01', true),
  ('352099001761481', 'Google',  'Pixel 7',         'PTA-TA-2022-0712', '2022-10-13', true),
  ('865432109876549', 'Xiaomi',  '13',              'PTA-TA-2023-0588', '2023-05-20', true),
  ('359876543210983', 'Oppo',    'Reno 10',         'PTA-TA-2023-0901', '2023-08-30', true),
  ('012456789012341', 'Vivo',    'V29',             'PTA-TA-2023-1002', '2023-09-11', true),
  ('998877665544339', 'Infinix', 'Zero 30',         'PTA-TA-2023-0777', '2023-07-01', false);  -- approval revoked

-- ---------------------------------------------------------------------------
-- Accounts  (identifiers encrypted at rest; blind indexes for lookup/uniqueness)
-- Demo passwords: Ali=password123  Sara=passwordS123  Agent=staffpass  Auditor=auditpass
-- Demo Emergency PINs: Ali=446688  Sara=552211
-- ---------------------------------------------------------------------------
INSERT INTO account
  (role, full_name, initials,
   cnic_enc, phone_enc, email_enc, alt_phone_enc,
   cnic_bidx, phone_bidx, cnic_masked, phone_masked,
   password_hash, emergency_pin_hash)
VALUES
  ('citizen', 'Ali Farooq', 'AF',
   pgp_sym_encrypt('42101-1234567-3', 'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('0300-1234567',    'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('ali.farooq@example.com', 'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('0310-9876543',    'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   encode(hmac('42101-1234567-3', 'DEMO-blind-index-hmac-key-REPLACE-IN-PROD', 'sha256'), 'hex'),
   encode(hmac('0300-1234567',    'DEMO-blind-index-hmac-key-REPLACE-IN-PROD', 'sha256'), 'hex'),
   mask_cnic('42101-1234567-3'), '•••• ••• 4567',
   crypt('password123', gen_salt('bf')),
   crypt('446688',      gen_salt('bf'))),

  ('citizen', 'Sara Khan', 'SK',
   pgp_sym_encrypt('42101-7654321-1', 'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('0321-7654321',    'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('sara.khan@example.com', 'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   pgp_sym_encrypt('0345-1122334',    'DEMO-column-encryption-key-REPLACE-IN-PROD'),
   encode(hmac('42101-7654321-1', 'DEMO-blind-index-hmac-key-REPLACE-IN-PROD', 'sha256'), 'hex'),
   encode(hmac('0321-7654321',    'DEMO-blind-index-hmac-key-REPLACE-IN-PROD', 'sha256'), 'hex'),
   mask_cnic('42101-7654321-1'), '•••• ••• 4321',
   crypt('passwordS123', gen_salt('bf')),
   crypt('552211',       gen_salt('bf'))),

  ('agent',   'S. Raza',     'SR', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   crypt('staffpass', gen_salt('bf')), NULL),
  ('auditor', 'N. Chaudhry', 'NC', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   crypt('auditpass', gen_salt('bf')), NULL),
  ('system',  'System',      'SY', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
   crypt(gen_random_uuid()::text, gen_salt('bf')), NULL);

-- ---------------------------------------------------------------------------
-- Recovery questions (demo answers: iphone / march 2026 / karachi / blue / askari 11)
-- ---------------------------------------------------------------------------
INSERT INTO account_recovery_question (account_id, position, question, answer_hash)
SELECT a.id, v.position, v.question, encode(digest(v.ans, 'sha256'), 'hex')
FROM (VALUES
  (1, 'What nickname did you give your first device?', 'iphone'),
  (2, 'Approximately when did you register?',          'march 2026'),
  (3, 'What city did you register from?',              'karachi'),
  (4, 'What''s your favourite colour?',                'blue'),
  (5, 'Which neighbourhood did you grow up in?',        'askari 11')
) AS v(position, question, ans)
CROSS JOIN (SELECT id FROM account WHERE full_name IN ('Ali Farooq','Sara Khan')) a;

-- ---------------------------------------------------------------------------
-- Devices (each links an APPROVED IMEI to an account/CNIC)
-- ---------------------------------------------------------------------------
INSERT INTO device (account_id, imei, nickname, brand, model, status, registered_at) VALUES
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '490154203237518', 'iPhone',      'Apple',   'iPhone 13 Pro',   'active',   '2026-03-12T10:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '356938035643809', 'Work Galaxy', 'Samsung', 'Galaxy S23',      'blocked',  '2026-01-02T09:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '013888003685123', 'iPad',        'Apple',   'iPad Air (2022)', 'active',   '2025-11-19T09:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '358765102345671', 'Old Nokia',   'Nokia',   'G21',             'retired',  '2024-06-01T09:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Sara Khan'),  '352099001761481', 'Pixel',       'Google',  'Pixel 7',         'active',   '2025-08-08T09:00:00Z');

-- ---------------------------------------------------------------------------
-- Seed theft case (the blocked Galaxy) + its timeline
-- ---------------------------------------------------------------------------
INSERT INTO theft_case
  (ref, device_id, account_id, created_at, police_station, district,
   risk_level, risk_matches, risk_total, risk_factors, block_state, review_status, reported_via)
VALUES
  ('MM-2026-00482',
   (SELECT id FROM device WHERE imei='356938035643809'),
   (SELECT id FROM account WHERE full_name='Ali Farooq'),
   '2026-10-14T19:42:00Z', 'Gulberg Station', 'Lahore',
   'low', 4, 4,
   '{"emergencyPin":true,"otpConfirmation":true,"imeiActive":true,"simOwnership":true}'::jsonb,
   'full', 'fully-verified', 'registered phone');

INSERT INTO case_timeline (case_id, step, at)
SELECT c.id, v.step, v.at FROM (VALUES
  ('Reported',               '2026-10-14T19:42:00Z'::timestamptz),
  ('Device Blocked',         '2026-10-14T19:42:00Z'::timestamptz),
  ('Report Sent to Police',  '2026-10-14T19:42:05Z'::timestamptz)
) AS v(step, at) CROSS JOIN (SELECT id FROM theft_case WHERE ref='MM-2026-00482') c;

-- ---------------------------------------------------------------------------
-- Staff queue (disputes)
-- ---------------------------------------------------------------------------
INSERT INTO dispute (case_ref, account_id, citizen_label, kind, summary, priority, status, created_at) VALUES
  ('CS-10492', NULL, '•••• (masked)', 'dispute', 'Disputed Block', 'High',   'Open',      '2026-10-14T00:00:00Z'),
  ('CS-10488', NULL, '•••• (masked)', 'dispute', 'Unblock Assist', 'Normal', 'In Review', '2026-10-13T00:00:00Z');

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
INSERT INTO notification (account_id, text, meta, icon) VALUES
  ((SELECT id FROM account WHERE full_name='Ali Farooq'),
   'Device blocked — Samsung Galaxy S23',
   'Ref# MM-2026-00482 · 14 Oct 2026, 7:42 PM', 'check');

-- ---------------------------------------------------------------------------
-- Audit log (trigger builds the hash chain automatically, in insert order)
-- ---------------------------------------------------------------------------
INSERT INTO audit_log (actor, action, ref) VALUES
  ('System',     'SEED_INITIALIZED',   '—'),
  ('Ali Farooq', 'ACCOUNT_REGISTERED', mask_cnic('42101-1234567-3')),
  ('Ali Farooq', 'DEVICE_REGISTERED',  '•••• •••• 7518'),
  ('Ali Farooq', 'DEVICE_BLOCKED',     'MM-2026-00482');

-- ---------------------------------------------------------------------------
-- Additional PTA type-approved IMEIs (all active). Four are registered as
-- devices below; the remaining four stay UNLINKED and available to register.
-- ---------------------------------------------------------------------------
INSERT INTO pta_approved_imei (imei, brand, model, approval_ref, approved_on, is_active) VALUES
  ('352910456780109', 'Apple',   'iPhone 15',        'PTA-TA-2024-0101', '2024-01-15', true),
  ('356880123456704', 'Samsung', 'Galaxy S24 Ultra', 'PTA-TA-2024-0102', '2024-02-20', true),
  ('351122334455604', 'Google',  'Pixel 8',          'PTA-TA-2024-0103', '2024-02-28', true),
  ('860555123456701', 'OnePlus', '12',               'PTA-TA-2024-0104', '2024-03-05', true),
  ('359099887766508', 'Realme',  '12 Pro',           'PTA-TA-2024-0105', '2024-03-18', true),
  ('357777123456701', 'Tecno',   'Camon 30',         'PTA-TA-2024-0106', '2024-04-02', true),
  ('354444555566605', 'Infinix', 'Note 40',          'PTA-TA-2024-0107', '2024-04-22', true),
  ('861222333444501', 'Huawei',  'Nova 12',          'PTA-TA-2024-0108', '2024-05-10', true);

INSERT INTO device (account_id, imei, nickname, brand, model, status, registered_at) VALUES
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '352910456780109', 'iPhone 15',   'Apple',   'iPhone 15',        'active', '2024-02-01T10:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Ali Farooq'), '356880123456704', 'S24 Ultra',   'Samsung', 'Galaxy S24 Ultra', 'active', '2024-03-01T10:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Sara Khan'),  '351122334455604', 'Sara Pixel 8','Google',  'Pixel 8',          'active', '2024-02-15T10:00:00Z'),
  ((SELECT id FROM account WHERE full_name='Sara Khan'),  '860555123456701', 'Sara OnePlus','OnePlus', '12',               'active', '2024-03-20T10:00:00Z');

COMMIT;

-- Quick confirmation output
SELECT (SELECT count(*) FROM account)            AS accounts,
       (SELECT count(*) FROM pta_approved_imei)  AS approved_imeis,
       (SELECT count(*) FROM device)             AS devices,
       (SELECT count(*) FROM theft_case)         AS cases,
       (SELECT count(*) FROM audit_log)          AS audit_rows;