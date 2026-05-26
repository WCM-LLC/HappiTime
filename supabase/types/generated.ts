export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      admin_users: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          id?: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          count: number
          key: string
          updated_at: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      approved_tags: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      directory_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json | null
          page_path: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json | null
          page_path?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "directory_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      event_media: {
        Row: {
          event_id: string
          media_id: string
          sort_order: number
        }
        Insert: {
          event_id: string
          media_id: string
          sort_order?: number
        }
        Update: {
          event_id?: string
          media_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "upcoming_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "venue_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_media_media_id_fkey"
            columns: ["media_id"]
            isOneToOne: false
            referencedRelation: "venue_media"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json
          occurred_at: string
          org_id: string
          user_id: string | null
          venue_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json
          occurred_at?: string
          org_id: string
          user_id?: string | null
          venue_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json
          occurred_at?: string
          org_id?: string
          user_id?: string | null
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      guide_submissions: {
        Row: {
          decision: string | null
          guide_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          decision?: string | null
          guide_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          decision?: string | null
          guide_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guide_submissions_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "guides"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          author_id: string | null
          body_md: string
          city: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          neighborhood: string | null
          published_at: string | null
          slug: string
          status: string
          subtitle: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md: string
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          neighborhood?: string | null
          published_at?: string | null
          slug: string
          status?: string
          subtitle?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          neighborhood?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          subtitle?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      happy_hour_menu_item_prices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          menu_item_id: string
          updated_at: string
          window_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          menu_item_id: string
          updated_at?: string
          window_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          menu_item_id?: string
          updated_at?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_menu_item_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_menu_item_prices_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_menu_item_prices_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_menu_item_prices_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows_with_names"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_hour_offer_windows: {
        Row: {
          created_at: string
          offer_id: string
          window_id: string
        }
        Insert: {
          created_at?: string
          offer_id: string
          window_id: string
        }
        Update: {
          created_at?: string
          offer_id?: string
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_offer_windows_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offer_windows_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offer_windows_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_offer_windows_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows_with_names"
            referencedColumns: ["id"]
          },
        ]
      }
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
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
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
          venue_zip: string | null
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
          venue_zip?: string | null
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
          venue_zip?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      happy_hour_window_days: {
        Row: {
          created_at: string
          dow: number
          window_id: string
        }
        Insert: {
          created_at?: string
          dow: number
          window_id: string
        }
        Update: {
          created_at?: string
          dow?: number
          window_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "happy_hour_window_days_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_window_days_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_window_days_window_id_fkey"
            columns: ["window_id"]
            isOneToOne: false
            referencedRelation: "published_happy_hour_windows_with_names"
            referencedColumns: ["id"]
          },
        ]
      }
      happy_hour_window_menus: {
        Row: {
          created_at: string
          happy_hour_window_id: string
          menu_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          happy_hour_window_id: string
          menu_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          happy_hour_window_id?: string
          menu_id?: string
          updated_at?: string
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
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_base_prices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          menu_item_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          menu_item_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          menu_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_base_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
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
          org_id: string
          scope: string
          source_menu_id: string | null
          status: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          scope?: string
          source_menu_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          scope?: string
          source_menu_id?: string | null
          status?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menus_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_source_menu_id_fkey"
            columns: ["source_menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
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
          first_name: string | null
          id: string
          invited_by: string
          last_name: string | null
          org_id: string
          role: string
          token: string
          updated_at: string
          venue_ids: string[]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          invited_by: string
          last_name?: string | null
          org_id: string
          role: string
          token: string
          updated_at?: string
          venue_ids?: string[]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          invited_by?: string
          last_name?: string | null
          org_id?: string
          role?: string
          token?: string
          updated_at?: string
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
          first_name: string | null
          last_name: string | null
          org_id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          org_id: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          org_id?: string
          role?: string
          updated_at?: string
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
      organization_merge_audit: {
        Row: {
          canonical_organization_id: string
          canonical_organization_name: string
          duplicate_organization_id: string
          duplicate_organization_name: string
          id: number
          merged_at: string
          normalized_name: string
        }
        Insert: {
          canonical_organization_id: string
          canonical_organization_name: string
          duplicate_organization_id: string
          duplicate_organization_name: string
          id?: number
          merged_at?: string
          normalized_name: string
        }
        Update: {
          canonical_organization_id?: string
          canonical_organization_name?: string
          duplicate_organization_id?: string
          duplicate_organization_name?: string
          id?: number
          merged_at?: string
          normalized_name?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_friend_invites: {
        Row: {
          claimed_at: string | null
          created_at: string
          expires_at: string
          id: string
          invite_token: string
          invitee_email: string
          invitee_handle: string | null
          inviter_id: string
          status: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invitee_email: string
          invitee_handle?: string | null
          inviter_id: string
          status?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invitee_email?: string
          invitee_handle?: string | null
          inviter_id?: string
          status?: string
        }
        Relationships: []
      }
      reserved_handles: {
        Row: {
          handle: string
        }
        Insert: {
          handle: string
        }
        Update: {
          handle?: string
        }
        Relationships: []
      }
      user_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          meta: Json
          user_id: string
          venue_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          meta?: Json
          user_id: string
          venue_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          meta?: Json
          user_id?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_followed_venues: {
        Row: {
          created_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_followed_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_followed_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_follows: {
        Row: {
          created_at: string
          follower_id: string
          following_user_id: string
          status: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_user_id: string
          status?: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_user_id?: string
          status?: string
        }
        Relationships: []
      }
      user_list_items: {
        Row: {
          created_at: string
          id: string
          list_id: string
          notes: string | null
          sort_order: number
          updated_at: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          list_id: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          list_id?: string
          notes?: string | null
          sort_order?: number
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_list_items_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "user_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_list_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_list_items_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      user_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          share_slug: string | null
          share_token: string | null
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          share_slug?: string | null
          share_token?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          share_slug?: string | null
          share_token?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_plans: {
        Row: {
          created_at: string
          id: string
          plan: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          plan?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          cuisines: string[]
          default_checkin_privacy: string
          home_city: string | null
          home_lat: number | null
          home_lng: number | null
          home_state: string | null
          interests: string[]
          location_enabled: boolean
          location_permission_status: string | null
          max_distance_miles: number | null
          notifications_friend_activity: boolean
          notifications_happy_hours: boolean
          notifications_marketing: boolean
          notifications_permission_status: string | null
          notifications_product: boolean
          notifications_push: boolean
          notifications_venue_updates: boolean
          onboarding_completed_at: string | null
          onboarding_step: string
          onboarding_version: number
          price_tier_max: number | null
          price_tier_min: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cuisines?: string[]
          default_checkin_privacy?: string
          home_city?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          interests?: string[]
          location_enabled?: boolean
          location_permission_status?: string | null
          max_distance_miles?: number | null
          notifications_friend_activity?: boolean
          notifications_happy_hours?: boolean
          notifications_marketing?: boolean
          notifications_permission_status?: string | null
          notifications_product?: boolean
          notifications_push?: boolean
          notifications_venue_updates?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string
          onboarding_version?: number
          price_tier_max?: number | null
          price_tier_min?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cuisines?: string[]
          default_checkin_privacy?: string
          home_city?: string | null
          home_lat?: number | null
          home_lng?: number | null
          home_state?: string | null
          interests?: string[]
          location_enabled?: boolean
          location_permission_status?: string | null
          max_distance_miles?: number | null
          notifications_friend_activity?: boolean
          notifications_happy_hours?: boolean
          notifications_marketing?: boolean
          notifications_permission_status?: string | null
          notifications_product?: boolean
          notifications_push?: boolean
          notifications_venue_updates?: boolean
          onboarding_completed_at?: string | null
          onboarding_step?: string
          onboarding_version?: number
          price_tier_max?: number | null
          price_tier_min?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          auto_publish_enabled: boolean
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          is_public: boolean
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_publish_enabled?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          is_public?: boolean
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_publish_enabled?: boolean
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          is_public?: boolean
          role?: string
          updated_at?: string
          user_id?: string
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
      user_venue_notification_blocks: {
        Row: {
          created_at: string
          id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_venue_notification_blocks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_venue_notification_blocks_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_events: {
        Row: {
          capacity: number | null
          cover_image_path: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: string
          external_url: string | null
          id: string
          is_recurring: boolean
          location_override: string | null
          price_info: string | null
          recurrence_rule: string | null
          starts_at: string
          status: string
          tags: string[]
          ticket_url: string | null
          timezone: string
          title: string
          updated_at: string
          venue_id: string
        }
        Insert: {
          capacity?: number | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          external_url?: string | null
          id?: string
          is_recurring?: boolean
          location_override?: string | null
          price_info?: string | null
          recurrence_rule?: string | null
          starts_at: string
          status?: string
          tags?: string[]
          ticket_url?: string | null
          timezone?: string
          title: string
          updated_at?: string
          venue_id: string
        }
        Update: {
          capacity?: number | null
          cover_image_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          event_type?: string
          external_url?: string | null
          id?: string
          is_recurring?: boolean
          location_override?: string | null
          price_info?: string | null
          recurrence_rule?: string | null
          starts_at?: string
          status?: string
          tags?: string[]
          ticket_url?: string | null
          timezone?: string
          title?: string
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_media: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          id: string
          sort_order: number
          source: string
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
          source?: string
          status?: string
          storage_bucket?: string
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
          source?: string
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
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
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
          updated_at: string
          user_id: string
          venue_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          org_id: string
          updated_at?: string
          user_id: string
          venue_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          org_id?: string
          updated_at?: string
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
            referencedRelation: "promoted_venues"
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
      venue_subscriptions: {
        Row: {
          billing_email: string | null
          billing_name: string | null
          created_at: string
          id: string
          manual_override: boolean
          org_id: string
          plan: string
          status: string
          stripe_current_period_end: string | null
          stripe_current_period_start: string | null
          stripe_customer_id: string | null
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          venue_id: string
        }
        Insert: {
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          id?: string
          manual_override?: boolean
          org_id: string
          plan?: string
          status?: string
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          venue_id: string
        }
        Update: {
          billing_email?: string | null
          billing_name?: string | null
          created_at?: string
          id?: string
          manual_override?: boolean
          org_id?: string
          plan?: string
          status?: string
          stripe_current_period_end?: string | null
          stripe_current_period_start?: string | null
          stripe_customer_id?: string | null
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_subscriptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_subscriptions_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: true
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_tags: {
        Row: {
          created_at: string
          tag_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          tag_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          tag_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "approved_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_tags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_tags_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_visits: {
        Row: {
          comment: string | null
          created_at: string
          duration_minutes: number | null
          entered_at: string
          exited_at: string | null
          id: string
          is_private: boolean
          rating: number | null
          rating_prompt_source: string | null
          rating_prompted_at: string | null
          source: string
          updated_at: string
          user_id: string
          venue_id: string
          visited_at: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          duration_minutes?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          is_private?: boolean
          rating?: number | null
          rating_prompt_source?: string | null
          rating_prompted_at?: string | null
          source?: string
          updated_at?: string
          user_id: string
          venue_id: string
          visited_at?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          duration_minutes?: number | null
          entered_at?: string
          exited_at?: string | null
          id?: string
          is_private?: boolean
          rating?: number | null
          rating_prompt_source?: string | null
          rating_prompted_at?: string | null
          source?: string
          updated_at?: string
          user_id?: string
          venue_id?: string
          visited_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_visits_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_visits_venue_id_fkey"
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
          city: string | null
          created_at: string
          cuisine_type: string | null
          data_locked_fields: string[]
          facebook_url: string | null
          geocode_attempts: number
          geocode_last_attempt_at: string | null
          geocode_last_error: string | null
          geocode_next_attempt_at: string | null
          geocode_requested_at: string | null
          geocode_status: string
          geocoded_at: string | null
          id: string
          instagram_url: string | null
          is_verified: boolean
          last_confirmed_at: string | null
          lat: number | null
          lng: number | null
          name: string
          neighborhood: string | null
          org_id: string
          org_name: string | null
          phone: string | null
          places_attempts: number
          places_id: string | null
          places_last_error: string | null
          places_last_synced_at: string | null
          places_next_sync_at: string | null
          places_status: string
          post_visit_rating_aspects: string[]
          post_visit_rating_enabled: boolean
          price_tier: number | null
          promotion_ends_at: string | null
          promotion_priority: number
          promotion_starts_at: string | null
          promotion_tier: string | null
          published_at: string | null
          rating: number | null
          review_count: number | null
          slug: string
          state: string | null
          status: string
          tags: string[]
          tiktok_url: string | null
          timezone: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          app_name_preference?: string
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          data_locked_fields?: string[]
          facebook_url?: string | null
          geocode_attempts?: number
          geocode_last_attempt_at?: string | null
          geocode_last_error?: string | null
          geocode_next_attempt_at?: string | null
          geocode_requested_at?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          last_confirmed_at?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          neighborhood?: string | null
          org_id: string
          org_name?: string | null
          phone?: string | null
          places_attempts?: number
          places_id?: string | null
          places_last_error?: string | null
          places_last_synced_at?: string | null
          places_next_sync_at?: string | null
          places_status?: string
          post_visit_rating_aspects?: string[]
          post_visit_rating_enabled?: boolean
          price_tier?: number | null
          promotion_ends_at?: string | null
          promotion_priority?: number
          promotion_starts_at?: string | null
          promotion_tier?: string | null
          published_at?: string | null
          rating?: number | null
          review_count?: number | null
          slug: string
          state?: string | null
          status?: string
          tags?: string[]
          tiktok_url?: string | null
          timezone?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          app_name_preference?: string
          city?: string | null
          created_at?: string
          cuisine_type?: string | null
          data_locked_fields?: string[]
          facebook_url?: string | null
          geocode_attempts?: number
          geocode_last_attempt_at?: string | null
          geocode_last_error?: string | null
          geocode_next_attempt_at?: string | null
          geocode_requested_at?: string | null
          geocode_status?: string
          geocoded_at?: string | null
          id?: string
          instagram_url?: string | null
          is_verified?: boolean
          last_confirmed_at?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          neighborhood?: string | null
          org_id?: string
          org_name?: string | null
          phone?: string | null
          places_attempts?: number
          places_id?: string | null
          places_last_error?: string | null
          places_last_synced_at?: string | null
          places_next_sync_at?: string | null
          places_status?: string
          post_visit_rating_aspects?: string[]
          post_visit_rating_enabled?: boolean
          price_tier?: number | null
          promotion_ends_at?: string | null
          promotion_priority?: number
          promotion_starts_at?: string | null
          promotion_tier?: string | null
          published_at?: string | null
          rating?: number | null
          review_count?: number | null
          slug?: string
          state?: string | null
          status?: string
          tags?: string[]
          tiktok_url?: string | null
          timezone?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
          website?: string | null
          zip?: string | null
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
      visit_rating_aspects: {
        Row: {
          aspect_key: string
          created_at: string
          id: string
          visit_id: string
        }
        Insert: {
          aspect_key: string
          created_at?: string
          id?: string
          visit_id: string
        }
        Update: {
          aspect_key?: string
          created_at?: string
          id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_rating_aspects_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "venue_visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      promoted_venues: {
        Row: {
          id: string | null
          name: string | null
          org_id: string | null
          promotion_ends_at: string | null
          promotion_priority: number | null
          promotion_starts_at: string | null
          promotion_tier: string | null
          stripe_subscription_id: string | null
          subscription_plan: string | null
          subscription_status: string | null
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
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
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
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "happy_hour_windows_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      upcoming_events: {
        Row: {
          capacity: number | null
          cover_image_path: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          ends_at: string | null
          event_type: string | null
          external_url: string | null
          id: string | null
          is_recurring: boolean | null
          location_override: string | null
          price_info: string | null
          recurrence_rule: string | null
          starts_at: string | null
          status: string | null
          tags: string[] | null
          ticket_url: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          venue_address: string | null
          venue_city: string | null
          venue_id: string | null
          venue_lat: number | null
          venue_lng: number | null
          venue_name: string | null
          venue_neighborhood: string | null
          venue_slug: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_event_counts: {
        Row: {
          cnt: number | null
          event_type: string | null
          org_id: string | null
          venue_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "promoted_venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      create_organization: { Args: { p_name: string }; Returns: string }
      get_geocode_job_token: { Args: never; Returns: string }
      get_places_job_token: { Args: never; Returns: string }
      get_venue_follower_user_stats: {
        Args: { p_venue_id: string }
        Returns: {
          follower_count: number
          user_id: string
        }[]
      }
      get_venue_visit_stats: {
        Args: { p_since?: string; p_venue_id: string }
        Returns: {
          active_count: number
          average_duration_minutes: number
          private_count: number
          recent_count: number
          total_count: number
          venue_id: string
        }[]
      }
      has_venue_assignment: { Args: { p_venue_id: string }; Returns: boolean }
      hh_days_from_text: { Args: { s: string }; Returns: string[] }
      invoke_geocode_venues: { Args: never; Returns: undefined }
      invoke_places_import: { Args: never; Returns: undefined }
      is_happitime_admin: { Args: never; Returns: boolean }
      is_org_host: { Args: { p_org_id: string }; Returns: boolean }
      is_org_manager: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      normalize_organization_name: { Args: { input: string }; Returns: string }
      organization_slugify: { Args: { input: string }; Returns: string }
      record_venue_visit: {
        Args: {
          p_comment?: string
          p_duration_minutes?: number
          p_entered_at?: string
          p_exited_at?: string
          p_is_private?: boolean
          p_rating?: number
          p_source: string
          p_venue_id: string
        }
        Returns: {
          id: string
          inserted: boolean
        }[]
      }
      replace_happy_hour_window_menus: {
        Args: { p_menu_ids?: string[]; p_window_id: string }
        Returns: {
          created_at: string
          happy_hour_window_id: string
          menu_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "happy_hour_window_menus"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      venue_slugify: { Args: { input: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
