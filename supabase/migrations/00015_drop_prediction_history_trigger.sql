-- ============================================================================
-- Grand Football — Drop Orphaned Prediction History Trigger
-- Migration: 00015_drop_prediction_history_trigger.sql
-- Created: 2026-03-03
-- Description: Migration 00004 dropped the prediction_history table but left
--              the trigger and function that insert into it. Every prediction
--              update fires the trigger and fails with:
--              "relation public.prediction_history does not exist"
--              This migration removes the orphaned trigger and function.
-- ============================================================================

-- 1. Drop the trigger on predictions
DROP TRIGGER IF EXISTS on_prediction_updated ON public.predictions;

-- 2. Drop the function that references the dropped table
DROP FUNCTION IF EXISTS public.handle_prediction_update();
