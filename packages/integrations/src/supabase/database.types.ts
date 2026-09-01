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
      create_product: { Args: { payload: Json }; Returns: string }
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
      workspace_status: ["active", "archived"],
    },
  },
} as const

