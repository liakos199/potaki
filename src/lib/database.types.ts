export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      bar_exceptions: {
        Row: {
          bar_id: string
          close_time: string | null
          closes_next_day: boolean | null
          created_at: string
          exception_date: string
          id: string
          is_closed: boolean
          open_time: string | null
          updated_at: string
        }
        Insert: {
          bar_id: string
          close_time?: string | null
          closes_next_day?: boolean | null
          created_at?: string
          exception_date: string
          id?: string
          is_closed?: boolean
          open_time?: string | null
          updated_at?: string
        }
        Update: {
          bar_id?: string
          close_time?: string | null
          closes_next_day?: boolean | null
          created_at?: string
          exception_date?: string
          id?: string
          is_closed?: boolean
          open_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bar_exceptions_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      bars: {
        Row: {
          address: string
          created_at: string
          description: string | null
          id: string
          live: boolean
          location: unknown
          name: string
          owner_id: string
          phone: string | null
          reservation_hold_until: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address: string
          created_at?: string
          description?: string | null
          id?: string
          live?: boolean
          location: unknown
          name: string
          owner_id: string
          phone?: string | null
          reservation_hold_until?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string
          created_at?: string
          description?: string | null
          id?: string
          live?: boolean
          location?: unknown
          name?: string
          owner_id?: string
          phone?: string | null
          reservation_hold_until?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bars_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      drink_options: {
        Row: {
          bar_id: string
          created_at: string
          id: string
          name: string | null
          price: number
          type: Database["public"]["Enums"]["drink_option_type"]
          updated_at: string
        }
        Insert: {
          bar_id: string
          created_at?: string
          id?: string
          name?: string | null
          price: number
          type: Database["public"]["Enums"]["drink_option_type"]
          updated_at?: string
        }
        Update: {
          bar_id?: string
          created_at?: string
          id?: string
          name?: string | null
          price?: number
          type?: Database["public"]["Enums"]["drink_option_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drink_options_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_hours: {
        Row: {
          bar_id: string
          close_time: string
          closes_next_day: boolean
          day_of_week: Database["public"]["Enums"]["day_of_week_enum"]
          id: string
          open_time: string
        }
        Insert: {
          bar_id: string
          close_time: string
          closes_next_day?: boolean
          day_of_week: Database["public"]["Enums"]["day_of_week_enum"]
          id?: string
          open_time: string
        }
        Update: {
          bar_id?: string
          close_time?: string
          closes_next_day?: boolean
          day_of_week?: Database["public"]["Enums"]["day_of_week_enum"]
          id?: string
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "operating_hours_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservation_drinks: {
        Row: {
          created_at: string
          drink_option_id: string | null
          id: string
          price_at_booking: number
          quantity: number
          reservation_id: string
        }
        Insert: {
          created_at?: string
          drink_option_id?: string | null
          id?: string
          price_at_booking: number
          quantity: number
          reservation_id: string
        }
        Update: {
          created_at?: string
          drink_option_id?: string | null
          id?: string
          price_at_booking?: number
          quantity?: number
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_drinks_drink_option_id_fkey"
            columns: ["drink_option_id"]
            isOneToOne: false
            referencedRelation: "drink_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_drinks_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          bar_id: string
          checked_in_at: string | null
          created_at: string
          customer_id: string
          id: string
          party_size: number
          reservation_date: string
          seat_option_id: string
          special_requests: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          updated_at: string
        }
        Insert: {
          bar_id: string
          checked_in_at?: string | null
          created_at?: string
          customer_id: string
          id?: string
          party_size: number
          reservation_date: string
          seat_option_id: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Update: {
          bar_id?: string
          checked_in_at?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          party_size?: number
          reservation_date?: string
          seat_option_id?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_seat_option_id_fkey"
            columns: ["seat_option_id"]
            isOneToOne: false
            referencedRelation: "seat_options"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_options: {
        Row: {
          available_count: number
          bar_id: string
          enabled: boolean
          id: string
          max_people: number
          min_people: number
          type: Database["public"]["Enums"]["seat_option_type"]
        }
        Insert: {
          available_count: number
          bar_id: string
          enabled?: boolean
          id?: string
          max_people: number
          min_people: number
          type: Database["public"]["Enums"]["seat_option_type"]
        }
        Update: {
          available_count?: number
          bar_id?: string
          enabled?: boolean
          id?: string
          max_people?: number
          min_people?: number
          type?: Database["public"]["Enums"]["seat_option_type"]
        }
        Relationships: [
          {
            foreignKeyName: "seat_options_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_assignments: {
        Row: {
          assigned_by_owner_id: string
          bar_id: string
          created_at: string
          id: string
          staff_user_id: string
        }
        Insert: {
          assigned_by_owner_id: string
          bar_id: string
          created_at?: string
          id?: string
          staff_user_id: string
        }
        Update: {
          assigned_by_owner_id?: string
          bar_id?: string
          created_at?: string
          id?: string
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_assignments_assigned_by_owner_id_fkey"
            columns: ["assigned_by_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_bar_id_fkey"
            columns: ["bar_id"]
            isOneToOne: false
            referencedRelation: "bars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_assignments_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      demote_staff: {
        Args: { target_user_id: string; bar_id: string }
        Returns: undefined
      }
      promote_to_staff: {
        Args: { target_user_id: string; assigned_bar_id: string }
        Returns: undefined
      }
    }
    Enums: {
      day_of_week_enum: "1" | "2" | "3" | "4" | "5" | "6" | "7"
      drink_option_type: "single-drink" | "bottle"
      reservation_status: "confirmed" | "cancelled" | "completed" | "no_show"
      seat_option_type: "bar" | "table" | "vip"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      day_of_week_enum: ["1", "2", "3", "4", "5", "6", "7"],
      drink_option_type: ["single-drink", "bottle"],
      reservation_status: ["confirmed", "cancelled", "completed", "no_show"],
      seat_option_type: ["bar", "table", "vip"],
    },
  },
} as const
