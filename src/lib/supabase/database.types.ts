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
      account_lockouts: {
        Row: {
          email: string
          failed_attempts: number
          locked_until: string | null
          updated_at: string | null
        }
        Insert: {
          email: string
          failed_attempts?: number
          locked_until?: string | null
          updated_at?: string | null
        }
        Update: {
          email?: string
          failed_attempts?: number
          locked_until?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          message: string | null
          order_id: string | null
          read: boolean | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message?: string | null
          order_id?: string | null
          read?: boolean | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string | null
          order_id?: string | null
          read?: boolean | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "admin_notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      admins: {
        Row: {
          created_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string
          name: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          message: string
          name: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string
          name?: string
        }
        Relationships: []
      }
      daily_order_counter: {
        Row: {
          day: string
          last_number: number
        }
        Insert: {
          day: string
          last_number: number
        }
        Update: {
          day?: string
          last_number?: number
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          order_id: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          transaction_type: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          order_id?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "financial_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "financial_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_logs: {
        Row: {
          created_at: string | null
          frontend_total: number | null
          id: string
          metadata: Json | null
          reason: string
          server_total: number | null
          stripe_total: number
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          frontend_total?: number | null
          id?: string
          metadata?: Json | null
          reason: string
          server_total?: number | null
          stripe_total?: number
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          frontend_total?: number | null
          id?: string
          metadata?: Json | null
          reason?: string
          server_total?: number | null
          stripe_total?: number
          user_id?: string | null
        }
        Relationships: []
      }
      health_check: {
        Row: {
          id: number
        }
        Insert: {
          id?: number
        }
        Update: {
          id?: number
        }
        Relationships: []
      }
      ip_blocks: {
        Row: {
          blocked_until: string | null
          created_at: string | null
          ip: string
          reason: string | null
        }
        Insert: {
          blocked_until?: string | null
          created_at?: string | null
          ip: string
          reason?: string | null
        }
        Update: {
          blocked_until?: string | null
          created_at?: string | null
          ip?: string
          reason?: string | null
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string | null
          email: string
          id: string
          ip: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          ip: string
          success: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          ip?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          balance: number
          created_at: string
          id: string
          last_activity: string | null
          last_award_at: string | null
          last_redeem_at: string | null
          lifetime_earned: number
          status: string
          streak: number
          tier: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          last_activity?: string | null
          last_award_at?: string | null
          last_redeem_at?: string | null
          lifetime_earned?: number
          status?: string
          streak?: number
          tier?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          last_activity?: string | null
          last_award_at?: string | null
          last_redeem_at?: string | null
          lifetime_earned?: number
          status?: string
          streak?: number
          tier?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          account_id: string
          admin_id: string | null
          amount: number
          balance_after: number
          created_at: string
          entry_type: string
          id: string
          idempotency_key: string | null
          metadata: Json
          prev_hash: string | null
          reference_id: string | null
          row_hash: string | null
          source: string
          streak_at_time: number
          tier_at_time: string
        }
        Insert: {
          account_id: string
          admin_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          entry_type: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          prev_hash?: string | null
          reference_id?: string | null
          row_hash?: string | null
          source: string
          streak_at_time?: number
          tier_at_time?: string
        }
        Update: {
          account_id?: string
          admin_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          entry_type?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          prev_hash?: string | null
          reference_id?: string | null
          row_hash?: string | null
          source?: string
          streak_at_time?: number
          tier_at_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v2_account_summary"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "loyalty_ledger_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          base_points: number
          created_at: string
          id: string
          lifetime_balance: number
          metadata: Json | null
          order_id: string | null
          points_balance: number
          points_delta: number
          streak_at_time: number
          streak_multiplier: number
          tier_at_time: string
          tier_multiplier: number
          transaction_type: string
          user_id: string
        }
        Insert: {
          base_points?: number
          created_at?: string
          id?: string
          lifetime_balance: number
          metadata?: Json | null
          order_id?: string | null
          points_balance: number
          points_delta: number
          streak_at_time?: number
          streak_multiplier?: number
          tier_at_time?: string
          tier_multiplier?: number
          transaction_type: string
          user_id: string
        }
        Update: {
          base_points?: number
          created_at?: string
          id?: string
          lifetime_balance?: number
          metadata?: Json | null
          order_id?: string | null
          points_balance?: number
          points_delta?: number
          streak_at_time?: number
          streak_multiplier?: number
          tier_at_time?: string
          tier_multiplier?: number
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[] | null
          available: boolean
          category: string
          created_at: string | null
          description: string | null
          featured: boolean
          id: string
          image_url: string | null
          is_gluten_free: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          name: string
          price: number
          sort_order: number | null
          spicy_level: number | null
        }
        Insert: {
          allergens?: string[] | null
          available?: boolean
          category: string
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          name: string
          price: number
          sort_order?: number | null
          spicy_level?: number | null
        }
        Update: {
          allergens?: string[] | null
          available?: boolean
          category?: string
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          name?: string
          price?: number
          sort_order?: number | null
          spicy_level?: number | null
        }
        Relationships: []
      }
      order_events: {
        Row: {
          created_at: string | null
          event_data: Json | null
          event_type: string
          id: string
          order_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          order_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          order_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_audit: {
        Row: {
          changed_at: string | null
          changed_by: string | null
          id: string
          new_status: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string | null
          changed_by?: string | null
          id?: string
          new_status?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_shipping: number
          amount_subtotal: number
          amount_tax: number
          amount_total: number
          assigned_to: string | null
          cart_items: Json | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_uid: string | null
          id: string
          metadata: Json | null
          notes: string | null
          order_number: number | null
          order_type: string
          payment_status: string
          shipping_address: Json | null
          shipping_name: string | null
          shipping_phone: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string
        }
        Insert: {
          amount_shipping?: number
          amount_subtotal?: number
          amount_tax?: number
          amount_total?: number
          assigned_to?: string | null
          cart_items?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_uid?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_number?: number | null
          order_type?: string
          payment_status?: string
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_phone?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          updated_at?: string
        }
        Update: {
          amount_shipping?: number
          amount_subtotal?: number
          amount_tax?: number
          amount_total?: number
          assigned_to?: string | null
          cart_items?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_uid?: string | null
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_number?: number | null
          order_type?: string
          payment_status?: string
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_phone?: string | null
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      password_attempts: {
        Row: {
          attempts: number
          ip_address: string
          last_attempt: string
        }
        Insert: {
          attempts?: number
          ip_address: string
          last_attempt?: string
        }
        Update: {
          attempts?: number
          ip_address?: string
          last_attempt?: string
        }
        Relationships: []
      }
      password_fingerprints: {
        Row: {
          created_at: string | null
          fingerprint: string
        }
        Insert: {
          created_at?: string | null
          fingerprint: string
        }
        Update: {
          created_at?: string | null
          fingerprint?: string
        }
        Relationships: []
      }
      pending_carts: {
        Row: {
          created_at: string | null
          credit_id: string | null
          discount_cents: number
          expires_at: string | null
          id: string
          items: Json
          promo_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          credit_id?: string | null
          discount_cents?: number
          expires_at?: string | null
          id: string
          items: Json
          promo_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          credit_id?: string | null
          discount_cents?: number
          expires_at?: string | null
          id?: string
          items?: Json
          promo_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          last_order_date: string | null
          lifetime_points: number
          loyalty_points: number
          loyalty_public_id: string
          loyalty_streak: number
          loyalty_tier: string
          phone: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          last_order_date?: string | null
          lifetime_points?: number
          loyalty_points?: number
          loyalty_public_id: string
          loyalty_streak?: number
          loyalty_tier?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          last_order_date?: string | null
          lifetime_points?: number
          loyalty_points?: number
          loyalty_public_id?: string
          loyalty_streak?: number
          loyalty_tier?: string
          phone?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_redemptions: {
        Row: {
          checkout_session_id: string | null
          discount_cents: number
          id: string
          promotion_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          checkout_session_id?: string | null
          discount_cents: number
          id?: string
          promotion_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          checkout_session_id?: string | null
          discount_cents?: number
          id?: string
          promotion_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_redemptions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          current_uses: number
          expires_at: string | null
          id: string
          max_uses: number | null
          min_order_cents: number
          per_user_limit: number
          type: string
          updated_at: string
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          per_user_limit?: number
          type: string
          updated_at?: string
          value: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          current_uses?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          per_user_limit?: number
          type?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      staff_action_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_status: string | null
          old_status: string | null
          order_id: string
          staff_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_status?: string | null
          old_status?: string | null
          order_id: string
          staff_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_status?: string | null
          old_status?: string | null
          order_id?: string
          staff_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_staff_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_staff_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "fk_staff_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "fk_staff_order"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          created_at: string | null
          id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          type?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          amount_cents: number
          checkout_session_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          source: string
          used: boolean
          used_at: string | null
          user_id: string
        }
        Insert: {
          amount_cents: number
          checkout_session_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          source: string
          used?: boolean
          used_at?: string | null
          user_id: string
        }
        Update: {
          amount_cents?: number
          checkout_session_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          source?: string
          used?: boolean
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      financial_revenue_view: {
        Row: {
          amount_total: number | null
          created_at: string | null
          id: string | null
          payment_status: string | null
        }
        Insert: {
          amount_total?: number | null
          created_at?: string | null
          id?: string | null
          payment_status?: string | null
        }
        Update: {
          amount_total?: number | null
          created_at?: string | null
          id?: string | null
          payment_status?: string | null
        }
        Relationships: []
      }
      loyalty_leaderboard: {
        Row: {
          full_name: string | null
          id: string | null
          last_order_date: string | null
          lifetime_points: number | null
          loyalty_points: number | null
          loyalty_streak: number | null
          loyalty_tier: string | null
          points_to_next_tier: number | null
          tier_threshold: number | null
        }
        Insert: {
          full_name?: string | null
          id?: string | null
          last_order_date?: string | null
          lifetime_points?: number | null
          loyalty_points?: number | null
          loyalty_streak?: number | null
          loyalty_tier?: string | null
          points_to_next_tier?: never
          tier_threshold?: never
        }
        Update: {
          full_name?: string | null
          id?: string | null
          last_order_date?: string | null
          lifetime_points?: number | null
          loyalty_points?: number | null
          loyalty_streak?: number | null
          loyalty_tier?: string | null
          points_to_next_tier?: never
          tier_threshold?: never
        }
        Relationships: []
      }
      order_performance: {
        Row: {
          created_at: string | null
          order_id: string | null
          order_number: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          order_id?: string | null
          order_number?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          order_id?: string | null
          order_number?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      order_timeline: {
        Row: {
          amount_total: number | null
          current_status: string | null
          customer_uid: string | null
          event_data: Json | null
          event_id: string | null
          event_time: string | null
          event_type: string | null
          order_id: string | null
          order_number: number | null
          user_id: string | null
        }
        Relationships: []
      }
      revenue_summary: {
        Row: {
          net_revenue: number | null
        }
        Relationships: []
      }
      v2_account_summary: {
        Row: {
          account_id: string | null
          balance: number | null
          last_activity: string | null
          lifetime_earned: number | null
          streak: number | null
          tier: string | null
          user_id: string | null
        }
        Insert: {
          account_id?: string | null
          balance?: number | null
          last_activity?: string | null
          lifetime_earned?: number | null
          streak?: number | null
          tier?: string | null
          user_id?: string | null
        }
        Update: {
          account_id?: string | null
          balance?: number | null
          last_activity?: string | null
          lifetime_earned?: number | null
          streak?: number | null
          tier?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      v2_loyalty_audit: {
        Row: {
          admin_id: string | null
          amount: number | null
          balance_after: number | null
          created_at: string | null
          entry_type: string | null
          idempotency_key: string | null
          source: string | null
          tier_at_time: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _deprecated_award_v1: {
        Args: {
          p_admin_id: string
          p_amount_cents: number
          p_base_points: number
          p_order_id?: string
          p_points: number
          p_streak: number
          p_streak_mult: number
          p_tier: string
          p_tier_mult: number
          p_user_id: string
        }
        Returns: {
          new_balance: number
          new_lifetime: number
          new_tier: string
          tier_changed: boolean
          was_duplicate: boolean
        }[]
      }
      _deprecated_redeem_v1: {
        Args: {
          p_admin_id: string
          p_mode?: string
          p_points: number
          p_user_id: string
        }
        Returns: {
          new_balance: number
        }[]
      }
      award_loyalty_points: {
        Args: { p_amount_cents: number; p_order_id: string; p_user_id: string }
        Returns: Json
      }
      cleanup_pending_carts: { Args: never; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_next_order_number: { Args: never; Returns: number }
      is_admin: { Args: { uid: string }; Returns: boolean }
      issue_loyalty_correction: {
        Args: {
          p_admin_id: string
          p_points: number
          p_reason: string
          p_user_id: string
        }
        Returns: {
          new_balance: number
        }[]
      }
      promotions_decrement_uses: {
        Args: { p_promo_id: string }
        Returns: undefined
      }
      reconcile_v2_accounts: {
        Args: never
        Returns: {
          drift: number
          user_id: string
          v1_balance: number
          v2_account_exists: boolean
          v2_balance: number
        }[]
      }
      redeem_loyalty_points: {
        Args: { p_order_id?: string; p_points: number; p_user_id: string }
        Returns: Json
      }
      update_order_status_secure: {
        Args: { new_status: string; order_id: string }
        Returns: {
          amount_shipping: number
          amount_subtotal: number
          amount_tax: number
          amount_total: number
          assigned_to: string | null
          cart_items: Json | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_uid: string | null
          id: string
          metadata: Json | null
          notes: string | null
          order_number: number | null
          order_type: string
          payment_status: string
          shipping_address: Json | null
          shipping_name: string | null
          shipping_phone: string | null
          status: string
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      v2_award_points: {
        Args: {
          p_account_id: string
          p_admin_id: string
          p_amount_cents: number
          p_idempotency_key: string
        }
        Returns: {
          new_balance: number
          new_lifetime: number
          new_tier: string
          points_earned: number
          streak: number
          tier_changed: boolean
          was_duplicate: boolean
        }[]
      }
      v2_redeem_points: {
        Args: {
          p_account_id: string
          p_admin_id: string
          p_amount: number
          p_idempotency_key?: string
          p_reference_id?: string
        }
        Returns: {
          new_balance: number
          was_duplicate: boolean
        }[]
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
