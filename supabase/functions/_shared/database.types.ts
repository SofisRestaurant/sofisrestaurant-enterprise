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
      abandoned_cart_sessions: {
        Row: {
          cart_value_cents: number | null
          created_at: string | null
          email: string | null
          id: string
          last_activity: string | null
          recovered: boolean | null
          user_id: string | null
        }
        Insert: {
          cart_value_cents?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_activity?: string | null
          recovered?: boolean | null
          user_id?: string | null
        }
        Update: {
          cart_value_cents?: number | null
          created_at?: string | null
          email?: string | null
          id?: string
          last_activity?: string | null
          recovered?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
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
      admin_profit_snapshot: {
        Row: {
          singleton_id: boolean
          total_gross_profit_cents: number
          updated_at: string
        }
        Insert: {
          singleton_id?: boolean
          total_gross_profit_cents?: number
          updated_at?: string
        }
        Update: {
          singleton_id?: boolean
          total_gross_profit_cents?: number
          updated_at?: string
        }
        Relationships: []
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
      ai_insights: {
        Row: {
          applied: boolean | null
          body: string
          category: string
          confidence: number | null
          created_at: string | null
          id: string
          impact_pct: number | null
          title: string
        }
        Insert: {
          applied?: boolean | null
          body: string
          category: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          impact_pct?: number | null
          title: string
        }
        Update: {
          applied?: boolean | null
          body?: string
          category?: string
          confidence?: number | null
          created_at?: string | null
          id?: string
          impact_pct?: number | null
          title?: string
        }
        Relationships: []
      }
      auth_audit_log: {
        Row: {
          created_at: string
          device_id: string | null
          event_data: Json | null
          event_type: string
          id: string
          ip_address: string | null
          risk_score: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          event_data?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          risk_score?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          event_data?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          risk_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      auth_risk_rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          created_at: string
          last_attempt_at: string | null
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          created_at?: string
          last_attempt_at?: string | null
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          created_at?: string
          last_attempt_at?: string | null
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_risk_scores: {
        Row: {
          device_unknown_pts: number
          evaluated_at: string
          expires_at: string
          geo_mismatch_pts: number
          pw_mismatch_pts: number
          rapid_attempts_pts: number
          requires_device_trust: boolean
          requires_mfa: boolean
          requires_step_up: boolean
          risk_score: number
          session_id: string
          unusual_time_pts: number
          user_id: string
        }
        Insert: {
          device_unknown_pts?: number
          evaluated_at?: string
          expires_at: string
          geo_mismatch_pts?: number
          pw_mismatch_pts?: number
          rapid_attempts_pts?: number
          requires_device_trust?: boolean
          requires_mfa?: boolean
          requires_step_up?: boolean
          risk_score?: number
          session_id: string
          unusual_time_pts?: number
          user_id: string
        }
        Update: {
          device_unknown_pts?: number
          evaluated_at?: string
          expires_at?: string
          geo_mismatch_pts?: number
          pw_mismatch_pts?: number
          rapid_attempts_pts?: number
          requires_device_trust?: boolean
          requires_mfa?: boolean
          requires_step_up?: boolean
          risk_score?: number
          session_id?: string
          unusual_time_pts?: number
          user_id?: string
        }
        Relationships: []
      }
      auth_session_validation_cooldowns: {
        Row: {
          action: string
          last_seen_at: string
          session_id: string
          user_id: string
        }
        Insert: {
          action: string
          last_seen_at?: string
          session_id: string
          user_id: string
        }
        Update: {
          action?: string
          last_seen_at?: string
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      auth_sessions_meta: {
        Row: {
          country_code: string | null
          created_at: string
          device_trust_id: string | null
          invalidated_at: string | null
          invalidation_reason: string | null
          ip_address: string | null
          is_trusted_device: boolean
          last_active_at: string | null
          risk_score: number
          session_id: string
          user_id: string
        }
        Insert: {
          country_code?: string | null
          created_at?: string
          device_trust_id?: string | null
          invalidated_at?: string | null
          invalidation_reason?: string | null
          ip_address?: string | null
          is_trusted_device?: boolean
          last_active_at?: string | null
          risk_score?: number
          session_id: string
          user_id: string
        }
        Update: {
          country_code?: string | null
          created_at?: string
          device_trust_id?: string | null
          invalidated_at?: string | null
          invalidation_reason?: string | null
          ip_address?: string | null
          is_trusted_device?: boolean
          last_active_at?: string | null
          risk_score?: number
          session_id?: string
          user_id?: string
        }
        Relationships: []
      }
      checkout_rate_limits: {
        Row: {
          attempts: number
          blocked_until: string | null
          created_at: string
          id: string
          ip: string | null
          last_attempt_at: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_attempt_at?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          last_attempt_at?: string
          user_id?: string | null
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
      cost_of_goods: {
        Row: {
          cost_cents: number
          last_updated: string | null
          menu_item_id: string
        }
        Insert: {
          cost_cents: number
          last_updated?: string | null
          menu_item_id: string
        }
        Update: {
          cost_cents?: number
          last_updated?: string | null
          menu_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_of_goods_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_of_goods_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items_admin_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_of_goods_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items_public"
            referencedColumns: ["id"]
          },
        ]
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
      device_trust: {
        Row: {
          fingerprint_hash: string
          id: string
          ip_at_trust: string | null
          is_revoked: boolean
          last_seen_at: string | null
          revoked_at: string | null
          trust_label: string | null
          trusted_at: string
          user_id: string
        }
        Insert: {
          fingerprint_hash: string
          id?: string
          ip_at_trust?: string | null
          is_revoked?: boolean
          last_seen_at?: string | null
          revoked_at?: string | null
          trust_label?: string | null
          trusted_at?: string
          user_id: string
        }
        Update: {
          fingerprint_hash?: string
          id?: string
          ip_at_trust?: string | null
          is_revoked?: boolean
          last_seen_at?: string | null
          revoked_at?: string | null
          trust_label?: string | null
          trusted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_trust_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "device_trust_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_optimizer_rules: {
        Row: {
          active: boolean | null
          id: string
          min_conversion_rate: number | null
          min_margin_percent: number | null
          suggested_discount: number | null
        }
        Insert: {
          active?: boolean | null
          id?: string
          min_conversion_rate?: number | null
          min_margin_percent?: number | null
          suggested_discount?: number | null
        }
        Update: {
          active?: boolean | null
          id?: string
          min_conversion_rate?: number | null
          min_margin_percent?: number | null
          suggested_discount?: number | null
        }
        Relationships: []
      }
      discount_predictions: {
        Row: {
          avg_conversion: number | null
          avg_margin: number | null
          created_at: string | null
          day_of_week: number | null
          hour: number | null
          id: string
          recommended_discount: number | null
        }
        Insert: {
          avg_conversion?: number | null
          avg_margin?: number | null
          created_at?: string | null
          day_of_week?: number | null
          hour?: number | null
          id?: string
          recommended_discount?: number | null
        }
        Update: {
          avg_conversion?: number | null
          avg_margin?: number | null
          created_at?: string | null
          day_of_week?: number | null
          hour?: number | null
          id?: string
          recommended_discount?: number | null
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
      growth_campaign_settings: {
        Row: {
          auto_rotate_daily: boolean
          id: number
          last_rotation_at: string | null
        }
        Insert: {
          auto_rotate_daily?: boolean
          id?: number
          last_rotation_at?: string | null
        }
        Update: {
          auto_rotate_daily?: boolean
          id?: number
          last_rotation_at?: string | null
        }
        Relationships: []
      }
      growth_campaigns: {
        Row: {
          active: boolean
          badge: string | null
          budget_cents: number | null
          campaign_name: string | null
          channel: string | null
          created_at: string | null
          cta_label: string | null
          deep_link: string | null
          eligible_for_rotation: boolean
          ends_at: string | null
          featured_for_date: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          is_featured: boolean | null
          menu_item_id: string | null
          name: string | null
          placement: string | null
          priority: number | null
          promo_id: string | null
          revenue_cents: number | null
          spent_cents: number | null
          starts_at: string | null
          status: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          active?: boolean
          badge?: string | null
          budget_cents?: number | null
          campaign_name?: string | null
          channel?: string | null
          created_at?: string | null
          cta_label?: string | null
          deep_link?: string | null
          eligible_for_rotation?: boolean
          ends_at?: string | null
          featured_for_date?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_featured?: boolean | null
          menu_item_id?: string | null
          name?: string | null
          placement?: string | null
          priority?: number | null
          promo_id?: string | null
          revenue_cents?: number | null
          spent_cents?: number | null
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          active?: boolean
          badge?: string | null
          budget_cents?: number | null
          campaign_name?: string | null
          channel?: string | null
          created_at?: string | null
          cta_label?: string | null
          deep_link?: string | null
          eligible_for_rotation?: boolean
          ends_at?: string | null
          featured_for_date?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_featured?: boolean | null
          menu_item_id?: string | null
          name?: string | null
          placement?: string | null
          priority?: number | null
          promo_id?: string | null
          revenue_cents?: number | null
          spent_cents?: number | null
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          weight?: number | null
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
      loyalty_ledger_labels: {
        Row: {
          created_at: string
          id: string
          label: Json
          ledger_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: Json
          ledger_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: Json
          ledger_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_labels_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "loyalty_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_labels_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v2_loyalty_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_labels_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v2_loyalty_ledger_enriched"
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
          order_id: string
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
          order_id: string
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
          order_id?: string
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
      menu_item_modifier_groups: {
        Row: {
          id: string
          menu_item_id: string
          modifier_group_id: string
          sort_order: number
        }
        Insert: {
          id?: string
          menu_item_id: string
          modifier_group_id: string
          sort_order?: number
        }
        Update: {
          id?: string
          menu_item_id?: string
          modifier_group_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items_admin_full"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          allergens: string[] | null
          available: boolean
          category: Database["public"]["Enums"]["menu_category"]
          created_at: string | null
          description: string | null
          featured: boolean
          id: string
          image_url: string | null
          inventory_count: number | null
          is_gluten_free: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          low_stock_threshold: number | null
          name: string
          pairs_with: string[] | null
          popularity_score: number | null
          price: number
          sort_order: number | null
          spicy_level: number | null
          updated_at: string | null
        }
        Insert: {
          allergens?: string[] | null
          available?: boolean
          category: Database["public"]["Enums"]["menu_category"]
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          low_stock_threshold?: number | null
          name: string
          pairs_with?: string[] | null
          popularity_score?: number | null
          price: number
          sort_order?: number | null
          spicy_level?: number | null
          updated_at?: string | null
        }
        Update: {
          allergens?: string[] | null
          available?: boolean
          category?: Database["public"]["Enums"]["menu_category"]
          created_at?: string | null
          description?: string | null
          featured?: boolean
          id?: string
          image_url?: string | null
          inventory_count?: number | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          low_stock_threshold?: number | null
          name?: string
          pairs_with?: string[] | null
          popularity_score?: number | null
          price?: number
          sort_order?: number | null
          spicy_level?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      modifier_costs: {
        Row: {
          cost_cents: number
          last_updated: string | null
          modifier_id: string
        }
        Insert: {
          cost_cents: number
          last_updated?: string | null
          modifier_id: string
        }
        Update: {
          cost_cents?: number
          last_updated?: string | null
          modifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_costs_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: true
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          max_selections: number | null
          min_selections: number | null
          name: string
          required: boolean
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          max_selections?: number | null
          min_selections?: number | null
          name: string
          required?: boolean
          sort_order?: number
          type: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          required?: boolean
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      modifiers: {
        Row: {
          available: boolean
          created_at: string
          id: string
          modifier_group_id: string
          name: string
          price_adjustment: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          available?: boolean
          created_at?: string
          id?: string
          modifier_group_id: string
          name: string
          price_adjustment?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          available?: boolean
          created_at?: string
          id?: string
          modifier_group_id?: string
          name?: string
          price_adjustment?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
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
      order_items: {
        Row: {
          created_at: string
          id: string
          line_index: number
          line_total_cents: number
          menu_item_id: string | null
          modifiers: Json
          name: string
          notes: string | null
          order_id: string
          pricing_hash: string | null
          quantity: number
          unit_price_cents: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_index: number
          line_total_cents: number
          menu_item_id?: string | null
          modifiers?: Json
          name: string
          notes?: string | null
          order_id: string
          pricing_hash?: string | null
          quantity: number
          unit_price_cents: number
        }
        Update: {
          created_at?: string
          id?: string
          line_index?: number
          line_total_cents?: number
          menu_item_id?: string | null
          modifiers?: Json
          name?: string
          notes?: string | null
          order_id?: string
          pricing_hash?: string | null
          quantity?: number
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
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
          idempotency_key: string | null
          items: Json
          promo_id: string | null
          stripe_session_id: string | null
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
          idempotency_key?: string | null
          items: Json
          promo_id?: string | null
          stripe_session_id?: string | null
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
          idempotency_key?: string | null
          items?: Json
          promo_id?: string | null
          stripe_session_id?: string | null
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
          channel: string | null
          checkout_session_id: string | null
          discount_cents: number
          id: string
          order_total_cents: number | null
          promotion_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          channel?: string | null
          checkout_session_id?: string | null
          discount_cents: number
          id?: string
          order_total_cents?: number | null
          promotion_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          channel?: string | null
          checkout_session_id?: string | null
          discount_cents?: number
          id?: string
          order_total_cents?: number | null
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
      promotion_expirations: {
        Row: {
          expired_at: string | null
          id: string
          promotion_id: string | null
        }
        Insert: {
          expired_at?: string | null
          id?: string
          promotion_id?: string | null
        }
        Update: {
          expired_at?: string | null
          id?: string
          promotion_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotion_expirations_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          campaign_id: string | null
          channel: string | null
          code: string
          cost_center: string | null
          created_at: string
          current_uses: number
          ends_at: string | null
          expires_at: string | null
          geo_target: string | null
          id: string
          max_uses: number | null
          min_order_cents: number
          per_user_limit: number
          starts_at: string | null
          type: string
          updated_at: string
          value: number
        }
        Insert: {
          active?: boolean
          campaign_id?: string | null
          channel?: string | null
          code: string
          cost_center?: string | null
          created_at?: string
          current_uses?: number
          ends_at?: string | null
          expires_at?: string | null
          geo_target?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          per_user_limit?: number
          starts_at?: string | null
          type: string
          updated_at?: string
          value: number
        }
        Update: {
          active?: boolean
          campaign_id?: string | null
          channel?: string | null
          code?: string
          cost_center?: string | null
          created_at?: string
          current_uses?: number
          ends_at?: string | null
          expires_at?: string | null
          geo_target?: string | null
          id?: string
          max_uses?: number | null
          min_order_cents?: number
          per_user_limit?: number
          starts_at?: string | null
          type?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "active_campaigns_now"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "growth_campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      smart_discounts: {
        Row: {
          active: boolean | null
          day_of_week: number | null
          end_hour: number | null
          id: string
          start_hour: number | null
          type: string | null
          value: number | null
        }
        Insert: {
          active?: boolean | null
          day_of_week?: number | null
          end_hour?: number | null
          id?: string
          start_hour?: number | null
          type?: string | null
          value?: number | null
        }
        Update: {
          active?: boolean | null
          day_of_week?: number | null
          end_hour?: number | null
          id?: string
          start_hour?: number | null
          type?: string | null
          value?: number | null
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
      active_campaigns_now: {
        Row: {
          badge: string | null
          campaign_name: string | null
          cta_label: string | null
          deep_link: string | null
          ends_at: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string | null
          is_featured: boolean | null
          menu_item_id: string | null
          placement: string | null
          priority: number | null
          promo_id: string | null
          starts_at: string | null
          weight: number | null
        }
        Insert: {
          badge?: string | null
          campaign_name?: string | null
          cta_label?: string | null
          deep_link?: string | null
          ends_at?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string | null
          is_featured?: boolean | null
          menu_item_id?: string | null
          placement?: string | null
          priority?: number | null
          promo_id?: string | null
          starts_at?: string | null
          weight?: number | null
        }
        Update: {
          badge?: string | null
          campaign_name?: string | null
          cta_label?: string | null
          deep_link?: string | null
          ends_at?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string | null
          is_featured?: boolean | null
          menu_item_id?: string | null
          placement?: string | null
          priority?: number | null
          promo_id?: string | null
          starts_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      admin_executive_snapshot: {
        Row: {
          generated_at: string | null
          net_revenue_30d_cents: number | null
          total_gross_profit_cents: number | null
        }
        Relationships: []
      }
      admin_fraud_snapshot: {
        Row: {
          avg_delta_cents_7d: number | null
          fraud_events_7d: number | null
          last_event_at: string | null
          mismatch_events_7d: number | null
        }
        Relationships: []
      }
      admin_hourly_heatmap: {
        Row: {
          hour_of_day: number | null
          orders_count: number | null
          revenue_cents: number | null
        }
        Relationships: []
      }
      admin_item_consumption: {
        Row: {
          item_name: string | null
          orders_with_item: number | null
          qty_sold: number | null
          revenue_impact_cents: number | null
        }
        Relationships: []
      }
      admin_layout_snapshot: {
        Row: {
          abandoned_carts: number | null
          fraud_events_7d: number | null
          generated_at: string | null
          pending_carts: number | null
          pending_orders: number | null
          today_orders: number | null
          today_revenue_cents: number | null
          unread_notifications: number | null
        }
        Relationships: []
      }
      admin_loyalty_liability: {
        Row: {
          accounts_count: number | null
          avg_points_per_account: number | null
          total_points_liability: number | null
        }
        Relationships: []
      }
      admin_loyalty_summary: {
        Row: {
          active_users_30d: number | null
          points_earned_30d: number | null
          points_redeemed_30d: number | null
        }
        Relationships: []
      }
      admin_revenue_summary: {
        Row: {
          day: string | null
          gross_revenue_cents: number | null
          net_revenue_cents: number | null
          paid_orders_count: number | null
          refunded_cents: number | null
          refunds_count: number | null
        }
        Relationships: []
      }
      admin_risk_snapshot: {
        Row: {
          abandoned_sessions_24h: number | null
          abandoned_value_cents_24h: number | null
          high_attempt_users_24h: number | null
          rate_limit_attempts_24h: number | null
          rate_limit_rows_24h: number | null
          recovered_sessions_24h: number | null
        }
        Relationships: []
      }
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
      menu_items_admin_full: {
        Row: {
          allergens: string[] | null
          available: boolean | null
          category: Database["public"]["Enums"]["menu_category"] | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          id: string | null
          image_url: string | null
          inventory_count: number | null
          is_gluten_free: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          low_stock_threshold: number | null
          modifier_groups: Json | null
          name: string | null
          pairs_with: string[] | null
          popularity_score: number | null
          price: number | null
          sort_order: number | null
          spicy_level: number | null
          updated_at: string | null
        }
        Insert: {
          allergens?: string[] | null
          available?: boolean | null
          category?: Database["public"]["Enums"]["menu_category"] | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string | null
          image_url?: string | null
          inventory_count?: number | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          low_stock_threshold?: number | null
          modifier_groups?: never
          name?: string | null
          pairs_with?: string[] | null
          popularity_score?: number | null
          price?: number | null
          sort_order?: number | null
          spicy_level?: number | null
          updated_at?: string | null
        }
        Update: {
          allergens?: string[] | null
          available?: boolean | null
          category?: Database["public"]["Enums"]["menu_category"] | null
          created_at?: string | null
          description?: string | null
          featured?: boolean | null
          id?: string | null
          image_url?: string | null
          inventory_count?: number | null
          is_gluten_free?: boolean | null
          is_vegan?: boolean | null
          is_vegetarian?: boolean | null
          low_stock_threshold?: number | null
          modifier_groups?: never
          name?: string | null
          pairs_with?: string[] | null
          popularity_score?: number | null
          price?: number | null
          sort_order?: number | null
          spicy_level?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      menu_items_public: {
        Row: {
          allergens: string[] | null
          available: boolean | null
          category: Database["public"]["Enums"]["menu_category"] | null
          created_at: string | null
          description: string | null
          featured: boolean | null
          id: string | null
          image_url: string | null
          is_gluten_free: boolean | null
          is_vegan: boolean | null
          is_vegetarian: boolean | null
          modifier_groups: Json | null
          name: string | null
          pairs_with: string[] | null
          price: number | null
          sort_order: number | null
          spicy_level: number | null
          updated_at: string | null
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
          balance: number | null
          created_at: string | null
          id: string | null
          last_activity: string | null
          last_award_at: string | null
          last_redeem_at: string | null
          lifetime_earned: number | null
          status: string | null
          streak: number | null
          tier: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          balance?: number | null
          created_at?: string | null
          id?: string | null
          last_activity?: string | null
          last_award_at?: string | null
          last_redeem_at?: string | null
          lifetime_earned?: number | null
          status?: string | null
          streak?: number | null
          tier?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          balance?: number | null
          created_at?: string | null
          id?: string | null
          last_activity?: string | null
          last_award_at?: string | null
          last_redeem_at?: string | null
          lifetime_earned?: number | null
          status?: string | null
          streak?: number | null
          tier?: string | null
          updated_at?: string | null
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
      v2_loyalty_activity: {
        Row: {
          account_id: string | null
          admin_id: string | null
          amount: number | null
          balance_after: number | null
          created_at: string | null
          entry_type: string | null
          id: string | null
          idempotency_key: string | null
          metadata_enriched: Json | null
          reference_id: string | null
          source: string | null
          source_label: string | null
        }
        Insert: {
          account_id?: string | null
          admin_id?: string | null
          amount?: number | null
          balance_after?: number | null
          created_at?: string | null
          entry_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata_enriched?: never
          reference_id?: string | null
          source?: string | null
          source_label?: never
        }
        Update: {
          account_id?: string | null
          admin_id?: string | null
          amount?: number | null
          balance_after?: number | null
          created_at?: string | null
          entry_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata_enriched?: never
          reference_id?: string | null
          source?: string | null
          source_label?: never
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
      v2_loyalty_ledger_enriched: {
        Row: {
          account_id: string | null
          admin_id: string | null
          amount: number | null
          balance_after: number | null
          created_at: string | null
          entry_type: string | null
          id: string | null
          idempotency_key: string | null
          metadata: Json | null
          metadata_enriched: Json | null
          prev_hash: string | null
          reference_id: string | null
          row_hash: string | null
          source: string | null
          streak_at_time: number | null
          tier_at_time: string | null
        }
        Insert: {
          account_id?: string | null
          admin_id?: string | null
          amount?: number | null
          balance_after?: number | null
          created_at?: string | null
          entry_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata?: Json | null
          metadata_enriched?: never
          prev_hash?: string | null
          reference_id?: string | null
          row_hash?: string | null
          source?: string | null
          streak_at_time?: number | null
          tier_at_time?: string | null
        }
        Update: {
          account_id?: string | null
          admin_id?: string | null
          amount?: number | null
          balance_after?: number | null
          created_at?: string | null
          entry_type?: string | null
          id?: string | null
          idempotency_key?: string | null
          metadata?: Json | null
          metadata_enriched?: never
          prev_hash?: string | null
          reference_id?: string | null
          row_hash?: string | null
          source?: string | null
          streak_at_time?: number | null
          tier_at_time?: string | null
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
      get_admin_layout_snapshot: { Args: never; Returns: Json }
      get_loyalty_by_order: {
        Args: { p_order_id: string }
        Returns: {
          account_id: string
          amount: number
          created_at: string
          entry_type: string
          idempotency_key: string
          ledger_id: string
          metadata: Json
          reference_id: string
          source: string
        }[]
      }
      get_loyalty_for_order: {
        Args: { p_order_id: string }
        Returns: {
          created_at: string
          new_balance: number
          points_delta: number
          streak: number
          tier: string
        }[]
      }
      get_loyalty_ledger_secure: {
        Args: { p_account_id: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "loyalty_ledger"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_next_order_number: { Args: never; Returns: number }
      health_ping: {
        Args: never
        Returns: {
          server_time: string
          status: string
        }[]
      }
      increment_promo_usage_if_available: {
        Args: { p_promo_id: string }
        Returns: boolean
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_admin_uid: { Args: { uid: string }; Returns: boolean }
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
        Args: { p_admin_id: string; p_points: number; p_user_id: string }
        Returns: Json
      }
      rotate_daily_campaigns: { Args: never; Returns: undefined }
      rotate_featured_growth_campaigns: {
        Args: { target_placement?: string }
        Returns: {
          featured_campaign_id: string
          placement: string
          rotated_at: string
          was_manual_override: boolean
        }[]
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
      v2_award_points:
        | {
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
        | {
            Args: {
              p_account_id: string
              p_admin_id: string
              p_amount_cents: number
              p_idempotency_key: string
              p_reference_id: string
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
      menu_category:
        | "appetizers"
        | "entrees"
        | "desserts"
        | "drinks"
        | "lunch"
        | "breakfast"
        | "specials"
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
    Enums: {
      menu_category: [
        "appetizers",
        "entrees",
        "desserts",
        "drinks",
        "lunch",
        "breakfast",
        "specials",
      ],
    },
  },
} as const
