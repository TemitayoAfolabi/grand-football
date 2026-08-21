export type MiniLeagueActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export const initialMiniLeagueActionState: MiniLeagueActionState = {
  status: 'idle',
  message: '',
};

export type ScorerPickActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export const initialScorerPickActionState: ScorerPickActionState = {
  status: 'idle',
  message: '',
};
