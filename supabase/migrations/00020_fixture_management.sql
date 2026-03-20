-- ============================================================================
-- Grand Football — Admin Fixture Gameweek Management
-- Migration: 00020_fixture_management.sql
-- Created: 2026-03-20
-- Description: Extends the admin_audit_log CHECK constraint to include the
--   new fixture management actions (MOVE_FIXTURE_GAMEWEEK, SET_FIXTURE_STATUS)
--   and also backfills missing actions that are already used in the codebase
--   but were not included in previous constraint definitions
--   (CREATE_USER, RESET_USER_PASSWORD, RESEND_INVITE,
--    SET_GAMEWEEK_DEADLINE, CLEAR_GAMEWEEK_DEADLINE).
-- ============================================================================

ALTER TABLE public.admin_audit_log
  DROP CONSTRAINT IF EXISTS admin_audit_log_action_check;

ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_action_check
  CHECK (action IN (
    -- Core fixture / scoring actions (originally from 00001 / 00006)
    'TOGGLE_STAR',
    'OVERRIDE_RESULT',
    'RECALCULATE',
    -- User management (originally from 00001; CREATE_USER etc. added in 00009)
    'ADD_USER',
    'REMOVE_USER',
    'CREATE_USER',
    'RESET_USER_PASSWORD',
    'RESEND_INVITE',
    -- Season management
    'NEW_SEASON',
    -- Star Man voting (originally from 00002)
    'CREATE_STAR_MAN_SESSION',
    'ADD_STAR_MAN_NOMINEE',
    'REMOVE_STAR_MAN_NOMINEE',
    'OPEN_STAR_MAN_VOTING',
    'CLOSE_STAR_MAN_VOTING',
    -- Score record editing (originally from 00006)
    'EDIT_SCORE_RECORD',
    -- Gameweek deadline management (added in 00012, backfilled here)
    'SET_GAMEWEEK_DEADLINE',
    'CLEAR_GAMEWEEK_DEADLINE',
    -- Fixture gameweek management (new in this migration)
    'MOVE_FIXTURE_GAMEWEEK',
    'SET_FIXTURE_STATUS'
  ));
