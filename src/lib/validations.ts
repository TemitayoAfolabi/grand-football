import { z } from 'zod';

/** Prediction score validation */
export const predictionSchema = z.object({
  fixtureId: z.string().uuid('Invalid fixture ID'),
  homeScore: z
    .number()
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative')
    .max(99, 'Score cannot exceed 99'),
  awayScore: z
    .number()
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative')
    .max(99, 'Score cannot exceed 99'),
});

export type PredictionInput = z.infer<typeof predictionSchema>;

/** Display name validation */
export const displayNameSchema = z.object({
  displayName: z
    .string()
    .min(3, 'Display name must be at least 3 characters')
    .max(20, 'Display name cannot exceed 20 characters')
    .trim(),
});

export type DisplayNameInput = z.infer<typeof displayNameSchema>;

/** Email validation */
export const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform((v) => v.toLowerCase()),
});

export type EmailInput = z.infer<typeof emailSchema>;

/** Password validation */
export const passwordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
});

export type PasswordInput = z.infer<typeof passwordSchema>;

/** Login validation */
export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Change password validation */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(72, 'New password cannot exceed 72 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your new password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Set password validation (from invite/recovery link) */
export const setPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password cannot exceed 72 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** Admin create user validation */
export const adminCreateUserSchema = z.object({
  email: z.string().email('Please enter a valid email address').transform((v) => v.toLowerCase().trim()),
  displayName: z
    .string()
    .min(3, 'Display name must be at least 3 characters')
    .max(20, 'Display name cannot exceed 20 characters')
    .trim()
    .optional()
    .or(z.literal('')),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/** Score override validation */
export const overrideSchema = z.object({
  fixtureId: z.string().uuid('Invalid fixture ID'),
  homeScore: z
    .number()
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative')
    .max(99, 'Score cannot exceed 99'),
  awayScore: z
    .number()
    .int('Score must be a whole number')
    .min(0, 'Score cannot be negative')
    .max(99, 'Score cannot exceed 99'),
});

export type OverrideInput = z.infer<typeof overrideSchema>;

/** Season name validation */
export const seasonSchema = z.object({
  name: z
    .string()
    .min(1, 'Season name is required')
    .max(50, 'Season name is too long'),
});

export type SeasonInput = z.infer<typeof seasonSchema>;

/** Star Man: create voting session */
export const createStarManSessionSchema = z.object({
  seasonId: z.string().uuid('Invalid season ID'),
});

export type CreateStarManSessionInput = z.infer<typeof createStarManSessionSchema>;

/** Star Man: add nominee */
export const addStarManNomineeSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  playerName: z
    .string()
    .min(1, 'Player name is required')
    .max(50, 'Player name cannot exceed 50 characters')
    .trim(),
  teamName: z
    .string()
    .min(1, 'Team name is required')
    .max(50, 'Team name cannot exceed 50 characters')
    .trim(),
});

export type AddStarManNomineeInput = z.infer<typeof addStarManNomineeSchema>;

/** Star Man: cast vote */
export const castStarManVoteSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  nomineeId: z.string().uuid('Invalid nominee ID'),
});

export type CastStarManVoteInput = z.infer<typeof castStarManVoteSchema>;

/** Star Game Voting: create session */
export const createStarGameVoteSessionSchema = z.object({
  gameweek: z.number().int('Gameweek must be a whole number').min(1, 'Gameweek must be at least 1').max(50, 'Gameweek cannot exceed 50'),
});

export type CreateStarGameVoteSessionInput = z.infer<typeof createStarGameVoteSessionSchema>;

/** Star Game Voting: session ID */
export const starGameSessionIdSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
});

export type StarGameSessionIdInput = z.infer<typeof starGameSessionIdSchema>;

/** Star Game Voting: cast votes (2 fixtures) */
export const castStarGameVotesSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  fixtureId1: z.string().uuid('Invalid fixture ID'),
  fixtureId2: z.string().uuid('Invalid fixture ID'),
}).refine((data) => data.fixtureId1 !== data.fixtureId2, {
  message: 'You must select two different fixtures',
  path: ['fixtureId2'],
});

export type CastStarGameVotesInput = z.infer<typeof castStarGameVotesSchema>;

/** Star Game Voting: admin override star games */
export const overrideStarGamesSchema = z.object({
  sessionId: z.string().uuid('Invalid session ID'),
  fixtureId1: z.string().uuid('Invalid fixture ID'),
  fixtureId2: z.string().uuid('Invalid fixture ID'),
}).refine((data) => data.fixtureId1 !== data.fixtureId2, {
  message: 'Must select two different fixtures',
  path: ['fixtureId2'],
});

export type OverrideStarGamesInput = z.infer<typeof overrideStarGamesSchema>;

/** Admin: edit score record */
export const editScoreRecordSchema = z.object({
  scoreRecordId: z.string().uuid('Invalid score record ID'),
  newPoints: z
    .number()
    .int('Points must be a whole number')
    .min(0, 'Points cannot be negative')
    .max(20, 'Points cannot exceed 20'),
  reason: z
    .string()
    .min(3, 'Reason must be at least 3 characters')
    .max(200, 'Reason cannot exceed 200 characters')
    .trim(),
});

export type EditScoreRecordInput = z.infer<typeof editScoreRecordSchema>;

/** Star Game Voting: admin manual pick */
export const manualStarGamePickSchema = z.object({
  gameweek: z.number().int().min(1).max(50),
  fixtureId1: z.string().uuid('Invalid fixture ID'),
  fixtureId2: z.string().uuid('Invalid fixture ID'),
}).refine((data) => data.fixtureId1 !== data.fixtureId2, {
  message: 'Must select two different fixtures',
  path: ['fixtureId2'],
});

export type ManualStarGamePickInput = z.infer<typeof manualStarGamePickSchema>;

/** Admin: move fixture to a different gameweek */
export const moveFixtureGameweekSchema = z.object({
  fixtureId: z.string().uuid('Invalid fixture ID'),
  targetGameweek: z
    .number()
    .int('Gameweek must be a whole number')
    .min(1, 'Gameweek must be at least 1')
    .max(50, 'Gameweek cannot exceed 50'),
  newStatus: z.enum(['SCHEDULED', 'TIMED', 'POSTPONED']).optional(),
  newKickoffTime: z.string().min(1).optional(),
});

export type MoveFixtureGameweekInput = z.infer<typeof moveFixtureGameweekSchema>;

/** Admin: set fixture status to POSTPONED or CANCELLED */
export const setFixtureStatusSchema = z.object({
  fixtureId: z.string().uuid('Invalid fixture ID'),
  status: z.enum(['POSTPONED', 'CANCELLED']),
});

export type SetFixtureStatusInput = z.infer<typeof setFixtureStatusSchema>;
