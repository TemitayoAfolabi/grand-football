-- ============================================================================
-- Grand Football — Drop Unused Tables
-- Migration: 00004_drop_unused_tables.sql
-- Created: 2026-02-27
-- Description: Remove unused/empty tables from old star-games feature and
--              unused prediction_history and monthly_bonuses tables.
-- ============================================================================

-- Drop in dependency order (child tables first)
DROP TABLE IF EXISTS public.star_game_votes CASCADE;
DROP TABLE IF EXISTS public.star_game_vote_sessions CASCADE;
DROP TABLE IF EXISTS public.prediction_history CASCADE;
DROP TABLE IF EXISTS public.monthly_bonuses CASCADE;

-- Drop orphan RPC function from old star-games feature
DROP FUNCTION IF EXISTS public.get_star_game_vote_results(uuid);
