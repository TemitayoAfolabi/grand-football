// =============================================================================
// Badge Definitions — The complete badge catalog
// =============================================================================

export type BadgeTier = 'common' | 'rare' | 'epic' | 'legendary';

export type BadgeTrigger =
  | 'fixture_scored'
  | 'gameweek_complete'
  | 'prediction_submitted'
  | 'star_man_vote'
  | 'season_end'
  | 'monthly_bonus'
  | 'manual';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  tier: BadgeTier;
  icon: string; // emoji used as badge icon
  triggers: BadgeTrigger[];
  /** Whether the badge is per-season or career-wide */
  seasonal: boolean;
}

// ---------------------------------------------------------------------------
// Tier metadata (colors, labels)
// ---------------------------------------------------------------------------
export const TIER_CONFIG: Record<
  BadgeTier,
  { label: string; color: string; glowClass: string; bgClass: string; borderClass: string }
> = {
  common: {
    label: 'Common',
    color: 'text-success',
    glowClass: 'shadow-[0_0_12px_rgba(34,197,94,0.3)]',
    bgClass: 'bg-success-muted',
    borderClass: 'border-success/30',
  },
  rare: {
    label: 'Rare',
    color: 'text-info',
    glowClass: 'shadow-[0_0_12px_rgba(59,130,246,0.3)]',
    bgClass: 'bg-info-muted',
    borderClass: 'border-info/30',
  },
  epic: {
    label: 'Epic',
    color: 'text-[#A855F7]',
    glowClass: 'shadow-[0_0_16px_rgba(168,85,247,0.35)]',
    bgClass: 'bg-[rgba(168,85,247,0.15)]',
    borderClass: 'border-[rgba(168,85,247,0.3)]',
  },
  legendary: {
    label: 'Legendary',
    color: 'text-gold',
    glowClass: 'shadow-[0_0_20px_rgba(245,197,24,0.4)]',
    bgClass: 'bg-gold-muted',
    borderClass: 'border-gold/30',
  },
};

// ---------------------------------------------------------------------------
// Badge catalog
// ---------------------------------------------------------------------------
export const BADGES: BadgeDefinition[] = [
  // ===== COMMON =====
  {
    id: 'first_blood',
    name: 'First Blood',
    description: 'Get your first exact score prediction correct',
    tier: 'common',
    icon: '🎯',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'good_eye',
    name: 'Good Eye',
    description: 'Get your first correct outcome prediction',
    tier: 'common',
    icon: '👁️',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'committed',
    name: 'Committed',
    description: 'Submit predictions for 5 complete gameweeks',
    tier: 'common',
    icon: '📋',
    triggers: ['prediction_submitted'],
    seasonal: true,
  },
  {
    id: 'podium_finish',
    name: 'Podium Finish',
    description: 'Finish top 3 in any gameweek',
    tier: 'common',
    icon: '🏅',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'star_voter',
    name: 'Star Voter',
    description: 'Cast your first Star Man vote',
    tier: 'common',
    icon: '⭐',
    triggers: ['star_man_vote'],
    seasonal: false,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    description: 'Submit all predictions 24+ hours before kickoff',
    tier: 'common',
    icon: '🐦',
    triggers: ['prediction_submitted'],
    seasonal: true,
  },
  {
    id: 'double_up',
    name: 'Double Up',
    description: 'Get 2 exact scores in a single gameweek',
    tier: 'common',
    icon: '✌️',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },

  // ===== RARE =====
  {
    id: 'sniper',
    name: 'Sniper',
    description: 'Reach 10 correct exact score predictions (career)',
    tier: 'rare',
    icon: '🔫',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'on_fire',
    name: 'On Fire',
    description: '3-gameweek streak of top-half finishes',
    tier: 'rare',
    icon: '🔥',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'iron_will',
    name: 'Iron Will',
    description: 'Predict every single fixture in a calendar month',
    tier: 'rare',
    icon: '🛡️',
    triggers: ['monthly_bonus'],
    seasonal: true,
  },
  {
    id: 'gameweek_champion',
    name: 'GW Champion',
    description: 'Finish #1 in any gameweek',
    tier: 'rare',
    icon: '👑',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'nil_nil_oracle',
    name: '0-0 Oracle',
    description: 'Correctly predict a 0-0 draw',
    tier: 'rare',
    icon: '🔮',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'star_game_ace',
    name: 'Star Game Ace',
    description: 'Get an exact score on a star game fixture',
    tier: 'rare',
    icon: '💫',
    triggers: ['fixture_scored'],
    seasonal: true,
  },
  {
    id: 'hat_trick',
    name: 'Hat Trick',
    description: '3 exact scores in one gameweek',
    tier: 'rare',
    icon: '🎩',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'century',
    name: 'Century',
    description: 'Reach 100 total points in a season',
    tier: 'rare',
    icon: '💯',
    triggers: ['fixture_scored'],
    seasonal: true,
  },

  // ===== EPIC =====
  {
    id: 'oracle',
    name: 'Oracle',
    description: 'Reach 25 correct exact score predictions (career)',
    tier: 'epic',
    icon: '🧙',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'unstoppable',
    name: 'Unstoppable',
    description: '5-gameweek streak of top-half finishes',
    tier: 'epic',
    icon: '⚡',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'perfect_gameweek',
    name: 'Perfect GW',
    description: 'Get every prediction right in a gameweek (all correct outcomes)',
    tier: 'epic',
    icon: '✨',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'serial_winner',
    name: 'Serial Winner',
    description: 'Win 3 different gameweeks in a single season',
    tier: 'epic',
    icon: '🥇',
    triggers: ['gameweek_complete'],
    seasonal: true,
  },
  {
    id: 'the_underdog',
    name: 'The Underdog',
    description: 'Correctly predict a result where the away team wins',
    tier: 'epic',
    icon: '🐕',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'bonus_hunter',
    name: 'Bonus Hunter',
    description: 'Earn the monthly bonus 3 months in a row',
    tier: 'epic',
    icon: '🎰',
    triggers: ['monthly_bonus'],
    seasonal: true,
  },

  // ===== LEGENDARY =====
  {
    id: 'psychic',
    name: 'Psychic',
    description: 'Reach 50 correct exact score predictions (career)',
    tier: 'legendary',
    icon: '🧠',
    triggers: ['fixture_scored'],
    seasonal: false,
  },
  {
    id: 'season_champion',
    name: 'Season Champ',
    description: 'Win the overall season standings',
    tier: 'legendary',
    icon: '🏆',
    triggers: ['season_end'],
    seasonal: true,
  },
  {
    id: 'grand_master',
    name: 'Grand Master',
    description: 'Earn 20 or more different badges',
    tier: 'legendary',
    icon: '🎖️',
    triggers: ['fixture_scored', 'gameweek_complete', 'prediction_submitted', 'star_man_vote', 'season_end', 'monthly_bonus'],
    seasonal: false,
  },
  {
    id: 'invincible',
    name: 'Invincible',
    description: 'Never finish in the bottom half for an entire season',
    tier: 'legendary',
    icon: '💎',
    triggers: ['season_end'],
    seasonal: true,
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------
export const BADGE_MAP = new Map(BADGES.map((b) => [b.id, b]));

export function getBadge(id: string): BadgeDefinition | undefined {
  return BADGE_MAP.get(id);
}

export function getBadgesByTier(tier: BadgeTier): BadgeDefinition[] {
  return BADGES.filter((b) => b.tier === tier);
}

export function getBadgesByTrigger(trigger: BadgeTrigger): BadgeDefinition[] {
  return BADGES.filter((b) => b.triggers.includes(trigger));
}
