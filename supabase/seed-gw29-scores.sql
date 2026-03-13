-- =============================================================================
-- GW29 Score Records — Manual Correction
-- Date: 2026-03-09
-- Source: WhatsApp GW29 results message
-- Run in: Supabase Dashboard → SQL Editor
-- =============================================================================
-- GW29 Points:
--   Anu      (A)   = 24
--   Chris    (CC)  = 14
--   Cozy     (C)   = 21
--   David    (D)   = 10
--   Fiyin    (F)   = 13
--   Deon     (GD)  = 16
--   Kiki     (KK)  =  7
--   Michael  (M)   = 24
--   Nyema    (N)   =  7  (10 raw − 3 late-penalty = 7 net)
--   Osita    (O)   = 14
--   Okey     (OK)  = 13
--   Temmy    (T)   = 13
--   Temitayo (TT)  = 12
--   Temizack (TZ)  = 14
--
-- Expected overall totals after this update:
--   TZ=655  O=615  GD=611  A=611  C=610  KK=595  M=594
--   F=589   OK=580 CC=546  TT=518 D=515  T=493   N=490
--
-- Anchor fixture (GW29): Bournemouth vs Brentford
--   fixture_id = 4f082ef7-7b58-4725-ada4-d54fd7789ad7
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- STEP 1: Show current GW29 totals (before change)
-- ---------------------------------------------------------------------------
SELECT
  p.display_name,
  COALESCE(SUM(sr.points_awarded), 0) AS current_gw29_points
FROM public.score_records sr
JOIN public.fixtures f     ON f.id = sr.fixture_id
JOIN public.profiles p     ON p.id = sr.user_id
WHERE f.gameweek = 29
  AND f.season_id = (SELECT id FROM public.seasons WHERE is_active = true)
GROUP BY p.display_name
ORDER BY current_gw29_points DESC;

-- ---------------------------------------------------------------------------
-- STEP 2: Delete ALL existing GW29 score_records for all players
-- ---------------------------------------------------------------------------
DELETE FROM public.score_records
WHERE fixture_id IN (
  SELECT id
  FROM public.fixtures
  WHERE gameweek = 29
    AND season_id = (SELECT id FROM public.seasons WHERE is_active = true)
);

-- ---------------------------------------------------------------------------
-- STEP 3: Insert manually-edited aggregate records on the anchor fixture.
--         One row per player = the official GW29 net total.
--         reason_code = 'OUTCOME', manually_edited = true  (matches GW 1-27 pattern)
-- ---------------------------------------------------------------------------
INSERT INTO public.score_records (
  user_id,
  fixture_id,
  predicted_home,
  predicted_away,
  actual_home,
  actual_away,
  is_star_game,
  points_awarded,
  reason_code,
  manually_edited,
  calculated_at
)
VALUES
  -- Anu (A) = 24
  (
    'f22933c4-9b7e-5668-a698-e77df1782020',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 24, 'OUTCOME', true, now()
  ),
  -- Chris (CC) = 14
  (
    'c9456b31-d481-56dd-ba8e-19188636023e',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 14, 'OUTCOME', true, now()
  ),
  -- Cozy (C) = 21
  (
    '0b92a57d-4fc5-5644-b6e3-e503a24797aa',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 21, 'OUTCOME', true, now()
  ),
  -- David (D) = 10
  (
    '90630b39-9de1-5f4b-b471-e6ba6c39f2c0',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 10, 'OUTCOME', true, now()
  ),
  -- Fiyin (F) = 13
  (
    '286af2bd-1c2d-54c3-ba3d-a48a26d2febf',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 13, 'OUTCOME', true, now()
  ),
  -- Deon (GD) = 16
  (
    'ca901b24-393b-5d20-9e96-cd3ea72d02fa',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 16, 'OUTCOME', true, now()
  ),
  -- Kiki (KK) = 7
  (
    'd4551b66-ae87-5e22-b21a-390323b9403c',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 7, 'OUTCOME', true, now()
  ),
  -- Michael (M) = 24
  (
    'e7cda50c-6078-5209-83a6-be99efdceec6',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 24, 'OUTCOME', true, now()
  ),
  -- Nyema (N) = 7  (10 raw − 3 late-penalty = 7 net; net stored so leaderboard total is correct)
  (
    '459958d6-a060-54c1-832a-809677fb0f8c',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 7, 'OUTCOME', true, now()
  ),
  -- Osita (O) = 14
  (
    '4995c0f4-ea7f-5ffe-b835-15e2d2f48ce3',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 14, 'OUTCOME', true, now()
  ),
  -- Okey (OK) = 13
  (
    '8694ba88-e26c-5a22-b822-b06cca31a0d9',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 13, 'OUTCOME', true, now()
  ),
  -- Temmy (T) = 13
  (
    '0b9eda0e-3c42-5e03-9056-219811c3aaba',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 13, 'OUTCOME', true, now()
  ),
  -- Temitayo (TT) = 12
  (
    '202af648-fa48-5497-928a-d8428c8fed15',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 12, 'OUTCOME', true, now()
  ),
  -- Temizack (TZ) = 14
  (
    '9a6a5890-44cd-5081-a6d5-1a62d196ac1c',
    '4f082ef7-7b58-4725-ada4-d54fd7789ad7',
    NULL, NULL, 0, 0, false, 14, 'OUTCOME', true, now()
  );

-- ---------------------------------------------------------------------------
-- STEP 4: Verify — GW29 totals after update
-- ---------------------------------------------------------------------------
SELECT
  p.display_name,
  COALESCE(SUM(sr.points_awarded), 0) AS gw29_points
FROM public.score_records sr
JOIN public.fixtures f     ON f.id = sr.fixture_id
JOIN public.profiles p     ON p.id = sr.user_id
WHERE f.gameweek = 29
  AND f.season_id = (SELECT id FROM public.seasons WHERE is_active = true)
GROUP BY p.display_name
ORDER BY gw29_points DESC;

-- ---------------------------------------------------------------------------
-- STEP 5: Verify — Overall season totals after update
-- ---------------------------------------------------------------------------
SELECT
  p.display_name,
  COALESCE(SUM(sr.points_awarded), 0) AS overall_points
FROM public.score_records sr
JOIN public.fixtures f     ON f.id = sr.fixture_id
JOIN public.profiles p     ON p.id = sr.user_id
WHERE f.season_id = (SELECT id FROM public.seasons WHERE is_active = true)
  AND f.status = 'FINISHED'
GROUP BY p.display_name
ORDER BY overall_points DESC;

-- ---------------------------------------------------------------------------
-- STEP 6: Cross-check against expected overall totals
-- ---------------------------------------------------------------------------
WITH expected (display_name, expected_pts) AS (
  VALUES
    ('Temizack', 655),
    ('Osita',    615),
    ('Deon',     611),
    ('Anu',      611),
    ('Cozy',     610),
    ('Kiki',     595),
    ('Michael',  594),
    ('Fiyin',    589),
    ('Okey',     580),
    ('Chris',    546),
    ('Temitayo', 518),
    ('David',    515),
    ('Temmy',    493),
    ('Nyema',    490)
),
actual AS (
  SELECT
    p.display_name,
    COALESCE(SUM(sr.points_awarded), 0) AS actual_pts
  FROM public.score_records sr
  JOIN public.fixtures f ON f.id = sr.fixture_id
  JOIN public.profiles p ON p.id = sr.user_id
  WHERE f.season_id = (SELECT id FROM public.seasons WHERE is_active = true)
    AND f.status = 'FINISHED'
  GROUP BY p.display_name
)
SELECT
  e.display_name,
  e.expected_pts,
  a.actual_pts,
  CASE WHEN e.expected_pts = a.actual_pts THEN '✅ MATCH' ELSE '❌ MISMATCH' END AS status,
  (a.actual_pts - e.expected_pts) AS delta
FROM expected e
LEFT JOIN actual a ON a.display_name = e.display_name
ORDER BY e.expected_pts DESC;

COMMIT;
