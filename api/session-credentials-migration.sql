BEGIN;
LOCK TABLE auth_sessions, game_tickets IN ACCESS EXCLUSIVE MODE;
INSERT INTO auth_sessions(token,account_id,selected_character_id,created_at,expires_at)
SELECT 'sha256:' || encode(sha256(convert_to(token,'UTF8')),'hex'),account_id,selected_character_id,created_at,expires_at
FROM auth_sessions WHERE token NOT LIKE 'sha256:%'
ON CONFLICT(token) DO NOTHING;
UPDATE game_tickets SET auth_token='sha256:' || encode(sha256(convert_to(auth_token,'UTF8')),'hex') WHERE auth_token NOT LIKE 'sha256:%';
DELETE FROM auth_sessions WHERE token NOT LIKE 'sha256:%';
UPDATE game_tickets SET ticket='sha256:' || encode(sha256(convert_to(ticket,'UTF8')),'hex') WHERE ticket NOT LIKE 'sha256:%';
COMMIT;
