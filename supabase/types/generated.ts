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
  public: {
    Tables: {
      happy_hour_offers: {
        Row: {
          category: string
          created_at: string
          description: string
          id: string
          status: string
          title: string | null
          updated_at: string
          venue_id: string
          window_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          venue_id: string
          window_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          id?: string
          status?: string
          title?: string | null
          updated_at?: string
          venue_id?: string
          window_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_offers_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offers_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offers_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offers_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows_with_names"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_hour_places: {
        Row: {
          address: string | null
          average_price: number | null
          business_url: string | null
          created_at: string
          cuisine_type: string | null
          deal_description: string | null
          distance_miles: number | null
          end_time: string | null
          happy_days: string[]
          id: number
          last_confirmed_at: string | null
          name: string
          neighborhood: string | null
          opening_hours: string | null
          org_name: string | null
          org_slug: string | null
          phone: string | null
          rating: number | null
          start_time: string | null
          status: string
          updated_at: string
          venue_city: string | null
          venue_name: string | null
          venue_state: string | null
          venue_zip: number | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          average_price?: number | null
          business_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          deal_description?: string | null
          distance_miles?: number | null
          end_time?: string | null
          happy_days?: string[]
          id?: number
          last_confirmed_at?: string | null
          name: string
          neighborhood?: string | null
          opening_hours?: string | null
          org_name?: string | null
          org_slug?: string | null
          phone?: string | null
          rating?: number | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue_city?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: number | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          average_price?: number | null
          business_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          deal_description?: string | null
          distance_miles?: number | null
          end_time?: string | null
          happy_days?: string[]
          id?: number
          last_confirmed_at?: string | null
          name?: string
          neighborhood?: string | null
          opening_hours?: string | null
          org_name?: string | null
          org_slug?: string | null
          phone?: string | null
          rating?: number | null
          start_time?: string | null
          status?: string
          updated_at?: string
          venue_city?: string | null
          venue_name?: string | null
          venue_state?: string | null
          venue_zip?: number | null
          website_url?: string | null
        }
        Relationships: []
      }
      happy_hour_window_menus: {
        Row: {
          created_at: string
          happy_hour_window_id: string
          menu_id: string
        }
        Insert: {
          created_at?: string
          happy_hour_window_id: string
          menu_id: string
        }
        Update: {
          created_at?: string
          happy_hour_window_id?: string
          menu_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_window_menus_happy_hour_window_id_fkey"
            columns: ["happy_hour_window_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_window_menus_happy_hour_window_id_fkey"
            columns: ["happy_hour_window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_window_menus_happy_hour_window_id_fkey"
            columns: ["happy_hour_window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows_with_names"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_window_menus_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_hour_windows: {
        Row: {
          created_at: string
          dow: number[]
          end_time: string
          id: string
          label: string | null
          last_confirmed_at: string | null
          restaurant_id: string | null
          start_time: string
          status: string
          timezone: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          dow?: number[]
          end_time: string
          id?: string
          label?: string | null
          last_confirmed_at?: string | null
          restaurant_id?: string | null
          start_time: string
          status?: string
          timezone?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          dow?: number[]
          end_time?: string
          id?: string
          label?: string | null
          last_confirmed_at?: string | null
          restaurant_id?: string | null
          start_time?: string
          status?: string
          timezone?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_happy_hour: boolean
          name: string
          price: number | null
          section_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_happy_hour?: boolean
          name: string
          price?: number | null
          section_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_happy_hour?: boolean
          name?: string
          price?: number | null
          section_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "menu_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_sections: {
        Row: {
          created_at: string
          id: string
          menu_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_sections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          status: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          status?: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          status?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notion_venue_import: {
        Row: {
          Address: string | null
          "Business URL": string | null
          "Happy Hour Category": string | null
          "Happy Hour Details": string | null
          Name: string | null
          "Opening Hours": string | null
          "Phone Number": string | null
          Rating: number | null
          "Website URL": string | null
        }
        Insert: {
          Address?: string | null
          "Business URL"?: string | null
          "Happy Hour Category"?: string | null
          "Happy Hour Details"?: string | null
          Name?: string | null
          "Opening Hours"?: string | null
          "Phone Number"?: string | null
          Rating?: number | null
          "Website URL"?: string | null
        }
        Update: {
          Address?: string | null
          "Business URL"?: string | null
          "Happy Hour Category"?: string | null
          "Happy Hour Details"?: string | null
          Name?: string | null
          "Opening Hours"?: string | null
          "Phone Number"?: string | null
          Rating?: number | null
          "Website URL"?: string | null
        }
        Relationships: []
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          org_id: string
          role: string
          token: string
          venue_ids: string[]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          org_id: string
          role: string
          token: string
          venue_ids?: string[]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
          token?: string
          venue_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          created_at: string
          email: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string | null
        }
        Relationships: []
      }
      user_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_model: string | null
          device_name: string | null
          expo_push_token: string
          id: string
          os_name: string | null
          os_version: string | null
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          expo_push_token: string
          id?: string
          os_name?: string | null
          os_version?: string | null
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_model?: string | null
          device_name?: string | null
          expo_push_token?: string
          id?: string
          os_name?: string | null
          os_version?: string | null
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      venue_media: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          sort_order: number
          status: string
          storage_bucket: string
          storage_path: string
          title: string | null
          type: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          status?: string
          storage_bucket: string
          storage_path: string
          title?: string | null
          type: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          sort_order?: number
          status?: string
          storage_bucket?: string
          storage_path?: string
          title?: string | null
          type?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_media_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_members: {
        Row: {
          assigned_by: string | null
          created_at: string
          org_id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          org_id: string
          user_id: string
          venue_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          org_id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_members_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          address: string | null
          app_name_preference: string
          city: string
          created_at: string
          id: string
          last_confirmed_at: string | null
          lat: number | null
          lng: number | null
          name: string
          neighborhood: string | null
          org_id: string
          org_name: string | null
          phone: string | null
          price_tier: number | null
          published_at: string | null
          state: string
          status: string
          tags: string[]
          timezone: string | null
          updated_at: string
          website: string | null
          zip: number
        }
        Insert: {
          address?: string | null
          app_name_preference?: string
          city: string
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          neighborhood?: string | null
          org_id: string
          org_name?: string | null
          phone?: string | null
          price_tier?: number | null
          published_at?: string | null
          state: string
          status?: string
          tags?: string[]
          timezone?: string | null
          updated_at?: string
          website?: string | null
          zip: number
        }
        Update: {
          address?: string | null
          app_name_preference?: string
          city?: string
          created_at?: string
          id?: string
          last_confirmed_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          neighborhood?: string | null
          org_id?: string
          org_name?: string | null
          phone?: string | null
          price_tier?: number | null
          published_at?: string | null
          state?: string
          status?: string
          tags?: string[]
          timezone?: string | null
          updated_at?: string
          website?: string | null
          zip?: number
        }
        Relationships: [
          {
            foreignKeyName: "venues_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      organization_members: {
        Row: {
          created_at: string | null
          organization_id: string | null
          role: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          organization_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          organization_id?: string | null
          role?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      published_happy_hour_windows: {
        Row: {
          created_at: string | null
          dow: number[] | null
          end_time: string | null
          id: string | null
          label: string | null
          last_confirmed_at: string | null
          restaurant_id: string | null
          start_time: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string | null
          dow?: number[] | null
          end_time?: string | null
          id?: string | null
          label?: string | null
          last_confirmed_at?: string | null
          restaurant_id?: string | null
          start_time?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string | null
          dow?: number[] | null
          end_time?: string | null
          id?: string | null
          label?: string | null
          last_confirmed_at?: string | null
          restaurant_id?: string | null
          start_time?: string | null
          status?: string | null
          timezone?: string | null
          updated_at?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      published_happy_hour_windows_with_names: {
        Row: {
          created_at: string | null
          dow: number[] | null
          end_time: string | null
          id: string | null
          label: string | null
          last_confirmed_at: string | null
          organization_name: string | null
          restaurant_id: string | null
          start_time: string | null
          status: string | null
          timezone: string | null
          updated_at: string | null
          venue_id: string | null
          venue_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_organization: { Args: { p_name: string }; Returns: string }
      has_venue_assignment: { Args: { p_venue_id: string }; Returns: boolean }
      hh_days_from_text: { Args: { s: string }; Returns: string[] }
      is_org_host: { Args: { p_org_id: string }; Returns: boolean }
      is_org_manager: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      whoami: { Args: never; Returns: Json }
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
  public: {
    Enums: {},
  },
} as const
