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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      quiz_rooms: {
        Row: {
          buzzer_winner: string | null
          created_at: string
          current_question_index: number
          phase: string
          quiz: Json | null
          room_code: string
          scores: Json
          state: Json | null
          timer_seconds_left: number
          updated_at: string
        }
        Insert: {
          buzzer_winner?: string | null
          created_at?: string
          current_question_index?: number
          phase?: string
          quiz?: Json | null
          room_code: string
          scores?: Json
          state?: Json | null
          timer_seconds_left?: number
          updated_at?: string
        }
        Update: {
          buzzer_winner?: string | null
          created_at?: string
          current_question_index?: number
          phase?: string
          quiz?: Json | null
          room_code?: string
          scores?: Json
          state?: Json | null
          timer_seconds_left?: number
          updated_at?: string
        }
        Relationships: []
      }
      room_answers: {
        Row: {
          answer: Json
          created_at: string
          id: string
          question_index: number
          room_code: string
          team_id: string
        }
        Insert: {
          answer: Json
          created_at?: string
          id?: string
          question_index: number
          room_code: string
          team_id: string
        }
        Update: {
          answer?: Json
          created_at?: string
          id?: string
          question_index?: number
          room_code?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_answers_room_code_fkey"
            columns: ["room_code"]
            isOneToOne: false
            referencedRelation: "quiz_rooms"
            referencedColumns: ["room_code"]
          },
          {
            foreignKeyName: "room_answers_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "room_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      room_teams: {
        Row: {
          created_at: string
          id: string
          name: string
          room_code: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          room_code: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          room_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_teams_room_code_fkey"
            columns: ["room_code"]
            isOneToOne: false
            referencedRelation: "quiz_rooms"
            referencedColumns: ["room_code"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_room: {
        Args: { _room: string }
        Returns: {
          buzzer_winner: string
          current_question_index: number
          phase: string
          quiz: Json
          room_code: string
          state: Json
        }[]
      }
      get_room_answers: {
        Args: { _question: number; _room: string }
        Returns: {
          answer: Json
          created_at: string
          team_id: string
        }[]
      }
      get_room_teams: {
        Args: { _room: string }
        Returns: {
          id: string
          name: string
        }[]
      }
      join_room: { Args: { _name: string; _room: string }; Returns: string }
      press_buzzer: { Args: { _room: string; _team: string }; Returns: string }
      submit_answer: {
        Args: { _answer: Json; _question: number; _room: string; _team: string }
        Returns: boolean
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
