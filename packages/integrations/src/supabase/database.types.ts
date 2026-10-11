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
    PostgrestVersion: "14.5"
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
      categories: {
        Row: {
          channel_mappings: Json
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          seller_id: string
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          channel_mappings?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          seller_id: string
          slug: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          channel_mappings?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          seller_id?: string
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      copilot_chats: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          messages: Json
          seller_id: string
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          messages?: Json
          seller_id: string
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          messages?: Json
          seller_id?: string
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "copilot_chats_workspace_seller_fkey"
            columns: ["workspace_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "seller_id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          position: number
          product_id: string
          seller_id: string
          source: Json | null
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id: string
          seller_id: string
          source?: Json | null
          updated_at?: string
          url: string
          workspace_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          position?: number
          product_id?: string
          seller_id?: string
          source?: Json | null
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_images_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          compare_at_price_amount_minor: number | null
          compare_at_price_currency: string | null
          created_at: string
          id: string
          inventory_state: Database["public"]["Enums"]["inventory_state"] | null
          low_stock_threshold: number | null
          option_values: Json
          position: number
          price_amount_minor: number
          price_currency: string
          product_id: string
          quantity_on_hand: number | null
          reserved_quantity: number
          sku: string | null
          status: Database["public"]["Enums"]["product_variant_status"]
          title: string
          track_inventory: boolean
          updated_at: string
          workspace_id: string
        }
        Insert: {
          barcode?: string | null
          compare_at_price_amount_minor?: number | null
          compare_at_price_currency?: string | null
          created_at?: string
          id?: string
          inventory_state?:
            | Database["public"]["Enums"]["inventory_state"]
            | null
          low_stock_threshold?: number | null
          option_values?: Json
          position?: number
          price_amount_minor: number
          price_currency?: string
          product_id: string
          quantity_on_hand?: number | null
          reserved_quantity?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_variant_status"]
          title: string
          track_inventory?: boolean
          updated_at?: string
          workspace_id: string
        }
        Update: {
          barcode?: string | null
          compare_at_price_amount_minor?: number | null
          compare_at_price_currency?: string | null
          created_at?: string
          id?: string
          inventory_state?:
            | Database["public"]["Enums"]["inventory_state"]
            | null
          low_stock_threshold?: number | null
          option_values?: Json
          position?: number
          price_amount_minor?: number
          price_currency?: string
          product_id?: string
          quantity_on_hand?: number | null
          reserved_quantity?: number
          sku?: string | null
          status?: Database["public"]["Enums"]["product_variant_status"]
          title?: string
          track_inventory?: boolean
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_workspace_fkey"
            columns: ["product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "product_list_view"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "product_variants_product_workspace_fkey"
            columns: ["product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      products: {
        Row: {
          archived_at: string | null
          category_ids: string[]
          created_at: string
          description: string | null
          id: string
          options: Json
          search_text: string
          seller_id: string
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          tags: string[]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          category_ids?: string[]
          created_at?: string
          description?: string | null
          id?: string
          options?: Json
          search_text?: string
          seller_id: string
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          category_ids?: string[]
          created_at?: string
          description?: string | null
          id?: string
          options?: Json
          search_text?: string
          seller_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          tags?: string[]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_seller_fkey"
            columns: ["workspace_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "seller_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      seller_profiles: {
        Row: {
          business_email: string | null
          business_name: string
          business_phone: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          slug: string
          updated_at: string
          verification_notes: string | null
          verification_status: Database["public"]["Enums"]["seller_verification_status"]
          verified_at: string | null
        }
        Insert: {
          business_email?: string | null
          business_name: string
          business_phone?: string | null
          created_at?: string
          description?: string | null
          id: string
          logo_url?: string | null
          slug: string
          updated_at?: string
          verification_notes?: string | null
          verification_status?: Database["public"]["Enums"]["seller_verification_status"]
          verified_at?: string | null
        }
        Update: {
          business_email?: string | null
          business_name?: string
          business_phone?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          slug?: string
          updated_at?: string
          verification_notes?: string | null
          verification_status?: Database["public"]["Enums"]["seller_verification_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          after_quantity_on_hand: number
          before_quantity_on_hand: number
          created_at: string
          id: string
          note: string | null
          performed_by: string
          product_id: string
          quantity_delta: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          seller_id: string
          variant_id: string
          workspace_id: string
        }
        Insert: {
          after_quantity_on_hand: number
          before_quantity_on_hand: number
          created_at?: string
          id?: string
          note?: string | null
          performed_by: string
          product_id: string
          quantity_delta: number
          reason: Database["public"]["Enums"]["stock_movement_reason"]
          seller_id: string
          variant_id: string
          workspace_id: string
        }
        Update: {
          after_quantity_on_hand?: number
          before_quantity_on_hand?: number
          created_at?: string
          id?: string
          note?: string | null
          performed_by?: string
          product_id?: string
          quantity_delta?: number
          reason?: Database["public"]["Enums"]["stock_movement_reason"]
          seller_id?: string
          variant_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_variant_fkey"
            columns: ["variant_id", "product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["id", "product_id", "workspace_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_fkey"
            columns: ["variant_id", "product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "inventory"
            referencedColumns: ["variant_id", "product_id", "workspace_id"]
          },
          {
            foreignKeyName: "stock_movements_variant_fkey"
            columns: ["variant_id", "product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "product_id", "workspace_id"]
          },
          {
            foreignKeyName: "stock_movements_workspace_seller_fkey"
            columns: ["workspace_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "seller_id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          seller_id: string
          slug: string
          status: Database["public"]["Enums"]["workspace_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          seller_id: string
          slug: string
          status?: Database["public"]["Enums"]["workspace_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          seller_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["workspace_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "seller_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      inventory: {
        Row: {
          available_quantity: number | null
          created_at: string | null
          id: string | null
          low_stock_threshold: number | null
          product_id: string | null
          quantity_on_hand: number | null
          reserved_quantity: number | null
          seller_id: string | null
          state: Database["public"]["Enums"]["inventory_state"] | null
          track_inventory: boolean | null
          updated_at: string | null
          variant_id: string | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_workspace_fkey"
            columns: ["product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "product_list_view"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "product_variants_product_workspace_fkey"
            columns: ["product_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      product_list_view: {
        Row: {
          archived_at: string | null
          category_ids: string[] | null
          created_at: string | null
          description: string | null
          id: string | null
          max_price_amount_minor: number | null
          min_price_amount_minor: number | null
          price_currency: string | null
          search_text: string | null
          seller_id: string | null
          slug: string | null
          status: Database["public"]["Enums"]["product_status"] | null
          tags: string[] | null
          title: string | null
          total_quantity_on_hand: number | null
          updated_at: string | null
          variant_count: number | null
          variant_states: string[] | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_workspace_seller_fkey"
            columns: ["workspace_id", "seller_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "seller_id"]
          },
        ]
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_note?: string
          p_reason: Database["public"]["Enums"]["stock_movement_reason"]
          p_target_quantity: number
          p_variant_id: string
          p_workspace_id: string
        }
        Returns: string
      }
      create_product: { Args: { payload: Json }; Returns: string }
      run_guarded_mutation: { Args: { p_sql: string }; Returns: Json }
      run_readonly_query: { Args: { p_sql: string }; Returns: Json }
    }
    Enums: {
      inventory_state: "in_stock" | "low_stock" | "out_of_stock" | "untracked"
      product_status: "draft" | "active" | "archived"
      product_variant_status: "active" | "inactive"
      seller_verification_status:
        | "pending"
        | "verified"
        | "rejected"
        | "suspended"
      stock_movement_reason:
        | "purchase"
        | "sale"
        | "return"
        | "manual_adjustment"
        | "correction"
        | "damage_loss"
      workspace_status: "active" | "archived"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      inventory_state: ["in_stock", "low_stock", "out_of_stock", "untracked"],
      product_status: ["draft", "active", "archived"],
      product_variant_status: ["active", "inactive"],
      seller_verification_status: [
        "pending",
        "verified",
        "rejected",
        "suspended",
      ],
      stock_movement_reason: [
        "purchase",
        "sale",
        "return",
        "manual_adjustment",
        "correction",
        "damage_loss",
      ],
      workspace_status: ["active", "archived"],
    },
  },
} as const
