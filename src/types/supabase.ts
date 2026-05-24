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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
      checkout_challenges: {
        Row: {
          attempt_count: number
          consumed_at: string | null
          expires_at: string
          id: string
          identity_key: string
          issued_at: string
          nonce: string
          phone_e164: string
        }
        Insert: {
          attempt_count?: number
          consumed_at?: string | null
          expires_at: string
          id?: string
          identity_key: string
          issued_at?: string
          nonce: string
          phone_e164: string
        }
        Update: {
          attempt_count?: number
          consumed_at?: string | null
          expires_at?: string
          id?: string
          identity_key?: string
          issued_at?: string
          nonce?: string
          phone_e164?: string
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
      checkout_risk_events: {
        Row: {
          created_at: string
          device_fingerprint: string | null
          guest_email: string | null
          id: number
          request_ip: string | null
          risk_action: string | null
          risk_score: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint?: string | null
          guest_email?: string | null
          id?: never
          request_ip?: string | null
          risk_action?: string | null
          risk_score?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string | null
          guest_email?: string | null
          id?: never
          request_ip?: string | null
          risk_action?: string | null
          risk_score?: number | null
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
            referencedRelation: "menu_items_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_of_goods_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: true
            referencedRelation: "menu_items_with_modifiers"
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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
          applies_to_category:
            | Database["public"]["Enums"]["menu_category"]
            | null
          applies_to_order_type: string | null
          auto_apply: boolean
          badge: string | null
          budget_cents: number | null
          campaign_name: string | null
          channel: string | null
          created_at: string | null
          cta_label: string | null
          deal_price_cents: number | null
          deal_type: string | null
          deep_link: string | null
          discount_cents: number | null
          discount_percent: number | null
          eligible_for_rotation: boolean
          ends_at: string | null
          featured_for_date: string | null
          hero_subtitle: string | null
          hero_title: string | null
          id: string
          is_featured: boolean | null
          max_redemptions: number | null
          menu_item_id: string | null
          name: string | null
          per_user_limit: number | null
          placement: string | null
          pricing_priority: number
          priority: number | null
          promo_id: string | null
          revenue_cents: number | null
          spent_cents: number | null
          stackable: boolean
          starts_at: string | null
          status: string | null
          updated_at: string | null
          weight: number | null
        }
        Insert: {
          active?: boolean
          applies_to_category?:
            | Database["public"]["Enums"]["menu_category"]
            | null
          applies_to_order_type?: string | null
          auto_apply?: boolean
          badge?: string | null
          budget_cents?: number | null
          campaign_name?: string | null
          channel?: string | null
          created_at?: string | null
          cta_label?: string | null
          deal_price_cents?: number | null
          deal_type?: string | null
          deep_link?: string | null
          discount_cents?: number | null
          discount_percent?: number | null
          eligible_for_rotation?: boolean
          ends_at?: string | null
          featured_for_date?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_featured?: boolean | null
          max_redemptions?: number | null
          menu_item_id?: string | null
          name?: string | null
          per_user_limit?: number | null
          placement?: string | null
          pricing_priority?: number
          priority?: number | null
          promo_id?: string | null
          revenue_cents?: number | null
          spent_cents?: number | null
          stackable?: boolean
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Update: {
          active?: boolean
          applies_to_category?:
            | Database["public"]["Enums"]["menu_category"]
            | null
          applies_to_order_type?: string | null
          auto_apply?: boolean
          badge?: string | null
          budget_cents?: number | null
          campaign_name?: string | null
          channel?: string | null
          created_at?: string | null
          cta_label?: string | null
          deal_price_cents?: number | null
          deal_type?: string | null
          deep_link?: string | null
          discount_cents?: number | null
          discount_percent?: number | null
          eligible_for_rotation?: boolean
          ends_at?: string | null
          featured_for_date?: string | null
          hero_subtitle?: string | null
          hero_title?: string | null
          id?: string
          is_featured?: boolean | null
          max_redemptions?: number | null
          menu_item_id?: string | null
          name?: string | null
          per_user_limit?: number | null
          placement?: string | null
          pricing_priority?: number
          priority?: number | null
          promo_id?: string | null
          revenue_cents?: number | null
          spent_cents?: number | null
          stackable?: boolean
          starts_at?: string | null
          status?: string | null
          updated_at?: string | null
          weight?: number | null
        }
        Relationships: []
      }
      guest_order_recovery_codes: {
        Row: {
          attempt_count: number
          code_hash: string
          consumed_at: string | null
          contact_hash: string
          created_at: string
          expires_at: string
          id: string
          order_id: string
        }
        Insert: {
          attempt_count?: number
          code_hash: string
          consumed_at?: string | null
          contact_hash: string
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
        }
        Update: {
          attempt_count?: number
          code_hash?: string
          consumed_at?: string | null
          contact_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
        }
        Relationships: []
      }
      guest_rate_limits: {
        Row: {
          blocked_until: string | null
          ip_hash: string
          overrun_count: number
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          blocked_until?: string | null
          ip_hash: string
          overrun_count?: number
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          blocked_until?: string | null
          ip_hash?: string
          overrun_count?: number
          request_count?: number
          updated_at?: string
          window_start?: string
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
      loyalty_redemptions: {
        Row: {
          account_id: string
          applied_at: string | null
          created_at: string
          discount_cents: number
          id: string
          idempotency_key: string | null
          ledger_id: string | null
          metadata: Json
          order_id: string | null
          order_item_id: string | null
          points_spent: number
          reward_id: string
          reward_label: string
          status: string
          user_id: string | null
          voided_at: string | null
        }
        Insert: {
          account_id: string
          applied_at?: string | null
          created_at?: string
          discount_cents?: number
          id?: string
          idempotency_key?: string | null
          ledger_id?: string | null
          metadata?: Json
          order_id?: string | null
          order_item_id?: string | null
          points_spent: number
          reward_id: string
          reward_label: string
          status?: string
          user_id?: string | null
          voided_at?: string | null
        }
        Update: {
          account_id?: string
          applied_at?: string | null
          created_at?: string
          discount_cents?: number
          id?: string
          idempotency_key?: string | null
          ledger_id?: string | null
          metadata?: Json
          order_id?: string | null
          order_item_id?: string | null
          points_spent?: number
          reward_id?: string
          reward_label?: string
          status?: string
          user_id?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_redemptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v2_account_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "loyalty_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v2_loyalty_activity"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_ledger_id_fkey"
            columns: ["ledger_id"]
            isOneToOne: false
            referencedRelation: "v2_loyalty_ledger_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_redemptions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
            referencedRelation: "menu_items_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_item_modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items_with_modifiers"
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
          active: boolean | null
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
          sort_order: number
          spicy_level: number | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
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
          sort_order?: number
          spicy_level?: number | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
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
          sort_order?: number
          spicy_level?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      modifier_group_modifiers: {
        Row: {
          id: string
          modifier_group_id: string
          modifier_id: string
          position: number | null
        }
        Insert: {
          id?: string
          modifier_group_id: string
          modifier_id: string
          position?: number | null
        }
        Update: {
          id?: string
          modifier_group_id?: string
          modifier_id?: string
          position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "modifier_group_modifiers_modifier_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_group_modifiers_modifier_id_fkey"
            columns: ["modifier_id"]
            isOneToOne: false
            referencedRelation: "modifiers"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string | null
          id: string
          max_selections: number | null
          min_selections: number | null
          name: string
          required: boolean | null
          sort_order: number | null
          type: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          max_selections?: number | null
          min_selections?: number | null
          name: string
          required?: boolean | null
          sort_order?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string | null
          id?: string
          max_selections?: number | null
          min_selections?: number | null
          name?: string
          required?: boolean | null
          sort_order?: number | null
          type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      modifier_options: {
        Row: {
          available: boolean | null
          created_at: string | null
          id: string
          is_default: boolean | null
          modifier_group_id: string
          name: string
          price_adjustment: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          modifier_group_id: string
          name: string
          price_adjustment?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          modifier_group_id?: string
          name?: string
          price_adjustment?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_modifiers_group"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_modifier_options_group_id_fkey"
            columns: ["modifier_group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      modifiers: {
        Row: {
          available: boolean | null
          created_at: string | null
          id: string
          is_default: boolean | null
          modifier_group_id: string
          name: string
          price_adjustment: number | null
          sort_order: number | null
          updated_at: string | null
        }
        Insert: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          modifier_group_id: string
          name: string
          price_adjustment?: number | null
          sort_order?: number | null
          updated_at?: string | null
        }
        Update: {
          available?: boolean | null
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          modifier_group_id?: string
          name?: string
          price_adjustment?: number | null
          sort_order?: number | null
          updated_at?: string | null
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
      order_dispute_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          dispute_id: string | null
          event_source: Database["public"]["Enums"]["dispute_event_source_enum"]
          event_type: Database["public"]["Enums"]["dispute_event_type_enum"]
          evidence_labels: string[] | null
          evidence_urls: string[] | null
          id: string
          metadata: Json | null
          new_amount_cents: number | null
          new_status: string | null
          note: string | null
          occurred_at: string
          order_id: string
          previous_amount_cents: number | null
          previous_status: string | null
          raw_stripe_event: Json | null
          stripe_event_id: string | null
          stripe_event_type: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          dispute_id?: string | null
          event_source?: Database["public"]["Enums"]["dispute_event_source_enum"]
          event_type: Database["public"]["Enums"]["dispute_event_type_enum"]
          evidence_labels?: string[] | null
          evidence_urls?: string[] | null
          id?: string
          metadata?: Json | null
          new_amount_cents?: number | null
          new_status?: string | null
          note?: string | null
          occurred_at?: string
          order_id: string
          previous_amount_cents?: number | null
          previous_status?: string | null
          raw_stripe_event?: Json | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          dispute_id?: string | null
          event_source?: Database["public"]["Enums"]["dispute_event_source_enum"]
          event_type?: Database["public"]["Enums"]["dispute_event_type_enum"]
          evidence_labels?: string[] | null
          evidence_urls?: string[] | null
          id?: string
          metadata?: Json | null
          new_amount_cents?: number | null
          new_status?: string | null
          note?: string | null
          occurred_at?: string
          order_id?: string
          previous_amount_cents?: number | null
          previous_status?: string | null
          raw_stripe_event?: Json | null
          stripe_event_id?: string | null
          stripe_event_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_dispute_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_dispute_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
      order_fulfillment_evidence: {
        Row: {
          arrived_at_door_at: string | null
          created_at: string
          delivered_at: string | null
          delivery_address_snapshot: Json | null
          delivery_photo_lat: number | null
          delivery_photo_lng: number | null
          delivery_photo_taken_at: string | null
          delivery_photo_url: string | null
          dispatched_at: string | null
          driver_id: string | null
          driver_name: string | null
          driver_phone: string | null
          evidence_completeness_score: number
          evidence_status: Database["public"]["Enums"]["fulfillment_evidence_status_enum"]
          flagged_at: string | null
          flagged_by: string | null
          flagged_reason: string | null
          fulfillment_type: Database["public"]["Enums"]["fulfillment_type_enum"]
          geofence_check_passed: boolean | null
          gps_accuracy_meters: number | null
          gps_lat: number | null
          gps_lng: number | null
          gps_recorded_at: string | null
          handoff_code: string | null
          handoff_code_verified_at: string | null
          handoff_method: Database["public"]["Enums"]["handoff_method_enum"]
          handoff_notes: string | null
          handoff_type: string | null
          id: string
          left_at_door: boolean
          order_id: string
          out_for_delivery_at: string | null
          picked_up_by_id_verified: boolean
          picked_up_by_name: string | null
          pickup_notes: string | null
          pickup_pin: string | null
          pickup_pin_verified_at: string | null
          pickup_station: string | null
          raw_driver_payload: Json | null
          recipient_name: string | null
          recipient_verified: boolean
          safe_place_description: string | null
          signature_captured_at: string | null
          signature_ip: unknown
          signature_url: string | null
          staff_verified_at: string | null
          staff_verified_by: string | null
          updated_at: string
          vehicle_description: string | null
        }
        Insert: {
          arrived_at_door_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_address_snapshot?: Json | null
          delivery_photo_lat?: number | null
          delivery_photo_lng?: number | null
          delivery_photo_taken_at?: string | null
          delivery_photo_url?: string | null
          dispatched_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          evidence_completeness_score?: number
          evidence_status?: Database["public"]["Enums"]["fulfillment_evidence_status_enum"]
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          fulfillment_type?: Database["public"]["Enums"]["fulfillment_type_enum"]
          geofence_check_passed?: boolean | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_recorded_at?: string | null
          handoff_code?: string | null
          handoff_code_verified_at?: string | null
          handoff_method?: Database["public"]["Enums"]["handoff_method_enum"]
          handoff_notes?: string | null
          handoff_type?: string | null
          id?: string
          left_at_door?: boolean
          order_id: string
          out_for_delivery_at?: string | null
          picked_up_by_id_verified?: boolean
          picked_up_by_name?: string | null
          pickup_notes?: string | null
          pickup_pin?: string | null
          pickup_pin_verified_at?: string | null
          pickup_station?: string | null
          raw_driver_payload?: Json | null
          recipient_name?: string | null
          recipient_verified?: boolean
          safe_place_description?: string | null
          signature_captured_at?: string | null
          signature_ip?: unknown
          signature_url?: string | null
          staff_verified_at?: string | null
          staff_verified_by?: string | null
          updated_at?: string
          vehicle_description?: string | null
        }
        Update: {
          arrived_at_door_at?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_address_snapshot?: Json | null
          delivery_photo_lat?: number | null
          delivery_photo_lng?: number | null
          delivery_photo_taken_at?: string | null
          delivery_photo_url?: string | null
          dispatched_at?: string | null
          driver_id?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          evidence_completeness_score?: number
          evidence_status?: Database["public"]["Enums"]["fulfillment_evidence_status_enum"]
          flagged_at?: string | null
          flagged_by?: string | null
          flagged_reason?: string | null
          fulfillment_type?: Database["public"]["Enums"]["fulfillment_type_enum"]
          geofence_check_passed?: boolean | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          gps_recorded_at?: string | null
          handoff_code?: string | null
          handoff_code_verified_at?: string | null
          handoff_method?: Database["public"]["Enums"]["handoff_method_enum"]
          handoff_notes?: string | null
          handoff_type?: string | null
          id?: string
          left_at_door?: boolean
          order_id?: string
          out_for_delivery_at?: string | null
          picked_up_by_id_verified?: boolean
          picked_up_by_name?: string | null
          pickup_notes?: string | null
          pickup_pin?: string | null
          pickup_pin_verified_at?: string | null
          pickup_station?: string | null
          raw_driver_payload?: Json | null
          recipient_name?: string | null
          recipient_verified?: boolean
          safe_place_description?: string | null
          signature_captured_at?: string | null
          signature_ip?: unknown
          signature_url?: string | null
          staff_verified_at?: string | null
          staff_verified_by?: string | null
          updated_at?: string
          vehicle_description?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillment_evidence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_flagged_by_fkey"
            columns: ["flagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_staff_verified_by_fkey"
            columns: ["staff_verified_by"]
            isOneToOne: false
            referencedRelation: "loyalty_leaderboard"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_evidence_staff_verified_by_fkey"
            columns: ["staff_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
      order_payment_details: {
        Row: {
          avs_line1_check: Database["public"]["Enums"]["avs_check_enum"]
          balance_transaction_id: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_country: string | null
          billing_name: string | null
          billing_postal_code: string | null
          billing_state: string | null
          card_brand: string | null
          card_country: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_network: string | null
          charge_id: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          cvc_check: Database["public"]["Enums"]["cvc_check_enum"]
          device_fingerprint: string | null
          dispute_amount_cents: number | null
          dispute_closed_at: string | null
          dispute_due_by: string | null
          dispute_evidence_status: Database["public"]["Enums"]["evidence_status_enum"]
          dispute_id: string | null
          dispute_network_reason_code: string | null
          dispute_opened_at: string | null
          dispute_outcome: string | null
          dispute_reason: string | null
          funding: Database["public"]["Enums"]["card_funding_enum"]
          id: string
          ip_address: unknown
          ip_country: string | null
          last_refund_at: string | null
          last_refund_reason: string | null
          net_payout_cents: number | null
          order_id: string
          payment_intent_id: string
          payment_method_id: string | null
          postal_check: Database["public"]["Enums"]["avs_check_enum"]
          radar_outcome: string | null
          radar_rule_id: string | null
          raw_charge_snapshot: Json | null
          raw_dispute_snapshot: Json | null
          refund_ids: string[] | null
          risk_level: Database["public"]["Enums"]["risk_level_enum"]
          risk_score: number | null
          session_id: string | null
          stripe_fee_cents: number
          stripe_fee_tax_cents: number
          three_d_secure_result: Database["public"]["Enums"]["three_ds_result_enum"]
          three_d_secure_version: string | null
          updated_at: string
          user_agent: string | null
          wallet_type: string | null
        }
        Insert: {
          avs_line1_check?: Database["public"]["Enums"]["avs_check_enum"]
          balance_transaction_id?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_state?: string | null
          card_brand?: string | null
          card_country?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_network?: string | null
          charge_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          cvc_check?: Database["public"]["Enums"]["cvc_check_enum"]
          device_fingerprint?: string | null
          dispute_amount_cents?: number | null
          dispute_closed_at?: string | null
          dispute_due_by?: string | null
          dispute_evidence_status?: Database["public"]["Enums"]["evidence_status_enum"]
          dispute_id?: string | null
          dispute_network_reason_code?: string | null
          dispute_opened_at?: string | null
          dispute_outcome?: string | null
          dispute_reason?: string | null
          funding?: Database["public"]["Enums"]["card_funding_enum"]
          id?: string
          ip_address?: unknown
          ip_country?: string | null
          last_refund_at?: string | null
          last_refund_reason?: string | null
          net_payout_cents?: number | null
          order_id: string
          payment_intent_id: string
          payment_method_id?: string | null
          postal_check?: Database["public"]["Enums"]["avs_check_enum"]
          radar_outcome?: string | null
          radar_rule_id?: string | null
          raw_charge_snapshot?: Json | null
          raw_dispute_snapshot?: Json | null
          refund_ids?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"]
          risk_score?: number | null
          session_id?: string | null
          stripe_fee_cents?: number
          stripe_fee_tax_cents?: number
          three_d_secure_result?: Database["public"]["Enums"]["three_ds_result_enum"]
          three_d_secure_version?: string | null
          updated_at?: string
          user_agent?: string | null
          wallet_type?: string | null
        }
        Update: {
          avs_line1_check?: Database["public"]["Enums"]["avs_check_enum"]
          balance_transaction_id?: string | null
          billing_address_line1?: string | null
          billing_address_line2?: string | null
          billing_city?: string | null
          billing_country?: string | null
          billing_name?: string | null
          billing_postal_code?: string | null
          billing_state?: string | null
          card_brand?: string | null
          card_country?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_fingerprint?: string | null
          card_last4?: string | null
          card_network?: string | null
          charge_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_phone?: string | null
          cvc_check?: Database["public"]["Enums"]["cvc_check_enum"]
          device_fingerprint?: string | null
          dispute_amount_cents?: number | null
          dispute_closed_at?: string | null
          dispute_due_by?: string | null
          dispute_evidence_status?: Database["public"]["Enums"]["evidence_status_enum"]
          dispute_id?: string | null
          dispute_network_reason_code?: string | null
          dispute_opened_at?: string | null
          dispute_outcome?: string | null
          dispute_reason?: string | null
          funding?: Database["public"]["Enums"]["card_funding_enum"]
          id?: string
          ip_address?: unknown
          ip_country?: string | null
          last_refund_at?: string | null
          last_refund_reason?: string | null
          net_payout_cents?: number | null
          order_id?: string
          payment_intent_id?: string
          payment_method_id?: string | null
          postal_check?: Database["public"]["Enums"]["avs_check_enum"]
          radar_outcome?: string | null
          radar_rule_id?: string | null
          raw_charge_snapshot?: Json | null
          raw_dispute_snapshot?: Json | null
          refund_ids?: string[] | null
          risk_level?: Database["public"]["Enums"]["risk_level_enum"]
          risk_score?: number | null
          session_id?: string | null
          stripe_fee_cents?: number
          stripe_fee_tax_cents?: number
          three_d_secure_result?: Database["public"]["Enums"]["three_ds_result_enum"]
          three_d_secure_version?: string | null
          updated_at?: string
          user_agent?: string | null
          wallet_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_payment_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_payment_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_payment_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_payment_details_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_payment_details_order_id_fkey"
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
          amount_received_cents: number
          amount_shipping: number
          amount_subtotal: number
          amount_tax: number
          amount_total: number
          assigned_to: string | null
          campaign_discount_cents: number
          cart_items: Json | null
          charge_captured_at: string | null
          created_at: string
          credit_cents: number
          credit_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_uid: string | null
          delivery_fee_cents: number
          discount_cents: number
          dispute_amount_cents: number | null
          dispute_due_by: string | null
          dispute_reason: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status_enum"]
          disputed_at: string | null
          fulfillment_type: string
          guest_email: string | null
          guest_phone_e164: string | null
          guest_token: string | null
          id: string
          idempotency_key: string | null
          last_payment_error: string | null
          loyalty_account_id: string | null
          loyalty_discount_cents: number | null
          loyalty_points_redeemed: number | null
          metadata: Json | null
          net_amount_cents: number | null
          notes: string | null
          order_number: number | null
          order_type: string
          payment_failed_at: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type_enum"]
          payment_status: string
          pending_cart_id: string | null
          phone_verified: boolean
          pickup_time: string | null
          pricing_hash: string | null
          pricing_snapshot: Json | null
          promo_discount_cents: number
          promo_id: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          risk_level: string | null
          risk_score: number | null
          service_fee_cents: number
          shipping_address: Json | null
          shipping_name: string | null
          shipping_phone: string | null
          sms_opt_in: boolean
          source: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          subtotal_cents: number
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          amount_received_cents?: number
          amount_shipping?: number
          amount_subtotal?: number
          amount_tax?: number
          amount_total?: number
          assigned_to?: string | null
          campaign_discount_cents?: number
          cart_items?: Json | null
          charge_captured_at?: string | null
          created_at?: string
          credit_cents?: number
          credit_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_uid?: string | null
          delivery_fee_cents?: number
          discount_cents?: number
          dispute_amount_cents?: number | null
          dispute_due_by?: string | null
          dispute_reason?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status_enum"]
          disputed_at?: string | null
          fulfillment_type?: string
          guest_email?: string | null
          guest_phone_e164?: string | null
          guest_token?: string | null
          id?: string
          idempotency_key?: string | null
          last_payment_error?: string | null
          loyalty_account_id?: string | null
          loyalty_discount_cents?: number | null
          loyalty_points_redeemed?: number | null
          metadata?: Json | null
          net_amount_cents?: number | null
          notes?: string | null
          order_number?: number | null
          order_type?: string
          payment_failed_at?: string | null
          payment_method_type?: Database["public"]["Enums"]["payment_method_type_enum"]
          payment_status?: string
          pending_cart_id?: string | null
          phone_verified?: boolean
          pickup_time?: string | null
          pricing_hash?: string | null
          pricing_snapshot?: Json | null
          promo_discount_cents?: number
          promo_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          risk_level?: string | null
          risk_score?: number | null
          service_fee_cents?: number
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_phone?: string | null
          sms_opt_in?: boolean
          source?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id: string
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          amount_received_cents?: number
          amount_shipping?: number
          amount_subtotal?: number
          amount_tax?: number
          amount_total?: number
          assigned_to?: string | null
          campaign_discount_cents?: number
          cart_items?: Json | null
          charge_captured_at?: string | null
          created_at?: string
          credit_cents?: number
          credit_id?: string | null
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_uid?: string | null
          delivery_fee_cents?: number
          discount_cents?: number
          dispute_amount_cents?: number | null
          dispute_due_by?: string | null
          dispute_reason?: string | null
          dispute_status?: Database["public"]["Enums"]["dispute_status_enum"]
          disputed_at?: string | null
          fulfillment_type?: string
          guest_email?: string | null
          guest_phone_e164?: string | null
          guest_token?: string | null
          id?: string
          idempotency_key?: string | null
          last_payment_error?: string | null
          loyalty_account_id?: string | null
          loyalty_discount_cents?: number | null
          loyalty_points_redeemed?: number | null
          metadata?: Json | null
          net_amount_cents?: number | null
          notes?: string | null
          order_number?: number | null
          order_type?: string
          payment_failed_at?: string | null
          payment_method_type?: Database["public"]["Enums"]["payment_method_type_enum"]
          payment_status?: string
          pending_cart_id?: string | null
          phone_verified?: boolean
          pickup_time?: string | null
          pricing_hash?: string | null
          pricing_snapshot?: Json | null
          promo_discount_cents?: number
          promo_id?: string | null
          refunded_amount_cents?: number
          refunded_at?: string | null
          risk_level?: string | null
          risk_score?: number | null
          service_fee_cents?: number
          shipping_address?: Json | null
          shipping_name?: string | null
          shipping_phone?: string | null
          sms_opt_in?: boolean
          source?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_checkout_session_id?: string | null
          stripe_customer_id?: string | null
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_session_id?: string
          subtotal_cents?: number
          tax_cents?: number
          tip_cents?: number
          total_cents?: number
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_pending_cart_id_fkey"
            columns: ["pending_cart_id"]
            isOneToOne: false
            referencedRelation: "pending_carts"
            referencedColumns: ["id"]
          },
        ]
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
          consumed_at: string | null
          created_at: string | null
          credit_id: string | null
          currency: string
          discount_cents: number
          expires_at: string | null
          guest_email: string | null
          guest_token: string | null
          id: string
          idempotency_key: string | null
          items: Json
          loyalty_account_id: string | null
          loyalty_discount_cents: number | null
          loyalty_reserved_points: number | null
          pickup_time: string | null
          pricing_hash: string | null
          pricing_snapshot: Json
          promo_id: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          tax_cents: number
          total_cents: number
          user_id: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string | null
          credit_id?: string | null
          currency?: string
          discount_cents?: number
          expires_at?: string | null
          guest_email?: string | null
          guest_token?: string | null
          id?: string
          idempotency_key?: string | null
          items: Json
          loyalty_account_id?: string | null
          loyalty_discount_cents?: number | null
          loyalty_reserved_points?: number | null
          pickup_time?: string | null
          pricing_hash?: string | null
          pricing_snapshot?: Json
          promo_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          user_id?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string | null
          credit_id?: string | null
          currency?: string
          discount_cents?: number
          expires_at?: string | null
          guest_email?: string | null
          guest_token?: string | null
          id?: string
          idempotency_key?: string | null
          items?: Json
          loyalty_account_id?: string | null
          loyalty_discount_cents?: number | null
          loyalty_reserved_points?: number | null
          pickup_time?: string | null
          pricing_hash?: string | null
          pricing_snapshot?: Json
          promo_id?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          tax_cents?: number
          total_cents?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_carts_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_carts_loyalty_account_id_fkey"
            columns: ["loyalty_account_id"]
            isOneToOne: false
            referencedRelation: "v2_account_summary"
            referencedColumns: ["id"]
          },
        ]
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
      restaurant_ordering_settings: {
        Row: {
          id: string
          online_ordering_enabled: boolean
          pause_message: string
          updated_at: string
        }
        Insert: {
          id?: string
          online_ordering_enabled?: boolean
          pause_message?: string
          updated_at?: string
        }
        Update: {
          id?: string
          online_ordering_enabled?: boolean
          pause_message?: string
          updated_at?: string
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
      sms_log: {
        Row: {
          created_at: string
          error: string | null
          event: string
          id: string
          order_id: string
          phone_suffix: string
          status: string
          twilio_sid: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event: string
          id?: string
          order_id: string
          phone_suffix: string
          status: string
          twilio_sid?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event?: string
          id?: string
          order_id?: string
          phone_suffix?: string
          status?: string
          twilio_sid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "sms_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_verify_attempts: {
        Row: {
          created_at: string
          id: string
          phone_hash: string
        }
        Insert: {
          created_at?: string
          id?: string
          phone_hash: string
        }
        Update: {
          created_at?: string
          id?: string
          phone_hash?: string
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
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
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
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          handler_error: string | null
          processed_at: string
          status: string
        }
        Insert: {
          event_id: string
          event_type: string
          handler_error?: string | null
          processed_at?: string
          status?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          handler_error?: string | null
          processed_at?: string
          status?: string
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
      admin_dispute_timeline: {
        Row: {
          actor_name: string | null
          actor_role: string | null
          dispute_due_by: string | null
          dispute_id: string | null
          dispute_status:
            | Database["public"]["Enums"]["dispute_status_enum"]
            | null
          event_source:
            | Database["public"]["Enums"]["dispute_event_source_enum"]
            | null
          event_type:
            | Database["public"]["Enums"]["dispute_event_type_enum"]
            | null
          evidence_labels: string[] | null
          evidence_urls: string[] | null
          id: string | null
          metadata: Json | null
          new_amount_cents: number | null
          new_status: string | null
          note: string | null
          occurred_at: string | null
          order_id: string | null
          previous_amount_cents: number | null
          previous_status: string | null
          stripe_payment_intent_id: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "admin_tax_order_breakdown"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "financial_revenue_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_performance"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_timeline"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_dispute_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
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
      admin_tax_daily_summary: {
        Row: {
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          disputed_orders_count: number | null
          gross_sales_cents: number | null
          gross_total_cents: number | null
          net_sales_cents: number | null
          net_tax_cents: number | null
          orders_count: number | null
          refunded_orders_count: number | null
          refunded_sales_cents: number | null
          refunded_tax_cents: number | null
          report_date: string | null
          service_fee_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
          total_stripe_fees_cents: number | null
        }
        Relationships: []
      }
      admin_tax_daily_summary_mat: {
        Row: {
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          disputed_orders_count: number | null
          gross_sales_cents: number | null
          gross_total_cents: number | null
          net_sales_cents: number | null
          net_tax_cents: number | null
          orders_count: number | null
          refunded_orders_count: number | null
          refunded_sales_cents: number | null
          refunded_tax_cents: number | null
          report_date: string | null
          service_fee_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
          total_stripe_fees_cents: number | null
        }
        Relationships: []
      }
      admin_tax_monthly_summary: {
        Row: {
          active_days: number | null
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          disputed_orders_count: number | null
          effective_tax_rate_pct: number | null
          gross_sales_cents: number | null
          gross_total_cents: number | null
          net_sales_cents: number | null
          net_tax_cents: number | null
          orders_count: number | null
          refunded_orders_count: number | null
          refunded_sales_cents: number | null
          refunded_tax_cents: number | null
          report_month: string | null
          report_month_label: string | null
          service_fee_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
          total_stripe_fees_cents: number | null
        }
        Relationships: []
      }
      admin_tax_order_breakdown: {
        Row: {
          captured_date: string | null
          card_brand: string | null
          card_funding: Database["public"]["Enums"]["card_funding_enum"] | null
          charge_captured_at: string | null
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          dispute_status:
            | Database["public"]["Enums"]["dispute_status_enum"]
            | null
          fulfillment_type: string | null
          gross_total_cents: number | null
          is_disputed: boolean | null
          net_tax_cents: number | null
          net_total_cents: number | null
          order_created_at: string | null
          order_id: string | null
          payment_status: string | null
          refunded_amount_cents: number | null
          refunded_tax_estimate_cents: number | null
          service_fee_cents: number | null
          status: string | null
          stripe_charge_id: string | null
          stripe_fee_cents: number | null
          stripe_payment_intent_id: string | null
          subtotal_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
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
      menu_items_view: {
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
        Relationships: []
      }
      menu_items_with_modifiers: {
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
          fulfillment_type: string | null
          order_id: string | null
          order_number: number | null
          order_type: string | null
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
      admin_get_tax_daily_rows: {
        Args: {
          date_from?: string
          date_to?: string
          p_currency?: string
          use_cache?: boolean
        }
        Returns: {
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          disputed_orders_count: number | null
          gross_sales_cents: number | null
          gross_total_cents: number | null
          net_sales_cents: number | null
          net_tax_cents: number | null
          orders_count: number | null
          refunded_orders_count: number | null
          refunded_sales_cents: number | null
          refunded_tax_cents: number | null
          report_date: string | null
          service_fee_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
          total_stripe_fees_cents: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_tax_daily_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_tax_export: {
        Args: {
          date_from: string
          date_to: string
          granularity: string
          p_currency: string
        }
        Returns: Json
      }
      admin_get_tax_monthly_rows: {
        Args: { month_from?: string; month_to?: string; p_currency?: string }
        Returns: {
          active_days: number | null
          currency: string | null
          delivery_fee_cents: number | null
          discount_cents: number | null
          disputed_orders_count: number | null
          effective_tax_rate_pct: number | null
          gross_sales_cents: number | null
          gross_total_cents: number | null
          net_sales_cents: number | null
          net_tax_cents: number | null
          orders_count: number | null
          refunded_orders_count: number | null
          refunded_sales_cents: number | null
          refunded_tax_cents: number | null
          report_month: string | null
          report_month_label: string | null
          service_fee_cents: number | null
          tax_collected_cents: number | null
          taxable_sales_cents: number | null
          tip_cents: number | null
          total_stripe_fees_cents: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_tax_monthly_summary"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_get_tax_orders: {
        Args: {
          date_from?: string
          date_to?: string
          disputed_only?: boolean
          fulfillment_filter?: string
          p_currency?: string
          page_offset?: number
          page_size?: number
          refunded_only?: boolean
        }
        Returns: {
          captured_date: string
          card_brand: string
          charge_captured_at: string
          discount_cents: number
          dispute_status: string
          fulfillment_type: string
          gross_total_cents: number
          is_disputed: boolean
          net_tax_cents: number
          net_total_cents: number
          order_id: string
          payment_status: string
          refunded_amount_cents: number
          refunded_tax_estimate_cents: number
          stripe_payment_intent_id: string
          subtotal_cents: number
          tax_collected_cents: number
          taxable_sales_cents: number
          tip_cents: number
          total_rows: number
        }[]
      }
      admin_get_tax_summary: {
        Args: {
          date_from?: string
          date_to?: string
          p_currency?: string
          use_cache?: boolean
        }
        Returns: Database["public"]["CompositeTypes"]["tax_summary_result"]
        SetofOptions: {
          from: "*"
          to: "tax_summary_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_get_tax_ytd: {
        Args: { p_currency?: string; p_year?: number }
        Returns: Database["public"]["CompositeTypes"]["tax_summary_result"]
        SetofOptions: {
          from: "*"
          to: "tax_summary_result"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      award_loyalty_points: {
        Args: { p_amount_cents: number; p_order_id: string; p_user_id: string }
        Returns: Json
      }
      check_guest_rate_limit: {
        Args: {
          p_block_duration_ms?: number
          p_ip_hash: string
          p_max_requests?: number
          p_overrun_limit?: number
          p_window_ms?: number
        }
        Returns: {
          allowed: boolean
          reason: string
          retry_after_ms: number
        }[]
      }
      cleanup_pending_carts: { Args: never; Returns: undefined }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_admin_layout_snapshot: { Args: never; Returns: Json }
      get_evidence_summary: { Args: { p_order_id: string }; Returns: Json }
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
      get_menu_item_public: { Args: { p_item_id: string }; Returns: Json }
      get_menu_items: {
        Args: never
        Returns: {
          allergens: string[]
          available: boolean
          category: string
          description: string
          featured: boolean
          id: string
          image_url: string
          is_gluten_free: boolean
          is_vegan: boolean
          is_vegetarian: boolean
          modifier_groups: Json
          name: string
          pairs_with: string
          price: number
          sort_order: number
          spicy_level: number
        }[]
      }
      get_menu_public: { Args: never; Returns: Json }
      get_next_order_number: { Args: never; Returns: number }
      get_order_dispute_timeline: {
        Args: { p_order_id: string }
        Returns: {
          actor_name: string | null
          actor_role: string | null
          dispute_due_by: string | null
          dispute_id: string | null
          dispute_status:
            | Database["public"]["Enums"]["dispute_status_enum"]
            | null
          event_source:
            | Database["public"]["Enums"]["dispute_event_source_enum"]
            | null
          event_type:
            | Database["public"]["Enums"]["dispute_event_type_enum"]
            | null
          evidence_labels: string[] | null
          evidence_urls: string[] | null
          id: string | null
          metadata: Json | null
          new_amount_cents: number | null
          new_status: string | null
          note: string | null
          occurred_at: string | null
          order_id: string | null
          previous_amount_cents: number | null
          previous_status: string | null
          stripe_payment_intent_id: string | null
          total_cents: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_dispute_timeline"
          isOneToOne: false
          isSetofReturn: true
        }
      }
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
      insert_dispute_event: {
        Args: {
          p_actor_id?: string
          p_actor_name?: string
          p_actor_role?: string
          p_dispute_id?: string
          p_event_source?: Database["public"]["Enums"]["dispute_event_source_enum"]
          p_event_type?: Database["public"]["Enums"]["dispute_event_type_enum"]
          p_evidence_labels?: string[]
          p_evidence_urls?: string[]
          p_metadata?: Json
          p_new_amount_cents?: number
          p_new_status?: string
          p_note?: string
          p_occurred_at?: string
          p_order_id: string
          p_previous_amount_cents?: number
          p_previous_status?: string
          p_raw_stripe_event?: Json
          p_stripe_event_id?: string
          p_stripe_event_type?: string
        }
        Returns: {
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          dispute_id: string | null
          event_source: Database["public"]["Enums"]["dispute_event_source_enum"]
          event_type: Database["public"]["Enums"]["dispute_event_type_enum"]
          evidence_labels: string[] | null
          evidence_urls: string[] | null
          id: string
          metadata: Json | null
          new_amount_cents: number | null
          new_status: string | null
          note: string | null
          occurred_at: string
          order_id: string
          previous_amount_cents: number | null
          previous_status: string | null
          raw_stripe_event: Json | null
          stripe_event_id: string | null
          stripe_event_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "order_dispute_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_admin_uid: { Args: { uid: string }; Returns: boolean }
      is_tax_eligible_status: {
        Args: { payment_status: string }
        Returns: boolean
      }
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
      refresh_tax_daily_summary: { Args: never; Returns: undefined }
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
          amount_received_cents: number
          amount_shipping: number
          amount_subtotal: number
          amount_tax: number
          amount_total: number
          assigned_to: string | null
          campaign_discount_cents: number
          cart_items: Json | null
          charge_captured_at: string | null
          created_at: string
          credit_cents: number
          credit_id: string | null
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_uid: string | null
          delivery_fee_cents: number
          discount_cents: number
          dispute_amount_cents: number | null
          dispute_due_by: string | null
          dispute_reason: string | null
          dispute_status: Database["public"]["Enums"]["dispute_status_enum"]
          disputed_at: string | null
          fulfillment_type: string
          guest_email: string | null
          guest_phone_e164: string | null
          guest_token: string | null
          id: string
          idempotency_key: string | null
          last_payment_error: string | null
          loyalty_account_id: string | null
          loyalty_discount_cents: number | null
          loyalty_points_redeemed: number | null
          metadata: Json | null
          net_amount_cents: number | null
          notes: string | null
          order_number: number | null
          order_type: string
          payment_failed_at: string | null
          payment_method_type: Database["public"]["Enums"]["payment_method_type_enum"]
          payment_status: string
          pending_cart_id: string | null
          phone_verified: boolean
          pickup_time: string | null
          pricing_hash: string | null
          pricing_snapshot: Json | null
          promo_discount_cents: number
          promo_id: string | null
          refunded_amount_cents: number
          refunded_at: string | null
          risk_level: string | null
          risk_score: number | null
          service_fee_cents: number
          shipping_address: Json | null
          shipping_name: string | null
          shipping_phone: string | null
          sms_opt_in: boolean
          source: string | null
          status: string
          stripe_charge_id: string | null
          stripe_checkout_session_id: string | null
          stripe_customer_id: string | null
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          stripe_session_id: string
          subtotal_cents: number
          tax_cents: number
          tip_cents: number
          total_cents: number
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_order_payment_details: {
        Args: {
          p_avs_line1_check?: Database["public"]["Enums"]["avs_check_enum"]
          p_balance_transaction_id?: string
          p_billing_country?: string
          p_billing_name?: string
          p_billing_postal_code?: string
          p_card_brand?: string
          p_card_country?: string
          p_card_fingerprint?: string
          p_card_last4?: string
          p_charge_id?: string
          p_customer_email?: string
          p_customer_phone?: string
          p_cvc_check?: Database["public"]["Enums"]["cvc_check_enum"]
          p_dispute_amount_cents?: number
          p_dispute_due_by?: string
          p_dispute_evidence_status?: Database["public"]["Enums"]["evidence_status_enum"]
          p_dispute_id?: string
          p_dispute_reason?: string
          p_funding?: Database["public"]["Enums"]["card_funding_enum"]
          p_ip_address?: unknown
          p_order_id: string
          p_payment_intent_id: string
          p_payment_method_id?: string
          p_postal_check?: Database["public"]["Enums"]["avs_check_enum"]
          p_raw_charge_snapshot?: Json
          p_raw_dispute_snapshot?: Json
          p_risk_level?: Database["public"]["Enums"]["risk_level_enum"]
          p_risk_score?: number
          p_stripe_fee_cents?: number
          p_three_d_secure_result?: Database["public"]["Enums"]["three_ds_result_enum"]
          p_wallet_type?: string
        }
        Returns: {
          avs_line1_check: Database["public"]["Enums"]["avs_check_enum"]
          balance_transaction_id: string | null
          billing_address_line1: string | null
          billing_address_line2: string | null
          billing_city: string | null
          billing_country: string | null
          billing_name: string | null
          billing_postal_code: string | null
          billing_state: string | null
          card_brand: string | null
          card_country: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_fingerprint: string | null
          card_last4: string | null
          card_network: string | null
          charge_id: string | null
          created_at: string
          customer_email: string | null
          customer_phone: string | null
          cvc_check: Database["public"]["Enums"]["cvc_check_enum"]
          device_fingerprint: string | null
          dispute_amount_cents: number | null
          dispute_closed_at: string | null
          dispute_due_by: string | null
          dispute_evidence_status: Database["public"]["Enums"]["evidence_status_enum"]
          dispute_id: string | null
          dispute_network_reason_code: string | null
          dispute_opened_at: string | null
          dispute_outcome: string | null
          dispute_reason: string | null
          funding: Database["public"]["Enums"]["card_funding_enum"]
          id: string
          ip_address: unknown
          ip_country: string | null
          last_refund_at: string | null
          last_refund_reason: string | null
          net_payout_cents: number | null
          order_id: string
          payment_intent_id: string
          payment_method_id: string | null
          postal_check: Database["public"]["Enums"]["avs_check_enum"]
          radar_outcome: string | null
          radar_rule_id: string | null
          raw_charge_snapshot: Json | null
          raw_dispute_snapshot: Json | null
          refund_ids: string[] | null
          risk_level: Database["public"]["Enums"]["risk_level_enum"]
          risk_score: number | null
          session_id: string | null
          stripe_fee_cents: number
          stripe_fee_tax_cents: number
          three_d_secure_result: Database["public"]["Enums"]["three_ds_result_enum"]
          three_d_secure_version: string | null
          updated_at: string
          user_agent: string | null
          wallet_type: string | null
        }
        SetofOptions: {
          from: "*"
          to: "order_payment_details"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      v2_award_points:
        | {
            Args: {
              p_account_id: string
              p_admin_id: string
              p_amount: number
              p_amount_cents: number
              p_base_points: number
              p_idempotency_key: string
              p_reference_id: string
              p_streak: number
              p_streak_mult: number
              p_tier_at_time: string
              p_tier_mult: number
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
      v2_release_loyalty_reserve: {
        Args: { p_reason?: string; p_stripe_session_id: string }
        Returns: {
          new_balance: number
          points_restored: number
          released: boolean
        }[]
      }
      v2_reserve_loyalty_points: {
        Args: {
          p_account_id: string
          p_points: number
          p_points_per_dollar?: number
          p_stripe_session_id: string
          p_user_id: string
        }
        Returns: {
          new_balance: number
          reserved_cents: number
          reserved_points: number
          was_duplicate: boolean
        }[]
      }
    }
    Enums: {
      avs_check_enum: "pass" | "fail" | "unavailable" | "unchecked" | "unknown"
      card_funding_enum: "credit" | "debit" | "prepaid" | "unknown"
      cvc_check_enum: "pass" | "fail" | "unavailable" | "unchecked" | "unknown"
      dispute_event_source_enum:
        | "stripe_webhook"
        | "admin_action"
        | "system"
        | "customer_action"
      dispute_event_type_enum:
        | "dispute_created"
        | "dispute_updated"
        | "dispute_funds_withdrawn"
        | "dispute_funds_reinstated"
        | "dispute_closed"
        | "evidence_submitted"
        | "admin_note_added"
        | "admin_evidence_uploaded"
        | "admin_escalated"
        | "admin_accepted"
        | "admin_reopened"
        | "due_date_reminder"
        | "auto_flagged_high_risk"
        | "evidence_completeness_checked"
      dispute_status_enum:
        | "none"
        | "warning_needs_response"
        | "warning_under_review"
        | "warning_closed"
        | "needs_response"
        | "under_review"
        | "charge_refunded"
        | "won"
        | "lost"
      evidence_status_enum:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "past_due"
        | "won"
        | "lost"
      fulfillment_evidence_status_enum:
        | "pending"
        | "partial"
        | "complete"
        | "flagged"
        | "disputed"
        | "archived"
      fulfillment_type_enum:
        | "pickup"
        | "curbside"
        | "delivery"
        | "dine_in"
        | "drive_through"
        | "ship"
      handoff_method_enum:
        | "pin_verified"
        | "signature"
        | "photo"
        | "staff_confirmed"
        | "driver_confirmed"
        | "contactless"
        | "none"
      menu_category:
        | "appetizers"
        | "entrees"
        | "desserts"
        | "drinks"
        | "lunch"
        | "breakfast"
        | "specials"
      payment_method_type_enum:
        | "card"
        | "apple_pay"
        | "google_pay"
        | "link"
        | "affirm"
        | "afterpay_clearpay"
        | "klarna"
        | "us_bank_account"
        | "cashapp"
        | "unknown"
      payment_status_enum:
        | "pending"
        | "requires_payment_method"
        | "requires_confirmation"
        | "requires_action"
        | "processing"
        | "succeeded"
        | "canceled"
        | "failed"
        | "refunded"
        | "partially_refunded"
      risk_level_enum:
        | "normal"
        | "elevated"
        | "highest"
        | "not_assessed"
        | "unknown"
      three_ds_result_enum:
        | "authenticated"
        | "attempted"
        | "failed"
        | "not_supported"
        | "processing_error"
        | "exempted"
        | "unknown"
    }
    CompositeTypes: {
      tax_summary_result: {
        date_from: string | null
        date_to: string | null
        currency: string | null
        period_days: number | null
        orders_count: number | null
        disputed_orders_count: number | null
        refunded_orders_count: number | null
        gross_sales_cents: number | null
        discount_cents: number | null
        taxable_sales_cents: number | null
        tax_collected_cents: number | null
        tip_cents: number | null
        delivery_fee_cents: number | null
        service_fee_cents: number | null
        gross_total_cents: number | null
        refunded_sales_cents: number | null
        refunded_tax_cents: number | null
        net_sales_cents: number | null
        net_tax_cents: number | null
        total_stripe_fees_cents: number | null
        effective_tax_rate_pct: number | null
        avg_order_cents: number | null
        avg_tax_per_order_cents: number | null
      }
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
      avs_check_enum: ["pass", "fail", "unavailable", "unchecked", "unknown"],
      card_funding_enum: ["credit", "debit", "prepaid", "unknown"],
      cvc_check_enum: ["pass", "fail", "unavailable", "unchecked", "unknown"],
      dispute_event_source_enum: [
        "stripe_webhook",
        "admin_action",
        "system",
        "customer_action",
      ],
      dispute_event_type_enum: [
        "dispute_created",
        "dispute_updated",
        "dispute_funds_withdrawn",
        "dispute_funds_reinstated",
        "dispute_closed",
        "evidence_submitted",
        "admin_note_added",
        "admin_evidence_uploaded",
        "admin_escalated",
        "admin_accepted",
        "admin_reopened",
        "due_date_reminder",
        "auto_flagged_high_risk",
        "evidence_completeness_checked",
      ],
      dispute_status_enum: [
        "none",
        "warning_needs_response",
        "warning_under_review",
        "warning_closed",
        "needs_response",
        "under_review",
        "charge_refunded",
        "won",
        "lost",
      ],
      evidence_status_enum: [
        "not_started",
        "in_progress",
        "submitted",
        "past_due",
        "won",
        "lost",
      ],
      fulfillment_evidence_status_enum: [
        "pending",
        "partial",
        "complete",
        "flagged",
        "disputed",
        "archived",
      ],
      fulfillment_type_enum: [
        "pickup",
        "curbside",
        "delivery",
        "dine_in",
        "drive_through",
        "ship",
      ],
      handoff_method_enum: [
        "pin_verified",
        "signature",
        "photo",
        "staff_confirmed",
        "driver_confirmed",
        "contactless",
        "none",
      ],
      menu_category: [
        "appetizers",
        "entrees",
        "desserts",
        "drinks",
        "lunch",
        "breakfast",
        "specials",
      ],
      payment_method_type_enum: [
        "card",
        "apple_pay",
        "google_pay",
        "link",
        "affirm",
        "afterpay_clearpay",
        "klarna",
        "us_bank_account",
        "cashapp",
        "unknown",
      ],
      payment_status_enum: [
        "pending",
        "requires_payment_method",
        "requires_confirmation",
        "requires_action",
        "processing",
        "succeeded",
        "canceled",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      risk_level_enum: [
        "normal",
        "elevated",
        "highest",
        "not_assessed",
        "unknown",
      ],
      three_ds_result_enum: [
        "authenticated",
        "attempted",
        "failed",
        "not_supported",
        "processing_error",
        "exempted",
        "unknown",
      ],
    },
  },
} as const
