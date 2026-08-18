export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          id: string
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      allowlist: {
        Row: {
          added_by: string | null
          created_at: string
          email: string
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "allowlist_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fixtures: {
        Row: {
          api_fixture_id: number
          away_score: number | null
          away_team: string
          away_team_crest: string | null
          created_at: string
          gameweek: number
          home_score: number | null
          home_team: string
          home_team_crest: string | null
          id: string
          is_star_game: boolean
          kickoff_time: string
          live_away_score: number | null
          live_home_score: number | null
          live_provider_fixture_id: number | null
          manually_overridden: boolean
          match_minute: number | null
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          api_fixture_id: number
          away_score?: number | null
          away_team: string
          away_team_crest?: string | null
          created_at?: string
          gameweek: number
          home_score?: number | null
          home_team: string
          home_team_crest?: string | null
          id?: string
          is_star_game?: boolean
          kickoff_time: string
          live_away_score?: number | null
          live_home_score?: number | null
          live_provider_fixture_id?: number | null
          manually_overridden?: boolean
          match_minute?: number | null
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          api_fixture_id?: number
          away_score?: number | null
          away_team?: string
          away_team_crest?: string | null
          created_at?: string
          gameweek?: number
          home_score?: number | null
          home_team?: string
          home_team_crest?: string | null
          id?: string
          is_star_game?: boolean
          kickoff_time?: string
          live_away_score?: number | null
          live_home_score?: number | null
          live_provider_fixture_id?: number | null
          manually_overridden?: boolean
          match_minute?: number | null
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fixtures_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      gameweek_deadlines: {
        Row: {
          id: string
          season_id: string
          gameweek: number
          deadline: string
          set_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          season_id: string
          gameweek: number
          deadline: string
          set_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          season_id?: string
          gameweek?: number
          deadline?: string
          set_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gameweek_deadlines_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gameweek_deadlines_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          away_score: number
          fixture_id: string
          home_score: number
          id: string
          submitted_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          away_score: number
          fixture_id: string
          home_score: number
          id?: string
          submitted_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          away_score?: number
          fixture_id?: string
          home_score?: number
          id?: string
          submitted_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          featured_badges: string[]
          force_password_change: boolean
          id: string
          is_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          featured_badges?: string[]
          force_password_change?: boolean
          id: string
          is_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          featured_badges?: string[]
          force_password_change?: boolean
          id?: string
          is_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      score_records: {
        Row: {
          actual_away: number
          actual_home: number
          calculated_at: string
          fixture_id: string
          id: string
          is_star_game: boolean
          manually_edited: boolean
          points_awarded: number
          predicted_away: number | null
          predicted_home: number | null
          reason_code: string
          user_id: string
        }
        Insert: {
          actual_away: number
          actual_home: number
          calculated_at?: string
          fixture_id: string
          id?: string
          is_star_game?: boolean
          manually_edited?: boolean
          points_awarded?: number
          predicted_away?: number | null
          predicted_home?: number | null
          reason_code: string
          user_id: string
        }
        Update: {
          actual_away?: number
          actual_home?: number
          calculated_at?: string
          fixture_id?: string
          id?: string
          is_star_game?: boolean
          manually_edited?: boolean
          points_awarded?: number
          predicted_away?: number | null
          predicted_home?: number | null
          reason_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_records_fixture_id_fkey"
            columns: ["fixture_id"]
            isOneToOne: false
            referencedRelation: "fixtures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      seasons: {
        Row: {
          created_at: string
          end_date: string | null
          id: string
          is_active: boolean
          name: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: string
          is_active?: boolean
          name?: string
          start_date?: string | null
        }
        Relationships: []
      }
      sync_log: {
        Row: {
          api_calls_made: number
          created_at: string
          duration_ms: number
          error_message: string | null
          fixtures_updated: number
          id: string
          mode: string
          ran_at: string
          scores_calculated: number
          status: string
        }
        Insert: {
          api_calls_made?: number
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          fixtures_updated?: number
          id?: string
          mode: string
          ran_at?: string
          scores_calculated?: number
          status: string
        }
        Update: {
          api_calls_made?: number
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          fixtures_updated?: number
          id?: string
          mode?: string
          ran_at?: string
          scores_calculated?: number
          status?: string
        }
        Relationships: []
      }
      star_man_nominees: {
        Row: {
          created_at: string
          id: string
          player_name: string
          session_id: string
          team_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_name: string
          session_id: string
          team_name: string
        }
        Update: {
          created_at?: string
          id?: string
          player_name?: string
          session_id?: string
          team_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "star_man_nominees_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "star_man_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      star_man_sessions: {
        Row: {
          created_at: string
          deadline: string
          id: string
          season_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline: string
          id?: string
          season_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline?: string
          id?: string
          season_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "star_man_sessions_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: true
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      star_man_votes: {
        Row: {
          id: string
          nominee_id: string
          session_id: string
          user_id: string
          voted_at: string
        }
        Insert: {
          id?: string
          nominee_id: string
          session_id: string
          user_id: string
          voted_at?: string
        }
        Update: {
          id?: string
          nominee_id?: string
          session_id?: string
          user_id?: string
          voted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "star_man_votes_nominee_id_fkey"
            columns: ["nominee_id"]
            isOneToOne: false
            referencedRelation: "star_man_nominees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "star_man_votes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "star_man_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "star_man_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          id: string
          user_id: string
          badge_id: string
          earned_at: string
          season_id: string | null
          metadata: Json
        }
        Insert: {
          id?: string
          user_id: string
          badge_id: string
          earned_at?: string
          season_id?: string | null
          metadata?: Json
        }
        Update: {
          id?: string
          user_id?: string
          badge_id?: string
          earned_at?: string
          season_id?: string | null
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_bonuses: {
        Row: {
          id: string
          user_id: string
          season_id: string
          month: string
          eligible: boolean
          bonus_points: number
          fixtures_total: number
          predictions_total: number
          on_time_predictions: number
          calculated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          season_id: string
          month: string
          eligible: boolean
          bonus_points?: number
          fixtures_total: number
          predictions_total: number
          on_time_predictions?: number
          calculated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          season_id?: string
          month?: string
          eligible?: boolean
          bonus_points?: number
          fixtures_total?: number
          predictions_total?: number
          on_time_predictions?: number
          calculated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_bonuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_bonuses_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_fixture_scores: {
        Args: { p_fixture_id: string }
        Returns: number
      }
      calculate_monthly_bonus: {
        Args: { p_month: string; p_season_id: string }
        Returns: number
      }
      get_gameweek_leaderboard: {
        Args: { p_gameweek: number; p_season_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          exact_count: number
          gameweek_points: number
          outcome_count: number
          rank: number
          user_id: string
        }[]
      }
      get_monthly_leaderboard: {
        Args: { p_month: string; p_season_id: string }
        Returns: {
          avatar_url: string
          bonus_eligible: boolean
          bonus_points: number
          display_name: string
          exact_count: number
          fixtures_missed: number
          monthly_points: number
          on_time_predictions: number
          outcome_count: number
          rank: number
          total_monthly: number
          user_id: string
        }[]
      }
      get_season_leaderboard: {
        Args: { p_season_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          exact_count: number
          outcome_count: number
          rank: number
          total_points: number
          user_id: string
          zero_count: number
        }[]
      }
      get_star_man_results: {
        Args: { p_session_id: string }
        Returns: {
          nominee_id: string
          player_name: string
          rank: number
          team_name: string
          vote_count: number
        }[]
      }
      count_user_badges: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_gameweek_deadline: {
        Args: { p_season_id: string; p_gameweek: number }
        Returns: string | null
      }
      get_gameweek_first_kickoff: {
        Args: { p_season_id: string; p_gameweek: number }
        Returns: string | null
      }
      has_user_predicted_in_gameweek: {
        Args: { p_season_id: string; p_gameweek: number }
        Returns: boolean
      }
      can_view_gameweek_predictions: {
        Args: {
          p_viewer_id: string
          p_target_user_id: string
          p_season_id: string
          p_gameweek: number
        }
        Returns: boolean
      }
      get_gameweek_predictions_with_visibility: {
        Args: {
          p_viewer_id: string
          p_season_id: string
          p_gameweek: number
        }
        Returns: {
          fixture_id: string
          user_id: string
          display_name: string
          avatar_url: string | null
          home_score: number | null
          away_score: number | null
          submitted_at: string
          can_view: boolean
          is_own: boolean
          points_awarded: number | null
          reason_code: string | null
          visibility: string
          first_kickoff: string | null
          viewer_has_predicted: boolean
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_fixture_kicked_off: { Args: { p_fixture_id: string }; Returns: boolean }
      is_fixture_open: { Args: { p_fixture_id: string }; Returns: boolean }
      is_star_game_voting_open: {
        Args: { p_session_id: string }
        Returns: boolean
      }
      is_voting_open: { Args: { p_session_id: string }; Returns: boolean }
      prune_sync_log: { Args: Record<string, never>; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
