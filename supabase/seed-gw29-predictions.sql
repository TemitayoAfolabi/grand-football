-- =============================================================================
-- GW29 Predictions Seed — Grand Football
-- Source: Google Form submissions (3 Mar 2026)
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================================
-- Fixture ID reference (GW29):
--   Bournemouth vs Brentford       → 4f082ef7-7b58-4725-ada4-d54fd7789ad7
--   Everton vs Burnley             → 79b0b46f-813a-4e94-a0a0-dded1e4c49ba
--   Leeds vs Sunderland            → 44a3f6d3-0098-4376-934d-1604b3017635
--   Wolves vs Liverpool            → a5feb398-ecb8-40f2-8be3-51876ce56f9d
--   Aston Villa vs Chelsea         → 9b8394b8-3923-457e-bc9a-8aec386fb696
--   Brighton vs Arsenal            → bbc7864e-d613-431d-a18c-9dd0487a78c4
--   Fulham vs West Ham             → f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189
--   Man City vs Nottingham Forest  → 8b348b53-9071-4f21-910f-98506c9374a0
--   Newcastle vs Man Utd           → c65c121c-961a-451c-acd0-9626687bcd1a
--   Spurs vs Crystal Palace        → fa533dd5-aa7b-48dd-845f-c40c63801e69
-- =============================================================================

INSERT INTO public.predictions (user_id, fixture_id, home_score, away_score, submitted_at, updated_at)
VALUES

-- -------------------------
-- Osita (submitted 2026-03-02 08:25:19)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Osita'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 2, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 3, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 2, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 2, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 1, 1, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 0, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 2, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),
((SELECT id FROM profiles WHERE display_name = 'Osita'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 1, '2026-03-02 08:25:19+00', '2026-03-02 08:25:19+00'),

-- -------------------------
-- Chris (submitted 2026-03-02 08:43:42)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Chris'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 3, 1, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 4, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 3, 2, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 0, 2, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 1, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 0, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 3, 2, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),
((SELECT id FROM profiles WHERE display_name = 'Chris'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 2, '2026-03-02 08:43:42+00', '2026-03-02 08:43:42+00'),

-- -------------------------
-- Temitayo (submitted 2026-03-02 11:01:12)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 3, 1, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 3, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 2, 2, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 3, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 1, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 1, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 3, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),
((SELECT id FROM profiles WHERE display_name = 'Temitayo'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 2, '2026-03-02 11:01:12+00', '2026-03-02 11:01:12+00'),

-- -------------------------
-- Cozy (submitted 2026-03-02 21:24:29)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Cozy'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 2, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 2, 1, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 0, 2, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 2, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), '8b348b53-9071-4f21-910f-98506c9374a0', 2, 0, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 1, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Cozy'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 1, '2026-03-02 21:24:29+00', '2026-03-02 21:24:29+00'),

-- -------------------------
-- Anu (submitted 2026-03-02 23:12:24)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Anu'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 1, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 0, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 2, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 3, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 2, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 1, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 0, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),
((SELECT id FROM profiles WHERE display_name = 'Anu'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 1, '2026-03-02 23:12:24+00', '2026-03-02 23:12:24+00'),

-- -------------------------
-- Temizack (submitted 2026-03-03 08:26:39)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Temizack'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 0, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 0, 1, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 2, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 2, 3, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 0, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 1, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 0, 1, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),
((SELECT id FROM profiles WHERE display_name = 'Temizack'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 0, '2026-03-03 08:26:39+00', '2026-03-03 08:26:39+00'),

-- -------------------------
-- Kiki (submitted 2026-03-03 15:29:43)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Kiki'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 1, 2, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 3, 1, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 2, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 2, 2, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 3, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 2, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 1, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 1, 2, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Kiki'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 1, '2026-03-03 15:29:43+00', '2026-03-03 15:29:43+00'),

-- -------------------------
-- Deon (submitted 2026-03-03 16:34:34)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Deon'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 3, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), '44a3f6d3-0098-4376-934d-1604b3017635', 3, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 2, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 3, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 3, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 1, 3, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),
((SELECT id FROM profiles WHERE display_name = 'Deon'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 3, 1, '2026-03-03 16:34:34+00', '2026-03-03 16:34:34+00'),

-- -------------------------
-- Michael (submitted 2026-03-03 16:46:43)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Michael'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 2, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 2, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), '8b348b53-9071-4f21-910f-98506c9374a0', 2, 0, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),
((SELECT id FROM profiles WHERE display_name = 'Michael'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 1, 1, '2026-03-03 16:46:43+00', '2026-03-03 16:46:43+00'),

-- -------------------------
-- David (submitted 2026-03-03 17:34:06)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'David'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 2, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 2, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 3, 3, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 2, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 2, 2, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 2, 0, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), '8b348b53-9071-4f21-910f-98506c9374a0', 3, 1, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 2, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),
((SELECT id FROM profiles WHERE display_name = 'David'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 2, 1, '2026-03-03 17:34:06+00', '2026-03-03 17:34:06+00'),

-- -------------------------
-- Fiyin (submitted 2026-03-03 17:46:29)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 2, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 3, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 1, 0, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 2, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 0, 2, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 3, 2, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), '8b348b53-9071-4f21-910f-98506c9374a0', 2, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 2, 2, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),
((SELECT id FROM profiles WHERE display_name = 'Fiyin'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 1, 1, '2026-03-03 17:46:29+00', '2026-03-03 17:46:29+00'),

-- -------------------------
-- Nyema (submitted 2026-03-03 20:03:32)
-- -------------------------
((SELECT id FROM profiles WHERE display_name = 'Nyema'), '4f082ef7-7b58-4725-ada4-d54fd7789ad7', 1, 2, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), '79b0b46f-813a-4e94-a0a0-dded1e4c49ba', 2, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), '44a3f6d3-0098-4376-934d-1604b3017635', 2, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), 'a5feb398-ecb8-40f2-8be3-51876ce56f9d', 2, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), '9b8394b8-3923-457e-bc9a-8aec386fb696', 1, 0, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), 'bbc7864e-d613-431d-a18c-9dd0487a78c4', 1, 3, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), 'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189', 0, 0, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), '8b348b53-9071-4f21-910f-98506c9374a0', 2, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), 'c65c121c-961a-451c-acd0-9626687bcd1a', 0, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00'),
((SELECT id FROM profiles WHERE display_name = 'Nyema'), 'fa533dd5-aa7b-48dd-845f-c40c63801e69', 0, 1, '2026-03-03 20:03:32+00', '2026-03-03 20:03:32+00')

ON CONFLICT (user_id, fixture_id) DO UPDATE SET
  home_score   = EXCLUDED.home_score,
  away_score   = EXCLUDED.away_score,
  submitted_at = EXCLUDED.submitted_at,
  updated_at   = now();

-- =============================================================================
-- Verify: should return 120 rows (12 users × 10 fixtures)
-- =============================================================================
SELECT
  p.display_name,
  f.home_team,
  f.away_team,
  pr.home_score,
  pr.away_score
FROM predictions pr
JOIN profiles p  ON p.id = pr.user_id
JOIN fixtures f  ON f.id = pr.fixture_id
WHERE pr.fixture_id IN (
  '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
  '79b0b46f-813a-4e94-a0a0-dded1e4c49ba',
  '44a3f6d3-0098-4376-934d-1604b3017635',
  'a5feb398-ecb8-40f2-8be3-51876ce56f9d',
  '9b8394b8-3923-457e-bc9a-8aec386fb696',
  'bbc7864e-d613-431d-a18c-9dd0487a78c4',
  'f3e2e2cf-0e6c-4194-a5f2-93c6a0ab1189',
  '8b348b53-9071-4f21-910f-98506c9374a0',
  'c65c121c-961a-451c-acd0-9626687bcd1a',
  'fa533dd5-aa7b-48dd-845f-c40c63801e69'
)
ORDER BY p.display_name, f.kickoff_time;
