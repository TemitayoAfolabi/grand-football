export type MiniLeagueActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

export const initialMiniLeagueActionState: MiniLeagueActionState = {
  status: 'idle',
  message: '',
};
