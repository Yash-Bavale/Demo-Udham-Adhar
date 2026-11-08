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
  public: {
    Tables: {
      activity_logs: {
        Row: {
          activity_description: string
          activity_type: string
          application_id: string | null
          created_at: string
          id: string
          lead_id: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          activity_description: string
          activity_type: string
          application_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          activity_description?: string
          activity_type?: string
          application_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          application_id: string | null
          created_at: string
          event_name: string
          id: string
          lead_id: string | null
          metadata: Json
          page_url: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          event_name: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          page_url?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          event_name?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          page_url?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          alert_sound_enabled: boolean | null
          alert_sound_tone: string | null
          alert_sound_volume: number | null
          custom_audio_name: string | null
          custom_audio_url: string | null
          customer_delay_autoclose_minutes: number
          desktop_notifications: boolean | null
          email_provider: string
          id: number
          leads_custom_name: string | null
          leads_custom_url: string | null
          leads_ringtone: string | null
          leads_sound_enabled: boolean | null
          leads_toast_enabled: boolean | null
          orders_custom_name: string | null
          orders_custom_url: string | null
          orders_ringtone: string | null
          orders_sound_enabled: boolean | null
          orders_toast_enabled: boolean | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alert_sound_enabled?: boolean | null
          alert_sound_tone?: string | null
          alert_sound_volume?: number | null
          custom_audio_name?: string | null
          custom_audio_url?: string | null
          customer_delay_autoclose_minutes?: number
          desktop_notifications?: boolean | null
          email_provider?: string
          id?: number
          leads_custom_name?: string | null
          leads_custom_url?: string | null
          leads_ringtone?: string | null
          leads_sound_enabled?: boolean | null
          leads_toast_enabled?: boolean | null
          orders_custom_name?: string | null
          orders_custom_url?: string | null
          orders_ringtone?: string | null
          orders_sound_enabled?: boolean | null
          orders_toast_enabled?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alert_sound_enabled?: boolean | null
          alert_sound_tone?: string | null
          alert_sound_volume?: number | null
          custom_audio_name?: string | null
          custom_audio_url?: string | null
          customer_delay_autoclose_minutes?: number
          desktop_notifications?: boolean | null
          email_provider?: string
          id?: number
          leads_custom_name?: string | null
          leads_custom_url?: string | null
          leads_ringtone?: string | null
          leads_sound_enabled?: boolean | null
          leads_toast_enabled?: boolean | null
          orders_custom_name?: string | null
          orders_custom_url?: string | null
          orders_ringtone?: string | null
          orders_sound_enabled?: boolean | null
          orders_toast_enabled?: boolean | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      application_events: {
        Row: {
          application_id: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          event_type: string
          id: string
          lead_id: string | null
          new_value: string | null
          note: string | null
          old_value: string | null
          staff_name: string
          staff_role: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          event_type: string
          id?: string
          lead_id?: string | null
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          staff_name: string
          staff_role: string
        }
        Update: {
          application_id?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          event_type?: string
          id?: string
          lead_id?: string | null
          new_value?: string | null
          note?: string | null
          old_value?: string | null
          staff_name?: string
          staff_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "application_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      application_links: {
        Row: {
          application_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          lead_id: string
          purpose: string
          token: string
          used_at: string | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          lead_id: string
          purpose: string
          token: string
          used_at?: string | null
        }
        Update: {
          application_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          lead_id?: string
          purpose?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      application_status_history: {
        Row: {
          actor_id: string | null
          application_id: string
          created_at: string
          from_status: string | null
          id: string
          metadata: Json
          reason: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          application_id: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          application_id?: string
          created_at?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          reason?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          active_reason_id: string | null
          active_reason_text: string | null
          application_code: string | null
          application_status: Database["public"]["Enums"]["application_status"]
          assigned_at: string | null
          assigned_to: string | null
          auto_assigned: boolean
          awaiting_govt_started_at: string | null
          cancellation_requested_at: string | null
          certificate_number: string | null
          certificate_uploaded_at: string | null
          closure_next_at: string | null
          closure_reason_code: string | null
          closure_reason_id: string | null
          closure_reason_text: string | null
          closure_remarks: string | null
          closure_stage: Database["public"]["Enums"]["closure_stage"]
          created_at: string
          customer_hold_started_at: string | null
          customer_id: string | null
          deleted_at: string | null
          document_status: string
          documents_deleted_at: string | null
          documents_deleted_reason: string | null
          email_thread_message_id: string | null
          email_thread_subject: string | null
          form_link_sent_at: string | null
          form_link_sent_count: number
          form_status: string
          form_submitted_at: string | null
          fulfilled_at: string | null
          fulfillment_status:
            | Database["public"]["Enums"]["fulfillment_status_enum"]
            | null
          govt_portals_selected: Json | null
          id: string
          is_deleted: boolean | null
          is_hot: boolean
          lead_id: string
          order_status: Database["public"]["Enums"]["order_status_enum"]
          priority: string | null
          refund_approved_at: string | null
          refund_approved_by: string | null
          refund_gateway_ref: string | null
          refund_processed_at: string | null
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          service_id: string | null
          technical_hold_kind: string | null
          technical_hold_started_at: string | null
          updated_at: string
          website_id: string
          workflow_delay_reason: string | null
          workflow_expected_review_at: string | null
          workflow_priority: string | null
          workflow_status: Database["public"]["Enums"]["workflow_status"] | null
        }
        Insert: {
          active_reason_id?: string | null
          active_reason_text?: string | null
          application_code?: string | null
          application_status?: Database["public"]["Enums"]["application_status"]
          assigned_at?: string | null
          assigned_to?: string | null
          auto_assigned?: boolean
          awaiting_govt_started_at?: string | null
          cancellation_requested_at?: string | null
          certificate_number?: string | null
          certificate_uploaded_at?: string | null
          closure_next_at?: string | null
          closure_reason_code?: string | null
          closure_reason_id?: string | null
          closure_reason_text?: string | null
          closure_remarks?: string | null
          closure_stage?: Database["public"]["Enums"]["closure_stage"]
          created_at?: string
          customer_hold_started_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          document_status?: string
          documents_deleted_at?: string | null
          documents_deleted_reason?: string | null
          email_thread_message_id?: string | null
          email_thread_subject?: string | null
          form_link_sent_at?: string | null
          form_link_sent_count?: number
          form_status?: string
          form_submitted_at?: string | null
          fulfilled_at?: string | null
          fulfillment_status?:
            | Database["public"]["Enums"]["fulfillment_status_enum"]
            | null
          govt_portals_selected?: Json | null
          id?: string
          is_deleted?: boolean | null
          is_hot?: boolean
          lead_id: string
          order_status?: Database["public"]["Enums"]["order_status_enum"]
          priority?: string | null
          refund_approved_at?: string | null
          refund_approved_by?: string | null
          refund_gateway_ref?: string | null
          refund_processed_at?: string | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          service_id?: string | null
          technical_hold_kind?: string | null
          technical_hold_started_at?: string | null
          updated_at?: string
          website_id: string
          workflow_delay_reason?: string | null
          workflow_expected_review_at?: string | null
          workflow_priority?: string | null
          workflow_status?:
            | Database["public"]["Enums"]["workflow_status"]
            | null
        }
        Update: {
          active_reason_id?: string | null
          active_reason_text?: string | null
          application_code?: string | null
          application_status?: Database["public"]["Enums"]["application_status"]
          assigned_at?: string | null
          assigned_to?: string | null
          auto_assigned?: boolean
          awaiting_govt_started_at?: string | null
          cancellation_requested_at?: string | null
          certificate_number?: string | null
          certificate_uploaded_at?: string | null
          closure_next_at?: string | null
          closure_reason_code?: string | null
          closure_reason_id?: string | null
          closure_reason_text?: string | null
          closure_remarks?: string | null
          closure_stage?: Database["public"]["Enums"]["closure_stage"]
          created_at?: string
          customer_hold_started_at?: string | null
          customer_id?: string | null
          deleted_at?: string | null
          document_status?: string
          documents_deleted_at?: string | null
          documents_deleted_reason?: string | null
          email_thread_message_id?: string | null
          email_thread_subject?: string | null
          form_link_sent_at?: string | null
          form_link_sent_count?: number
          form_status?: string
          form_submitted_at?: string | null
          fulfilled_at?: string | null
          fulfillment_status?:
            | Database["public"]["Enums"]["fulfillment_status_enum"]
            | null
          govt_portals_selected?: Json | null
          id?: string
          is_deleted?: boolean | null
          is_hot?: boolean
          lead_id?: string
          order_status?: Database["public"]["Enums"]["order_status_enum"]
          priority?: string | null
          refund_approved_at?: string | null
          refund_approved_by?: string | null
          refund_gateway_ref?: string | null
          refund_processed_at?: string | null
          refund_reason?: string | null
          refund_requested_at?: string | null
          refund_requested_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          service_id?: string | null
          technical_hold_kind?: string | null
          technical_hold_started_at?: string | null
          updated_at?: string
          website_id?: string
          workflow_delay_reason?: string | null
          workflow_expected_review_at?: string | null
          workflow_priority?: string | null
          workflow_status?:
            | Database["public"]["Enums"]["workflow_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "applications_active_reason_id_fkey"
            columns: ["active_reason_id"]
            isOneToOne: false
            referencedRelation: "order_close_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_closure_reason_id_fkey"
            columns: ["closure_reason_id"]
            isOneToOne: false
            referencedRelation: "order_close_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "applications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_applications_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fk_applications_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_applications_lead"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_pool: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          last_assigned_at: string | null
          last_lead_assigned_at: string | null
          last_order_assigned_at: string | null
          service_id: string | null
          total_assigned: number
          total_leads_assigned: number
          total_orders_assigned: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_assigned_at?: string | null
          last_lead_assigned_at?: string | null
          last_order_assigned_at?: string | null
          service_id?: string | null
          total_assigned?: number
          total_leads_assigned?: number
          total_orders_assigned?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          last_assigned_at?: string | null
          last_lead_assigned_at?: string | null
          last_order_assigned_at?: string | null
          service_id?: string | null
          total_assigned?: number
          total_leads_assigned?: number
          total_orders_assigned?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_pool_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          changed_by: string | null
          changed_by_name: string | null
          changed_by_role: string | null
          changed_fields: Json | null
          created_at: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          changed_by_name?: string | null
          changed_by_role?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          new_value: Json | null
          old_value: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_agent?: string | null
        }
        Relationships: []
      }
      business_hours_config: {
        Row: {
          close_time: string
          holidays: string[]
          id: number
          open_time: string
          timezone: string
          updated_at: string
          updated_by: string | null
          working_days: number[]
        }
        Insert: {
          close_time?: string
          holidays?: string[]
          id?: number
          open_time?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
        }
        Update: {
          close_time?: string
          holidays?: string[]
          id?: number
          open_time?: string
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          working_days?: number[]
        }
        Relationships: []
      }
      callerdesk_ivr_settings: {
        Row: {
          config: Json
          id: string
          revision: number
          sync_status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          config?: Json
          id?: string
          revision?: number
          sync_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          config?: Json
          id?: string
          revision?: number
          sync_status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "callerdesk_ivr_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canned_responses: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashfree_account_credentials: {
        Row: {
          account_id: string
          client_id: string
          client_secret_ciphertext: string
          mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account_id: string
          client_id: string
          client_secret_ciphertext: string
          mode: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account_id?: string
          client_id?: string
          client_secret_ciphertext?: string
          mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cashfree_account_credentials_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "cashfree_merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      cashfree_merchant_accounts: {
        Row: {
          account_key: string
          created_at: string
          id: string
          is_active: boolean
          is_legacy: boolean
          label: string
          updated_at: string
        }
        Insert: {
          account_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          label: string
          updated_at?: string
        }
        Update: {
          account_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          label?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashfree_website_accounts: {
        Row: {
          account_id: string
          created_at: string
          is_enabled: boolean
          updated_at: string
          website_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          is_enabled?: boolean
          updated_at?: string
          website_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          is_enabled?: boolean
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashfree_website_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "cashfree_merchant_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashfree_website_accounts_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: true
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      certificates: {
        Row: {
          application_id: string
          certificate_number: string | null
          created_at: string
          customer_id: string | null
          delivered_at: string | null
          file_name: string | null
          file_path: string | null
          id: string
          issued_at: string | null
          lead_id: string
          mime_type: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          application_id: string
          certificate_number?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued_at?: string | null
          lead_id: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          application_id?: string
          certificate_number?: string | null
          created_at?: string
          customer_id?: string | null
          delivered_at?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued_at?: string | null
          lead_id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "certificates_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          application_id: string | null
          assigned_to: string | null
          authority_name: string | null
          authority_ref_number: string | null
          breached_at: string | null
          category: string | null
          complaint_number: string | null
          created_at: string
          customer_id: string | null
          description: string | null
          expected_update_at: string | null
          id: string
          last_reminded_at: string | null
          lead_id: string
          notes: string | null
          reminder_count: number
          resolved_at: string | null
          severity: string
          sla_due_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          assigned_to?: string | null
          authority_name?: string | null
          authority_ref_number?: string | null
          breached_at?: string | null
          category?: string | null
          complaint_number?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          expected_update_at?: string | null
          id?: string
          last_reminded_at?: string | null
          lead_id: string
          notes?: string | null
          reminder_count?: number
          resolved_at?: string | null
          severity?: string
          sla_due_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          assigned_to?: string | null
          authority_name?: string | null
          authority_ref_number?: string | null
          breached_at?: string | null
          category?: string | null
          complaint_number?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string | null
          expected_update_at?: string | null
          id?: string
          last_reminded_at?: string | null
          lead_id?: string
          notes?: string | null
          reminder_count?: number
          resolved_at?: string | null
          severity?: string
          sla_due_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "complaints_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_complaints_application"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_access_events: {
        Row: {
          created_at: string
          event: string
          id: string
          ip_hash: string | null
          lead_code: string | null
          lead_id: string | null
          reason: string | null
          scope: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          ip_hash?: string | null
          lead_code?: string | null
          lead_id?: string | null
          reason?: string | null
          scope?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          ip_hash?: string | null
          lead_code?: string | null
          lead_id?: string | null
          reason?: string | null
          scope?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      customer_access_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          issued_reason: string | null
          kind: string
          last_used_at: string | null
          lead_id: string
          max_uses: number | null
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          use_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          issued_reason?: string | null
          kind: string
          last_used_at?: string | null
          lead_id: string
          max_uses?: number | null
          revoked_at?: string | null
          scopes: string[]
          token_hash: string
          use_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          issued_reason?: string | null
          kind?: string
          last_used_at?: string | null
          lead_id?: string
          max_uses?: number | null
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          use_count?: number
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          note: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          aadhaar_doc_path: string | null
          aadhaar_number: string | null
          address: string | null
          business_name: string | null
          completed_applications: number
          created_at: string
          customer_code: string | null
          deleted_at: string | null
          first_seen_at: string
          gst_number: string | null
          id: string
          is_deleted: boolean | null
          language: string | null
          last_seen_at: string
          last_service_id: string | null
          lifetime_value: number
          metadata: Json
          name: string
          notes: string | null
          pan_doc_path: string | null
          pan_number: string | null
          pending_applications: number
          primary_email: string | null
          primary_mobile: string | null
          state: string | null
          status: string
          total_applications: number
          udyam_number: string | null
          updated_at: string
        }
        Insert: {
          aadhaar_doc_path?: string | null
          aadhaar_number?: string | null
          address?: string | null
          business_name?: string | null
          completed_applications?: number
          created_at?: string
          customer_code?: string | null
          deleted_at?: string | null
          first_seen_at?: string
          gst_number?: string | null
          id?: string
          is_deleted?: boolean | null
          language?: string | null
          last_seen_at?: string
          last_service_id?: string | null
          lifetime_value?: number
          metadata?: Json
          name: string
          notes?: string | null
          pan_doc_path?: string | null
          pan_number?: string | null
          pending_applications?: number
          primary_email?: string | null
          primary_mobile?: string | null
          state?: string | null
          status?: string
          total_applications?: number
          udyam_number?: string | null
          updated_at?: string
        }
        Update: {
          aadhaar_doc_path?: string | null
          aadhaar_number?: string | null
          address?: string | null
          business_name?: string | null
          completed_applications?: number
          created_at?: string
          customer_code?: string | null
          deleted_at?: string | null
          first_seen_at?: string
          gst_number?: string | null
          id?: string
          is_deleted?: boolean | null
          language?: string | null
          last_seen_at?: string
          last_service_id?: string | null
          lifetime_value?: number
          metadata?: Json
          name?: string
          notes?: string | null
          pan_doc_path?: string | null
          pan_number?: string | null
          pending_applications?: number
          primary_email?: string | null
          primary_mobile?: string | null
          state?: string | null
          status?: string
          total_applications?: number
          udyam_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      delay_reasons: {
        Row: {
          category: string
          code: string
          id: string
          is_active: boolean
          label: string
          requires_remarks: boolean
          sort_order: number
        }
        Insert: {
          category: string
          code: string
          id?: string
          is_active?: boolean
          label: string
          requires_remarks?: boolean
          sort_order?: number
        }
        Update: {
          category?: string
          code?: string
          id?: string
          is_active?: boolean
          label?: string
          requires_remarks?: boolean
          sort_order?: number
        }
        Relationships: []
      }
      dispute_evidence_records: {
        Row: {
          application_code: string | null
          certificate_included: boolean
          created_at: string
          file_name: string
          file_path: string
          generated_at: string
          generated_by: string | null
          generated_by_name: string | null
          id: string
          invoice_included: boolean
          item_count: number
          metadata: Json | null
          order_id: string
          selected_email_ids: Json | null
        }
        Insert: {
          application_code?: string | null
          certificate_included?: boolean
          created_at?: string
          file_name: string
          file_path: string
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          invoice_included?: boolean
          item_count?: number
          metadata?: Json | null
          order_id: string
          selected_email_ids?: Json | null
        }
        Update: {
          application_code?: string | null
          certificate_included?: boolean
          created_at?: string
          file_name?: string
          file_path?: string
          generated_at?: string
          generated_by?: string | null
          generated_by_name?: string | null
          id?: string
          invoice_included?: boolean
          item_count?: number
          metadata?: Json | null
          order_id?: string
          selected_email_ids?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_records_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          application_id: string | null
          created_at: string
          doc_type: string
          file_name: string
          file_path: string
          id: string
          lead_id: string
          mime_type: string
          parent_document_id: string | null
          remarks: string | null
          size_bytes: number
          status: string
          updated_at: string
          uploaded_at: string
          verification_comment: string | null
          verified_at: string | null
          verified_by: string | null
          version: number
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          doc_type: string
          file_name: string
          file_path: string
          id?: string
          lead_id: string
          mime_type: string
          parent_document_id?: string | null
          remarks?: string | null
          size_bytes: number
          status?: string
          updated_at?: string
          uploaded_at?: string
          verification_comment?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Update: {
          application_id?: string | null
          created_at?: string
          doc_type?: string
          file_name?: string
          file_path?: string
          id?: string
          lead_id?: string
          mime_type?: string
          parent_document_id?: string | null
          remarks?: string | null
          size_bytes?: number
          status?: string
          updated_at?: string
          uploaded_at?: string
          verification_comment?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_documents_application"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingestion_audit_logs: {
        Row: {
          created_at: string
          error_details: Json | null
          id: string
          in_reply_to: string | null
          is_duplicate: boolean
          matched_application_id: string | null
          matched_customer_id: string | null
          matched_ticket_id: string | null
          message_id: string | null
          metadata: Json | null
          reply_to_email: string | null
          sender_normalized: string | null
          sender_raw: string | null
          stage: string
          subject: string | null
          to_email: string | null
          zoho_folder_id: string | null
          zoho_folder_name: string | null
          zoho_mail_uid: string
        }
        Insert: {
          created_at?: string
          error_details?: Json | null
          id?: string
          in_reply_to?: string | null
          is_duplicate?: boolean
          matched_application_id?: string | null
          matched_customer_id?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          metadata?: Json | null
          reply_to_email?: string | null
          sender_normalized?: string | null
          sender_raw?: string | null
          stage: string
          subject?: string | null
          to_email?: string | null
          zoho_folder_id?: string | null
          zoho_folder_name?: string | null
          zoho_mail_uid: string
        }
        Update: {
          created_at?: string
          error_details?: Json | null
          id?: string
          in_reply_to?: string | null
          is_duplicate?: boolean
          matched_application_id?: string | null
          matched_customer_id?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          metadata?: Json | null
          reply_to_email?: string | null
          sender_normalized?: string | null
          sender_raw?: string | null
          stage?: string
          subject?: string | null
          to_email?: string | null
          zoho_folder_id?: string | null
          zoho_folder_name?: string | null
          zoho_mail_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_ingestion_audit_logs_matched_application_id_fkey"
            columns: ["matched_application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingestion_audit_logs_matched_customer_id_fkey"
            columns: ["matched_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "email_ingestion_audit_logs_matched_customer_id_fkey"
            columns: ["matched_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_ingestion_audit_logs_matched_ticket_id_fkey"
            columns: ["matched_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_ingestion_checkpoints: {
        Row: {
          account_id: string
          consecutive_failures: number
          created_at: string
          error_message: string | null
          folder_id: string
          folder_name: string
          folder_type: string | null
          id: string
          last_processed_uid: string | null
          last_received_time_ms: number
          last_sync_at: string
          mailbox_address: string
          status: string
          updated_at: string
        }
        Insert: {
          account_id: string
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          folder_id: string
          folder_name: string
          folder_type?: string | null
          id?: string
          last_processed_uid?: string | null
          last_received_time_ms?: number
          last_sync_at?: string
          mailbox_address: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          consecutive_failures?: number
          created_at?: string
          error_message?: string | null
          folder_id?: string
          folder_name?: string
          folder_type?: string | null
          id?: string
          last_processed_uid?: string | null
          last_received_time_ms?: number
          last_sync_at?: string
          mailbox_address?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_ingestion_locks: {
        Row: {
          expires_at: string
          locked_at: string
          locked_by: string
          mailbox_address: string
        }
        Insert: {
          expires_at: string
          locked_at?: string
          locked_by: string
          mailbox_address: string
        }
        Update: {
          expires_at?: string
          locked_at?: string
          locked_by?: string
          mailbox_address?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          application_id: string | null
          attempt: number
          body_html: string | null
          body_text: string | null
          created_at: string
          customer_id: string | null
          direction: string
          error_message: string | null
          from_email: string | null
          id: string
          in_reply_to: string | null
          lead_id: string | null
          message_id: string | null
          queue_id: string | null
          received_at: string | null
          references_header: string | null
          sent_at: string
          smtp_response: string | null
          status: Database["public"]["Enums"]["email_log_status"]
          subject: string
          template_code: string | null
          to_email: string
          triggered_by: string | null
          zoho_mail_uid: string | null
        }
        Insert: {
          application_id?: string | null
          attempt?: number
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          queue_id?: string | null
          received_at?: string | null
          references_header?: string | null
          sent_at?: string
          smtp_response?: string | null
          status: Database["public"]["Enums"]["email_log_status"]
          subject: string
          template_code?: string | null
          to_email: string
          triggered_by?: string | null
          zoho_mail_uid?: string | null
        }
        Update: {
          application_id?: string | null
          attempt?: number
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          lead_id?: string | null
          message_id?: string | null
          queue_id?: string | null
          received_at?: string | null
          references_header?: string | null
          sent_at?: string
          smtp_response?: string | null
          status?: Database["public"]["Enums"]["email_log_status"]
          subject?: string
          template_code?: string | null
          to_email?: string
          triggered_by?: string | null
          zoho_mail_uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "email_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      email_processing_errors: {
        Row: {
          body_snippet: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          error_stage: string
          from_email: string | null
          id: string
          last_retried_at: string | null
          matched_ticket_id: string | null
          message_id: string | null
          raw_headers: Json | null
          reply_to_email: string | null
          resolution_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          retry_count: number
          status: string
          subject: string | null
          updated_at: string
          zoho_folder_id: string | null
          zoho_folder_name: string | null
          zoho_mail_uid: string
        }
        Insert: {
          body_snippet?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          error_stage: string
          from_email?: string | null
          id?: string
          last_retried_at?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          raw_headers?: Json | null
          reply_to_email?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
          zoho_folder_id?: string | null
          zoho_folder_name?: string | null
          zoho_mail_uid: string
        }
        Update: {
          body_snippet?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          error_stage?: string
          from_email?: string | null
          id?: string
          last_retried_at?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          raw_headers?: Json | null
          reply_to_email?: string | null
          resolution_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          retry_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
          zoho_folder_id?: string | null
          zoho_folder_name?: string | null
          zoho_mail_uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_processing_errors_matched_ticket_id_fkey"
            columns: ["matched_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_queue: {
        Row: {
          application_id: string | null
          attempts: number
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          lead_id: string | null
          max_attempts: number
          next_attempt_at: string
          scheduled_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["email_queue_status"]
          subject: string
          template_code: string | null
          to_email: string
          to_name: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string | null
          max_attempts?: number
          next_attempt_at?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_queue_status"]
          subject: string
          template_code?: string | null
          to_email: string
          to_name?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          application_id?: string | null
          attempts?: number
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string | null
          max_attempts?: number
          next_attempt_at?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_queue_status"]
          subject?: string
          template_code?: string | null
          to_email?: string
          to_name?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          category: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          disabled_reason: string | null
          dispatch_mode: string
          flow_id: string | null
          id: string
          is_enabled: boolean
          is_system: boolean
          last_sent_at: string | null
          last_toggled_at: string | null
          last_toggled_by: string | null
          name: string
          sr_no: number | null
          subject: string
          total_sent: number
          updated_at: string
          variables: string[]
        }
        Insert: {
          body_html: string
          body_text?: string | null
          category?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_reason?: string | null
          dispatch_mode?: string
          flow_id?: string | null
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          last_sent_at?: string | null
          last_toggled_at?: string | null
          last_toggled_by?: string | null
          name: string
          sr_no?: number | null
          subject: string
          total_sent?: number
          updated_at?: string
          variables?: string[]
        }
        Update: {
          body_html?: string
          body_text?: string | null
          category?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          disabled_reason?: string | null
          dispatch_mode?: string
          flow_id?: string | null
          id?: string
          is_enabled?: boolean
          is_system?: boolean
          last_sent_at?: string | null
          last_toggled_at?: string | null
          last_toggled_by?: string | null
          name?: string
          sr_no?: number | null
          subject?: string
          total_sent?: number
          updated_at?: string
          variables?: string[]
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      employee_activity_log: {
        Row: {
          action_type: string
          auth_user_id: string
          created_at: string
          employee_id: string
          id: string
          metadata: Json
          new_stage: string | null
          new_status: string | null
          order_id: string | null
          previous_stage: string | null
          previous_status: string | null
          session_id: string | null
          ticket_id: string | null
        }
        Insert: {
          action_type: string
          auth_user_id: string
          created_at?: string
          employee_id: string
          id?: string
          metadata?: Json
          new_stage?: string | null
          new_status?: string | null
          order_id?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          session_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          action_type?: string
          auth_user_id?: string
          created_at?: string
          employee_id?: string
          id?: string
          metadata?: Json
          new_stage?: string | null
          new_status?: string | null
          order_id?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          session_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_activity_log_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_activity_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_login_history: {
        Row: {
          auth_user_id: string | null
          browser: string | null
          browser_version: string | null
          created_at: string
          device_type: string | null
          email: string
          employee_id: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          login_at: string
          login_method: string
          operating_system: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          auth_user_id?: string | null
          browser?: string | null
          browser_version?: string | null
          created_at?: string
          device_type?: string | null
          email: string
          employee_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string
          login_method?: string
          operating_system?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          auth_user_id?: string | null
          browser?: string | null
          browser_version?: string | null
          created_at?: string
          device_type?: string | null
          email?: string
          employee_id?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string
          login_method?: string
          operating_system?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_login_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_security_events: {
        Row: {
          actor_id: string | null
          auth_user_id: string | null
          created_at: string
          employee_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          auth_user_id?: string | null
          created_at?: string
          employee_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          auth_user_id?: string | null
          created_at?: string
          employee_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_security_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_sessions: {
        Row: {
          active_seconds: number
          auth_user_id: string
          away_seconds: number
          browser: string | null
          browser_version: string | null
          created_at: string
          current_module: string | null
          current_order_code: string | null
          current_order_id: string | null
          current_page: string | null
          device_name: string | null
          device_type: string | null
          employee_id: string
          id: string
          idle_seconds: number
          ip_address: string | null
          is_active: boolean
          last_action_text: string | null
          last_activity_at: string
          last_heartbeat_at: string
          login_at: string
          login_method: string
          logout_at: string | null
          logout_reason: string | null
          operating_system: string | null
          session_id: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          active_seconds?: number
          auth_user_id: string
          away_seconds?: number
          browser?: string | null
          browser_version?: string | null
          created_at?: string
          current_module?: string | null
          current_order_code?: string | null
          current_order_id?: string | null
          current_page?: string | null
          device_name?: string | null
          device_type?: string | null
          employee_id: string
          id?: string
          idle_seconds?: number
          ip_address?: string | null
          is_active?: boolean
          last_action_text?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          login_at?: string
          login_method?: string
          logout_at?: string | null
          logout_reason?: string | null
          operating_system?: string | null
          session_id: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          active_seconds?: number
          auth_user_id?: string
          away_seconds?: number
          browser?: string | null
          browser_version?: string | null
          created_at?: string
          current_module?: string | null
          current_order_code?: string | null
          current_order_id?: string | null
          current_page?: string | null
          device_name?: string | null
          device_type?: string | null
          employee_id?: string
          id?: string
          idle_seconds?: number
          ip_address?: string | null
          is_active?: boolean
          last_action_text?: string | null
          last_activity_at?: string
          last_heartbeat_at?: string
          login_at?: string
          login_method?: string
          logout_at?: string | null
          logout_reason?: string | null
          operating_system?: string | null
          session_id?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_sessions_current_order_id_fkey"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_sessions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_telephony_accounts: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          employee_id: string
          id: string
          key_version: number
          member_id: string | null
          provider: string
          sip_password_ciphertext: string | null
          sip_username: string | null
          source: string
          status: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          employee_id: string
          id?: string
          key_version?: number
          member_id?: string | null
          provider?: string
          sip_password_ciphertext?: string | null
          sip_username?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          employee_id?: string
          id?: string
          key_version?: number
          member_id?: string | null
          provider?: string
          sip_password_ciphertext?: string | null
          sip_username?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_telephony_accounts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          application_id: string | null
          assigned_to: string | null
          completed_at: string | null
          completion_note: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          id: string
          is_completed: boolean | null
          lead_id: string | null
          reason: string
          reason_note: string | null
          scheduled_at: string
        }
        Insert: {
          application_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id?: string | null
          reason: string
          reason_note?: string | null
          scheduled_at: string
        }
        Update: {
          application_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id?: string | null
          reason?: string
          reason_note?: string | null
          scheduled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "follow_ups_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_settlements: {
        Row: {
          created_at: string
          currency: string
          fees: number
          gateway: string
          gross: number
          id: string
          net: number
          raw: Json | null
          settled_at: string
          settlement_id: string
          tax_on_fees: number
        }
        Insert: {
          created_at?: string
          currency?: string
          fees?: number
          gateway: string
          gross?: number
          id?: string
          net?: number
          raw?: Json | null
          settled_at: string
          settlement_id: string
          tax_on_fees?: number
        }
        Update: {
          created_at?: string
          currency?: string
          fees?: number
          gateway?: string
          gross?: number
          id?: string
          net?: number
          raw?: Json | null
          settled_at?: string
          settlement_id?: string
          tax_on_fees?: number
        }
        Relationships: []
      }
      inbound_email_quarantine: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string
          from_email: string | null
          id: string
          in_reply_to: string | null
          matched_ticket_email: string | null
          matched_ticket_id: string | null
          message_id: string | null
          reason: string
          received_at: string
          review_action: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          subject: string | null
          to_email: string | null
          zoho_mail_uid: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          matched_ticket_email?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          reason: string
          received_at?: string
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          to_email?: string | null
          zoho_mail_uid?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string
          from_email?: string | null
          id?: string
          in_reply_to?: string | null
          matched_ticket_email?: string | null
          matched_ticket_id?: string | null
          message_id?: string | null
          reason?: string
          received_at?: string
          review_action?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          subject?: string | null
          to_email?: string | null
          zoho_mail_uid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbound_email_quarantine_matched_ticket_id_fkey"
            columns: ["matched_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_events: {
        Row: {
          actor_id: string | null
          actor_label: string
          created_at: string
          detail: Json
          event_type: string
          id: string
          invoice_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          invoice_id: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          invoice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          application_id: string | null
          base_amount: number
          cancel_reason: string | null
          cancelled_at: string | null
          cgst_amount: number
          cgst_rate: number
          company_gstin_snapshot: string | null
          company_state_snapshot: string | null
          created_at: string
          customer_gstin_snapshot: string | null
          customer_id: string | null
          customer_state_snapshot: string | null
          delivery_status: string | null
          duplicate_of: string | null
          email_attempts: number
          gst_amount: number
          id: string
          igst_amount: number
          igst_rate: number
          invoice_number: string | null
          issued_at: string
          last_email_status: string | null
          last_emailed_at: string | null
          lead_id: string
          payment_id: string
          pdf_generated_at: string | null
          pdf_path: string | null
          place_of_supply: string | null
          prev_pdf_paths: string[]
          replaced_at: string | null
          sac_code: string
          sgst_amount: number
          sgst_rate: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          base_amount: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          cgst_rate?: number
          company_gstin_snapshot?: string | null
          company_state_snapshot?: string | null
          created_at?: string
          customer_gstin_snapshot?: string | null
          customer_id?: string | null
          customer_state_snapshot?: string | null
          delivery_status?: string | null
          duplicate_of?: string | null
          email_attempts?: number
          gst_amount: number
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_number?: string | null
          issued_at?: string
          last_email_status?: string | null
          last_emailed_at?: string | null
          lead_id: string
          payment_id: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          place_of_supply?: string | null
          prev_pdf_paths?: string[]
          replaced_at?: string | null
          sac_code?: string
          sgst_amount?: number
          sgst_rate?: number
          total_amount: number
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          base_amount?: number
          cancel_reason?: string | null
          cancelled_at?: string | null
          cgst_amount?: number
          cgst_rate?: number
          company_gstin_snapshot?: string | null
          company_state_snapshot?: string | null
          created_at?: string
          customer_gstin_snapshot?: string | null
          customer_id?: string | null
          customer_state_snapshot?: string | null
          delivery_status?: string | null
          duplicate_of?: string | null
          email_attempts?: number
          gst_amount?: number
          id?: string
          igst_amount?: number
          igst_rate?: number
          invoice_number?: string | null
          issued_at?: string
          last_email_status?: string | null
          last_emailed_at?: string | null
          lead_id?: string
          payment_id?: string
          pdf_generated_at?: string | null
          pdf_path?: string | null
          place_of_supply?: string | null
          prev_pdf_paths?: string[]
          replaced_at?: string | null
          sac_code?: string
          sgst_amount?: number
          sgst_rate?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_application"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_payment"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_payment"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_config: {
        Row: {
          assignment_mode: string
          created_at: string
          id: string
          is_active: boolean
          service_id: string | null
          updated_at: string
        }
        Insert: {
          assignment_mode?: string
          created_at?: string
          id?: string
          is_active?: boolean
          service_id?: string | null
          updated_at?: string
        }
        Update: {
          assignment_mode?: string
          created_at?: string
          id?: string
          is_active?: boolean
          service_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_config_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attribution: {
        Row: {
          conversion_kind: string | null
          converted_at: string | null
          converted_user_id: string | null
          created_at: string
          first_contact_at: string | null
          first_contact_user_id: string | null
          is_unique_lead: boolean
          lead_id: string
          repeat_of_lead_id: string | null
          updated_at: string
        }
        Insert: {
          conversion_kind?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          first_contact_at?: string | null
          first_contact_user_id?: string | null
          is_unique_lead?: boolean
          lead_id: string
          repeat_of_lead_id?: string | null
          updated_at?: string
        }
        Update: {
          conversion_kind?: string | null
          converted_at?: string | null
          converted_user_id?: string | null
          created_at?: string
          first_contact_at?: string | null
          first_contact_user_id?: string | null
          is_unique_lead?: boolean
          lead_id?: string
          repeat_of_lead_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_attribution_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_attribution_repeat_of_lead_id_fkey"
            columns: ["repeat_of_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_events: {
        Row: {
          channel: string
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          outcome: string
          user_id: string
        }
        Insert: {
          channel: string
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          outcome: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          note: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          note: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          note?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          auto_assigned: boolean
          base_amount: number
          created_at: string
          customer_id: string | null
          deleted_at: string | null
          duplicate_count: number
          duplicate_of: string | null
          email: string
          followup_note: string | null
          gst_amount: number
          gstin: string | null
          id: string
          is_deleted: boolean | null
          is_duplicate: boolean
          language: string
          lead_code: string | null
          lead_source: string
          lead_status_v2: Database["public"]["Enums"]["lead_status_enum"] | null
          mobile: string
          name: string
          next_followup_at: string | null
          notes: string | null
          onboarding_reminded_at: string | null
          onboarding_reminder_count: number
          public_ref: string
          remarks: string | null
          service: string
          service_id: string | null
          state: string
          status: Database["public"]["Enums"]["lead_status"]
          total_amount: number
          updated_at: string
          website_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          auto_assigned?: boolean
          base_amount?: number
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          duplicate_count?: number
          duplicate_of?: string | null
          email: string
          followup_note?: string | null
          gst_amount?: number
          gstin?: string | null
          id?: string
          is_deleted?: boolean | null
          is_duplicate?: boolean
          language: string
          lead_code?: string | null
          lead_source?: string
          lead_status_v2?:
            | Database["public"]["Enums"]["lead_status_enum"]
            | null
          mobile: string
          name: string
          next_followup_at?: string | null
          notes?: string | null
          onboarding_reminded_at?: string | null
          onboarding_reminder_count?: number
          public_ref?: string
          remarks?: string | null
          service: string
          service_id?: string | null
          state: string
          status?: Database["public"]["Enums"]["lead_status"]
          total_amount?: number
          updated_at?: string
          website_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          auto_assigned?: boolean
          base_amount?: number
          created_at?: string
          customer_id?: string | null
          deleted_at?: string | null
          duplicate_count?: number
          duplicate_of?: string | null
          email?: string
          followup_note?: string | null
          gst_amount?: number
          gstin?: string | null
          id?: string
          is_deleted?: boolean | null
          is_duplicate?: boolean
          language?: string
          lead_code?: string | null
          lead_source?: string
          lead_status_v2?:
            | Database["public"]["Enums"]["lead_status_enum"]
            | null
          mobile?: string
          name?: string
          next_followup_at?: string | null
          notes?: string | null
          onboarding_reminded_at?: string | null
          onboarding_reminder_count?: number
          public_ref?: string
          remarks?: string | null
          service?: string
          service_id?: string | null
          state?: string
          status?: Database["public"]["Enums"]["lead_status"]
          total_amount?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_leads_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "fk_leads_customer"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_duplicate_of_fkey"
            columns: ["duplicate_of"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      nic_codes: {
        Row: {
          activity_type: string | null
          class_code: string | null
          code: string
          created_at: string
          description: string
          division: string | null
          group_code: string | null
          id: string
          keywords: string[]
          section: string | null
        }
        Insert: {
          activity_type?: string | null
          class_code?: string | null
          code: string
          created_at?: string
          description: string
          division?: string | null
          group_code?: string | null
          id?: string
          keywords?: string[]
          section?: string | null
        }
        Update: {
          activity_type?: string | null
          class_code?: string | null
          code?: string
          created_at?: string
          description?: string
          division?: string | null
          group_code?: string | null
          id?: string
          keywords?: string[]
          section?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          entity_id: string | null
          entity_kind: string | null
          href: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          href?: string | null
          id?: string
          kind: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          entity_id?: string | null
          entity_kind?: string | null
          href?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_submissions: {
        Row: {
          application_id: string | null
          created_at: string
          form_data: Json
          id: string
          lead_id: string
          service_code: string
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          form_data?: Json
          id?: string
          lead_id: string
          service_code: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          form_data?: Json
          id?: string
          lead_id?: string
          service_code?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_action_logs: {
        Row: {
          action_type: string
          created_at: string
          created_at_ist: string
          customer_id: string | null
          employee_id: string | null
          employee_name: string
          employee_role: string | null
          id: string
          is_sla_breached: boolean
          lead_id: string | null
          new_stage: string | null
          new_status: string | null
          notes: string | null
          order_id: string | null
          previous_stage: string | null
          previous_status: string | null
          sla_status: string
          source: string
          time_spent_since_assignment_ms: number | null
          time_spent_since_previous_action_ms: number | null
          timestamp: string
        }
        Insert: {
          action_type: string
          created_at?: string
          created_at_ist: string
          customer_id?: string | null
          employee_id?: string | null
          employee_name: string
          employee_role?: string | null
          id?: string
          is_sla_breached?: boolean
          lead_id?: string | null
          new_stage?: string | null
          new_status?: string | null
          notes?: string | null
          order_id?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          sla_status?: string
          source?: string
          time_spent_since_assignment_ms?: number | null
          time_spent_since_previous_action_ms?: number | null
          timestamp?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          created_at_ist?: string
          customer_id?: string | null
          employee_id?: string | null
          employee_name?: string
          employee_role?: string | null
          id?: string
          is_sla_breached?: boolean
          lead_id?: string | null
          new_stage?: string | null
          new_status?: string | null
          notes?: string | null
          order_id?: string | null
          previous_stage?: string | null
          previous_status?: string | null
          sla_status?: string
          source?: string
          time_spent_since_assignment_ms?: number | null
          time_spent_since_previous_action_ms?: number | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_action_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "order_action_logs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_action_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_action_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      order_close_reasons: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          number: number
          sort_order: number
          standard_reply: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          number: number
          sort_order?: number
          standard_reply?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          number?: number
          sort_order?: number
          standard_reply?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_reminders: {
        Row: {
          application_id: string
          created_at: string
          created_by: string | null
          id: string
          interval_business_seconds: number | null
          is_active: boolean
          last_fired_at: string | null
          remind_at: string | null
          reminder_type: string
          scheduler_id: string | null
          stop_reason: string | null
          stopped_at: string | null
          times_fired: number
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          interval_business_seconds?: number | null
          is_active?: boolean
          last_fired_at?: string | null
          remind_at?: string | null
          reminder_type: string
          scheduler_id?: string | null
          stop_reason?: string | null
          stopped_at?: string | null
          times_fired?: number
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          interval_business_seconds?: number | null
          is_active?: boolean
          last_fired_at?: string | null
          remind_at?: string | null
          reminder_type?: string
          scheduler_id?: string | null
          stop_reason?: string | null
          stopped_at?: string | null
          times_fired?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_reminders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_reminders_scheduler_id_fkey"
            columns: ["scheduler_id"]
            isOneToOne: false
            referencedRelation: "order_schedulers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_schedulers: {
        Row: {
          application_id: string | null
          business_seconds_remaining: number | null
          business_seconds_total: number | null
          created_at: string
          created_by: string | null
          fires_at: string | null
          id: string
          paused_at: string | null
          paused_by_ticket_id: string | null
          reason_id: string | null
          remarks: string | null
          resumed_at: string | null
          scheduler_type: string
          started_at: string
          status: string
          stop_reason: string | null
          stop_triggered_by: string | null
          stopped_at: string | null
          ticket_id: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          business_seconds_remaining?: number | null
          business_seconds_total?: number | null
          created_at?: string
          created_by?: string | null
          fires_at?: string | null
          id?: string
          paused_at?: string | null
          paused_by_ticket_id?: string | null
          reason_id?: string | null
          remarks?: string | null
          resumed_at?: string | null
          scheduler_type: string
          started_at?: string
          status?: string
          stop_reason?: string | null
          stop_triggered_by?: string | null
          stopped_at?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          business_seconds_remaining?: number | null
          business_seconds_total?: number | null
          created_at?: string
          created_by?: string | null
          fires_at?: string | null
          id?: string
          paused_at?: string | null
          paused_by_ticket_id?: string | null
          reason_id?: string | null
          remarks?: string | null
          resumed_at?: string | null
          scheduler_type?: string
          started_at?: string
          status?: string
          stop_reason?: string | null
          stop_triggered_by?: string | null
          stopped_at?: string | null
          ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_schedulers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_schedulers_paused_by_ticket_id_fkey"
            columns: ["paused_by_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_schedulers_reason_id_fkey"
            columns: ["reason_id"]
            isOneToOne: false
            referencedRelation: "delay_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_schedulers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          config: Json
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          name: string
          priority: number
          updated_at: string
          webhook_secret_name: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          name: string
          priority?: number
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          name?: string
          priority?: number
          updated_at?: string
          webhook_secret_name?: string | null
        }
        Relationships: []
      }
      payment_links: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          lead_id: string | null
          opened_at: string | null
          paid_at: string | null
          payment_id: string | null
          payment_url: string
          status: string
          txnid: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_url: string
          status?: string
          txnid: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          lead_id?: string | null
          opened_at?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_url?: string
          status?: string
          txnid?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_settlements: {
        Row: {
          created_at: string
          fee: number
          id: string
          net: number
          payment_id: string
          settled_amount: number
          settlement_id: string
        }
        Insert: {
          created_at?: string
          fee?: number
          id?: string
          net?: number
          payment_id: string
          settled_amount?: number
          settlement_id: string
        }
        Update: {
          created_at?: string
          fee?: number
          id?: string
          net?: number
          payment_id?: string
          settled_amount?: number
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_settlements_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "gateway_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          application_id: string | null
          base_amount: number
          created_at: string
          currency: string
          customer_id: string | null
          gateway_name: string
          gst_amount: number
          id: string
          idempotency_key: string | null
          is_test_payment: boolean | null
          lead_id: string
          parent_payment_id: string | null
          payment_account_id: string | null
          payment_date: string | null
          payu_bank_ref_num: string | null
          payu_error_message: string | null
          payu_mihpayid: string | null
          payu_mode: string | null
          payu_net_amount_debit: number | null
          raw_response: Json | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_signature: string | null
          refund_reason: string | null
          return_nonce_hash: string | null
          return_origin: string | null
          status: Database["public"]["Enums"]["payment_status"]
          transaction_id: string | null
          updated_at: string
          webhook_received_at: string | null
          webhook_response: Json | null
        }
        Insert: {
          amount: number
          application_id?: string | null
          base_amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          gateway_name?: string
          gst_amount?: number
          id?: string
          idempotency_key?: string | null
          is_test_payment?: boolean | null
          lead_id: string
          parent_payment_id?: string | null
          payment_account_id?: string | null
          payment_date?: string | null
          payu_bank_ref_num?: string | null
          payu_error_message?: string | null
          payu_mihpayid?: string | null
          payu_mode?: string | null
          payu_net_amount_debit?: number | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refund_reason?: string | null
          return_nonce_hash?: string | null
          return_origin?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id?: string | null
          updated_at?: string
          webhook_received_at?: string | null
          webhook_response?: Json | null
        }
        Update: {
          amount?: number
          application_id?: string | null
          base_amount?: number
          created_at?: string
          currency?: string
          customer_id?: string | null
          gateway_name?: string
          gst_amount?: number
          id?: string
          idempotency_key?: string | null
          is_test_payment?: boolean | null
          lead_id?: string
          parent_payment_id?: string | null
          payment_account_id?: string | null
          payment_date?: string | null
          payu_bank_ref_num?: string | null
          payu_error_message?: string | null
          payu_mihpayid?: string | null
          payu_mode?: string | null
          payu_net_amount_debit?: number | null
          raw_response?: Json | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_signature?: string | null
          refund_reason?: string | null
          return_nonce_hash?: string | null
          return_origin?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          transaction_id?: string | null
          updated_at?: string
          webhook_received_at?: string | null
          webhook_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_application"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_parent_payment_id_fkey"
            columns: ["parent_payment_id"]
            isOneToOne: false
            referencedRelation: "payments_safe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_account_id_fkey"
            columns: ["payment_account_id"]
            isOneToOne: false
            referencedRelation: "cashfree_merchant_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_templates: {
        Row: {
          code: string
          created_at: string
          html_template: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          variables: string[]
          version: number
        }
        Insert: {
          code: string
          created_at?: string
          html_template: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          variables?: string[]
          version?: number
        }
        Update: {
          code?: string
          created_at?: string
          html_template?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          variables?: string[]
          version?: number
        }
        Relationships: []
      }
      permission_modules: {
        Row: {
          created_at: string
          description: string | null
          key: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          archived_at: string | null
          auto_assign_enabled: boolean
          avatar_url: string | null
          created_at: string
          department: string | null
          display_name: string | null
          email: string | null
          employee_code: string | null
          employment_status: string
          full_name: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          max_workload: number
          mobile: string | null
          smartflo_agent_id: string | null
          terminated_at: string | null
          updated_at: string
          work_schedule: Json | null
        }
        Insert: {
          archived_at?: string | null
          auto_assign_enabled?: boolean
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          employee_code?: string | null
          employment_status?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          joining_date?: string | null
          max_workload?: number
          mobile?: string | null
          smartflo_agent_id?: string | null
          terminated_at?: string | null
          updated_at?: string
          work_schedule?: Json | null
        }
        Update: {
          archived_at?: string | null
          auto_assign_enabled?: boolean
          avatar_url?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          employee_code?: string | null
          employment_status?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          max_workload?: number
          mobile?: string | null
          smartflo_agent_id?: string | null
          terminated_at?: string | null
          updated_at?: string
          work_schedule?: Json | null
        }
        Relationships: []
      }
      refund_request_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          actor_role: string | null
          created_at: string
          id: string
          meta: Json
          note: string | null
          request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          meta?: Json
          note?: string | null
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          actor_role?: string | null
          created_at?: string
          id?: string
          meta?: Json
          note?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "refund_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      refund_requests: {
        Row: {
          admin_notes: string | null
          application_id: string
          created_at: string
          created_by: string | null
          customer_notes: string | null
          decided_at: string | null
          deduction_amount: number | null
          deduction_reason: string | null
          escalation_note: string | null
          gateway_name: string | null
          gateway_ref: string | null
          id: string
          info_needed_note: string | null
          lead_id: string | null
          payment_id: string | null
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          reason_code: string | null
          refund_amount: number | null
          refund_mode: string
          reviewer_id: string | null
          status: Database["public"]["Enums"]["refund_request_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          application_id: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          decided_at?: string | null
          deduction_amount?: number | null
          deduction_reason?: string | null
          escalation_note?: string | null
          gateway_name?: string | null
          gateway_ref?: string | null
          id?: string
          info_needed_note?: string | null
          lead_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          reason_code?: string | null
          refund_amount?: number | null
          refund_mode?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["refund_request_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          application_id?: string
          created_at?: string
          created_by?: string | null
          customer_notes?: string | null
          decided_at?: string | null
          deduction_amount?: number | null
          deduction_reason?: string | null
          escalation_note?: string | null
          gateway_name?: string | null
          gateway_ref?: string | null
          id?: string
          info_needed_note?: string | null
          lead_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          reason_code?: string | null
          refund_amount?: number | null
          refund_mode?: string
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["refund_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refund_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refund_requests_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments_safe"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_lead_filters: {
        Row: {
          created_at: string
          filter_json: Json
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filter_json?: Json
          id?: string
          is_default?: boolean
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filter_json?: Json
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seo_pages: {
        Row: {
          cover_image_url: string | null
          created_at: string
          enabled: boolean
          faq: Json | null
          h1: string | null
          id: string
          intro: string | null
          label: string
          meta_description: string | null
          meta_title: string | null
          page_type: string
          published_at: string
          related_slugs: string[] | null
          sections: Json | null
          slug: string
          sort_order: number
          updated_at: string
          website_id: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          enabled?: boolean
          faq?: Json | null
          h1?: string | null
          id?: string
          intro?: string | null
          label: string
          meta_description?: string | null
          meta_title?: string | null
          page_type?: string
          published_at?: string
          related_slugs?: string[] | null
          sections?: Json | null
          slug: string
          sort_order?: number
          updated_at?: string
          website_id: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          enabled?: boolean
          faq?: Json | null
          h1?: string | null
          id?: string
          intro?: string | null
          label?: string
          meta_description?: string | null
          meta_title?: string | null
          page_type?: string
          published_at?: string
          related_slugs?: string[] | null
          sections?: Json | null
          slug?: string
          sort_order?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_pages_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      service_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          website_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          website_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_categories_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      service_form_schemas: {
        Row: {
          created_at: string
          description: string | null
          documents: Json
          id: string
          is_active: boolean
          schema: Json
          service_code: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          documents?: Json
          id?: string
          is_active?: boolean
          schema?: Json
          service_code: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          documents?: Json
          id?: string
          is_active?: boolean
          schema?: Json
          service_code?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      service_workflows: {
        Row: {
          application_statuses: Json
          created_at: string
          default_assignee_role: string | null
          display_name: string
          id: string
          is_active: boolean
          service_code: string
          updated_at: string
        }
        Insert: {
          application_statuses?: Json
          created_at?: string
          default_assignee_role?: string | null
          display_name: string
          id?: string
          is_active?: boolean
          service_code: string
          updated_at?: string
        }
        Update: {
          application_statuses?: Json
          created_at?: string
          default_assignee_role?: string | null
          display_name?: string
          id?: string
          is_active?: boolean
          service_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          base_amount: number
          category_id: string | null
          created_at: string
          description: string | null
          expected_processing_days: number | null
          govt_portal_url: string | null
          gst_amount: number
          id: string
          is_active: boolean
          journey_key: string | null
          sac_code: string
          service_code: string
          service_name: string
          sort_order: number
          total_amount: number
          updated_at: string
          website_id: string
        }
        Insert: {
          base_amount: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          expected_processing_days?: number | null
          govt_portal_url?: string | null
          gst_amount?: number
          id?: string
          is_active?: boolean
          journey_key?: string | null
          sac_code?: string
          service_code: string
          service_name: string
          sort_order?: number
          total_amount: number
          updated_at?: string
          website_id: string
        }
        Update: {
          base_amount?: number
          category_id?: string | null
          created_at?: string
          description?: string | null
          expected_processing_days?: number | null
          govt_portal_url?: string | null
          gst_amount?: number
          id?: string
          is_active?: boolean
          journey_key?: string | null
          sac_code?: string
          service_code?: string
          service_name?: string
          sort_order?: number
          total_amount?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_content_blocks: {
        Row: {
          block_key: string
          content: Json
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          updated_at: string
          website_id: string
        }
        Insert: {
          block_key: string
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          website_id: string
        }
        Update: {
          block_key?: string
          content?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_content_blocks_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_nav_items: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          nav_group: string
          open_in_new: boolean
          path: string
          sort_order: number
          updated_at: string
          website_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          nav_group?: string
          open_in_new?: boolean
          path: string
          sort_order?: number
          updated_at?: string
          website_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          nav_group?: string
          open_in_new?: boolean
          path?: string
          sort_order?: number
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_nav_items_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      sitemap_overrides: {
        Row: {
          created_at: string
          id: string
          included: boolean
          slug: string
          updated_at: string
          website_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          included?: boolean
          slug: string
          updated_at?: string
          website_id: string
        }
        Update: {
          created_at?: string
          id?: string
          included?: boolean
          slug?: string
          updated_at?: string
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sitemap_overrides_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      smtp_settings: {
        Row: {
          created_at: string
          daily_quota: number
          from_email: string
          from_name: string
          id: string
          is_enabled: boolean
          notes: string | null
          reply_to: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          daily_quota?: number
          from_email: string
          from_name?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          reply_to?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          daily_quota?: number
          from_email?: string
          from_name?: string
          id?: string
          is_enabled?: boolean
          notes?: string | null
          reply_to?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      support_ticket_folder_items: {
        Row: {
          created_at: string
          folder_id: string
          id: string
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          folder_id: string
          id?: string
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          folder_id?: string
          id?: string
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_folder_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "support_ticket_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_folder_items_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_folders: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_shared: boolean
          name: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean
          name: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_shared?: boolean
          name?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_ticket_stars: {
        Row: {
          created_at: string
          id: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_stars_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          alternate_sender_email: string | null
          application_id: string | null
          assigned_to: string | null
          attachment_url: string | null
          category: string | null
          closed_at: string | null
          created_at: string | null
          customer_id: string | null
          description: string | null
          first_response_at: string | null
          id: string
          is_unlinked: boolean
          last_closed_at: string | null
          last_customer_message_at: string | null
          last_staff_message_at: string | null
          order_link_status: string
          parent_ticket_id: string | null
          priority: Database["public"]["Enums"]["priority_enum"] | null
          reopened_count: number
          resolved_at: string | null
          resolved_by: string | null
          service_id: string | null
          source: string
          status: Database["public"]["Enums"]["ticket_status_enum"] | null
          subject: string
          ticket_email: string | null
          ticket_number: string | null
          ticket_state: Database["public"]["Enums"]["support_ticket_state"]
          updated_at: string | null
        }
        Insert: {
          alternate_sender_email?: string | null
          application_id?: string | null
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          is_unlinked?: boolean
          last_closed_at?: string | null
          last_customer_message_at?: string | null
          last_staff_message_at?: string | null
          order_link_status?: string
          parent_ticket_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          reopened_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status_enum"] | null
          subject: string
          ticket_email?: string | null
          ticket_number?: string | null
          ticket_state?: Database["public"]["Enums"]["support_ticket_state"]
          updated_at?: string | null
        }
        Update: {
          alternate_sender_email?: string | null
          application_id?: string | null
          assigned_to?: string | null
          attachment_url?: string | null
          category?: string | null
          closed_at?: string | null
          created_at?: string | null
          customer_id?: string | null
          description?: string | null
          first_response_at?: string | null
          id?: string
          is_unlinked?: boolean
          last_closed_at?: string | null
          last_customer_message_at?: string | null
          last_staff_message_at?: string | null
          order_link_status?: string
          parent_ticket_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          reopened_count?: number
          resolved_at?: string | null
          resolved_by?: string | null
          service_id?: string | null
          source?: string
          status?: Database["public"]["Enums"]["ticket_status_enum"] | null
          subject?: string
          ticket_email?: string | null
          ticket_number?: string | null
          ticket_state?: Database["public"]["Enums"]["support_ticket_state"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "support_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_parent_ticket_id_fkey"
            columns: ["parent_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          application_id: string | null
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean | null
          lead_id: string | null
          priority: Database["public"]["Enums"]["priority_enum"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          application_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          application_id?: string | null
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean | null
          lead_id?: string | null
          priority?: Database["public"]["Enums"]["priority_enum"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_stats"
            referencedColumns: ["customer_id"]
          },
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      telephony_calls: {
        Row: {
          agent_id: string | null
          answered_at: string | null
          application_id: string | null
          call_id: string
          called_number: string | null
          caller_number: string | null
          created_at: string
          customer_id: string | null
          direction: string
          disposition: string | null
          disposition_at: string | null
          disposition_by: string | null
          disposition_notes: string | null
          duration_seconds: number | null
          employee_id: string | null
          ended_at: string | null
          follow_up_at: string | null
          follow_up_id: string | null
          hangup_cause: string | null
          id: string
          last_event: string | null
          lead_id: string | null
          next_action: string | null
          provider: string
          provider_uuid: string | null
          recording_url: string | null
          ref_id: string | null
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          answered_at?: string | null
          application_id?: string | null
          call_id: string
          called_number?: string | null
          caller_number?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          disposition?: string | null
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_notes?: string | null
          duration_seconds?: number | null
          employee_id?: string | null
          ended_at?: string | null
          follow_up_at?: string | null
          follow_up_id?: string | null
          hangup_cause?: string | null
          id?: string
          last_event?: string | null
          lead_id?: string | null
          next_action?: string | null
          provider?: string
          provider_uuid?: string | null
          recording_url?: string | null
          ref_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          answered_at?: string | null
          application_id?: string | null
          call_id?: string
          called_number?: string | null
          caller_number?: string | null
          created_at?: string
          customer_id?: string | null
          direction?: string
          disposition?: string | null
          disposition_at?: string | null
          disposition_by?: string | null
          disposition_notes?: string | null
          duration_seconds?: number | null
          employee_id?: string | null
          ended_at?: string | null
          follow_up_at?: string | null
          follow_up_id?: string | null
          hangup_cause?: string | null
          id?: string
          last_event?: string | null
          lead_id?: string | null
          next_action?: string | null
          provider?: string
          provider_uuid?: string | null
          recording_url?: string | null
          ref_id?: string | null
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "telephony_calls_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_replies: {
        Row: {
          created_at: string | null
          created_by: string | null
          direction: string
          email_in_reply_to: string | null
          email_message_id: string | null
          email_send_log_id: string | null
          emailed_at: string | null
          id: string
          is_internal: boolean | null
          reply_text: string
          ticket_id: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          direction?: string
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_send_log_id?: string | null
          emailed_at?: string | null
          id?: string
          is_internal?: boolean | null
          reply_text: string
          ticket_id?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          direction?: string
          email_in_reply_to?: string | null
          email_message_id?: string | null
          email_send_log_id?: string | null
          emailed_at?: string | null
          id?: string
          is_internal?: boolean | null
          reply_text?: string
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_reply_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number
          id: string
          mime_type: string
          storage_bucket: string
          storage_path: string
          ticket_id: string
          ticket_reply_id: string | null
          zoho_attachment_id: string | null
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_bucket?: string
          storage_path: string
          ticket_id: string
          ticket_reply_id?: string | null
          zoho_attachment_id?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number
          id?: string
          mime_type?: string
          storage_bucket?: string
          storage_path?: string
          ticket_id?: string
          ticket_reply_id?: string | null
          zoho_attachment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_reply_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_reply_attachments_ticket_reply_id_fkey"
            columns: ["ticket_reply_id"]
            isOneToOne: false
            referencedRelation: "ticket_replies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permission_scopes: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          module_key: string
          service_id: string | null
          user_id: string
          website_id: string | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          module_key: string
          service_id?: string | null
          user_id: string
          website_id?: string | null
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          module_key?: string
          service_id?: string | null
          user_id?: string
          website_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_permission_scopes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "service_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_scopes_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_permission_scopes_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permission_scopes_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          module_key: string
          scope_all: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          module_key: string
          scope_all?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          can_create?: boolean
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          module_key?: string
          scope_all?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "permission_modules"
            referencedColumns: ["key"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webhook_error_log: {
        Row: {
          created_at: string
          error_message: string
          id: string
          raw_payload: Json | null
          webhook_type: string
        }
        Insert: {
          created_at?: string
          error_message: string
          id?: string
          raw_payload?: Json | null
          webhook_type: string
        }
        Update: {
          created_at?: string
          error_message?: string
          id?: string
          raw_payload?: Json | null
          webhook_type?: string
        }
        Relationships: []
      }
      website_payment_gateways: {
        Row: {
          created_at: string
          gateway_name: string
          is_default: boolean
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
          website_id: string
        }
        Insert: {
          created_at?: string
          gateway_name: string
          is_default?: boolean
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          website_id: string
        }
        Update: {
          created_at?: string
          gateway_name?: string
          is_default?: boolean
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
          website_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_payment_gateways_website_id_fkey"
            columns: ["website_id"]
            isOneToOne: false
            referencedRelation: "websites"
            referencedColumns: ["id"]
          },
        ]
      }
      websites: {
        Row: {
          allow_admin: boolean
          brand_name: string | null
          business_hours: string | null
          company_name: string | null
          contentful_delivery_token_secret: string | null
          contentful_space_id: string | null
          created_at: string
          description: string | null
          domain: string
          favicon_asset_url: string | null
          footer_unlock_code: string | null
          google_site_verification: string | null
          gtag_id: string | null
          id: string
          is_active: boolean
          is_primary: boolean
          legal_entity: string | null
          legal_footer_line: string | null
          logo_asset_url: string | null
          name: string
          payments_enabled: boolean
          postal_address: string | null
          primary_color: string | null
          sample_certificate_asset_url: string | null
          sanity_dataset: string | null
          sanity_project_id: string | null
          sort_order: number
          support_email: string | null
          support_phone: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          allow_admin?: boolean
          brand_name?: string | null
          business_hours?: string | null
          company_name?: string | null
          contentful_delivery_token_secret?: string | null
          contentful_space_id?: string | null
          created_at?: string
          description?: string | null
          domain: string
          favicon_asset_url?: string | null
          footer_unlock_code?: string | null
          google_site_verification?: string | null
          gtag_id?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          legal_entity?: string | null
          legal_footer_line?: string | null
          logo_asset_url?: string | null
          name: string
          payments_enabled?: boolean
          postal_address?: string | null
          primary_color?: string | null
          sample_certificate_asset_url?: string | null
          sanity_dataset?: string | null
          sanity_project_id?: string | null
          sort_order?: number
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          allow_admin?: boolean
          brand_name?: string | null
          business_hours?: string | null
          company_name?: string | null
          contentful_delivery_token_secret?: string | null
          contentful_space_id?: string | null
          created_at?: string
          description?: string | null
          domain?: string
          favicon_asset_url?: string | null
          footer_unlock_code?: string | null
          google_site_verification?: string | null
          gtag_id?: string | null
          id?: string
          is_active?: boolean
          is_primary?: boolean
          legal_entity?: string | null
          legal_footer_line?: string | null
          logo_asset_url?: string | null
          name?: string
          payments_enabled?: boolean
          postal_address?: string | null
          primary_color?: string | null
          sample_certificate_asset_url?: string | null
          sanity_dataset?: string | null
          sanity_project_id?: string | null
          sort_order?: number
          support_email?: string | null
          support_phone?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      workflow_automation_rules: {
        Row: {
          action_type: string
          config: Json
          created_at: string
          id: string
          is_active: boolean
          name: string
          repeat_count: number
          template_code: string | null
          trigger_status: Database["public"]["Enums"]["workflow_status"]
          updated_at: string
          wait_days: number
        }
        Insert: {
          action_type: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          repeat_count?: number
          template_code?: string | null
          trigger_status: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          wait_days?: number
        }
        Update: {
          action_type?: string
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          repeat_count?: number
          template_code?: string | null
          trigger_status?: Database["public"]["Enums"]["workflow_status"]
          updated_at?: string
          wait_days?: number
        }
        Relationships: []
      }
      workflow_automations: {
        Row: {
          application_id: string
          code: string
          context: Json
          created_at: string
          ended_at: string | null
          id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          code: string
          context?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          code?: string
          context?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_automations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_closure_reasons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      workflow_delay_reasons: {
        Row: {
          code: string
          created_at: string
          description: string | null
          email_template_code: string | null
          id: string
          is_active: boolean
          label: string
          side: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          email_template_code?: string | null
          id?: string
          is_active?: boolean
          label: string
          side?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          email_template_code?: string | null
          id?: string
          is_active?: boolean
          label?: string
          side?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      workflow_events: {
        Row: {
          actor_id: string | null
          actor_name: string
          application_id: string | null
          created_at: string
          customer_visible: boolean
          description: string | null
          event_type: string
          id: string
          is_system: boolean
          lead_id: string | null
          metadata: Json
          title: string
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string
          application_id?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          event_type: string
          id?: string
          is_system?: boolean
          lead_id?: string | null
          metadata?: Json
          title: string
        }
        Update: {
          actor_id?: string | null
          actor_name?: string
          application_id?: string | null
          created_at?: string
          customer_visible?: boolean
          description?: string | null
          event_type?: string
          id?: string
          is_system?: boolean
          lead_id?: string | null
          metadata?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_reminders: {
        Row: {
          application_id: string
          assigned_to: string | null
          attempts: number
          created_at: string
          created_by: string | null
          due_at: string
          id: string
          kind: Database["public"]["Enums"]["workflow_reminder_kind"]
          last_attempt_at: string | null
          last_error: string | null
          lead_id: string | null
          payload: Json
          sent_at: string | null
          status: Database["public"]["Enums"]["workflow_reminder_status"]
          template_code: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          assigned_to?: string | null
          attempts?: number
          created_at?: string
          created_by?: string | null
          due_at: string
          id?: string
          kind: Database["public"]["Enums"]["workflow_reminder_kind"]
          last_attempt_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["workflow_reminder_status"]
          template_code?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          assigned_to?: string | null
          attempts?: number
          created_at?: string
          created_by?: string | null
          due_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["workflow_reminder_kind"]
          last_attempt_at?: string | null
          last_error?: string | null
          lead_id?: string | null
          payload?: Json
          sent_at?: string | null
          status?: Database["public"]["Enums"]["workflow_reminder_status"]
          template_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_reminders_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_reminders_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_settings: {
        Row: {
          cancel_wait_hours: number
          created_at: string
          enabled: boolean
          id: string
          step1_template_code: string
          step2_days: number
          step2_template_code: string
          step3_days: number
          step3_template_code: string
          updated_at: string
        }
        Insert: {
          cancel_wait_hours?: number
          created_at?: string
          enabled?: boolean
          id?: string
          step1_template_code?: string
          step2_days?: number
          step2_template_code?: string
          step3_days?: number
          step3_template_code?: string
          updated_at?: string
        }
        Update: {
          cancel_wait_hours?: number
          created_at?: string
          enabled?: boolean
          id?: string
          step1_template_code?: string
          step2_days?: number
          step2_template_code?: string
          step3_days?: number
          step3_template_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      workflow_states: {
        Row: {
          active_ticket_id: string | null
          active_timer_id: string | null
          application_id: string
          assigned_to: string | null
          created_at: string
          id: string
          last_event_at: string
          pause_reason: string | null
          paused: boolean
          stage: string
          status: string
          sub_status: string | null
          updated_at: string
        }
        Insert: {
          active_ticket_id?: string | null
          active_timer_id?: string | null
          application_id: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          last_event_at?: string
          pause_reason?: string | null
          paused?: boolean
          stage?: string
          status?: string
          sub_status?: string | null
          updated_at?: string
        }
        Update: {
          active_ticket_id?: string | null
          active_timer_id?: string | null
          application_id?: string
          assigned_to?: string | null
          created_at?: string
          id?: string
          last_event_at?: string
          pause_reason?: string | null
          paused?: boolean
          stage?: string
          status?: string
          sub_status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_states_active_ticket_id_fkey"
            columns: ["active_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_states_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_timers: {
        Row: {
          application_id: string
          created_at: string
          custom_interval_minutes: number | null
          dedup_key: string | null
          fired_at: string | null
          fires_at: string
          id: string
          kind: string
          paused_at: string | null
          payload: Json
          recurring: boolean
          remaining_ms: number | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          custom_interval_minutes?: number | null
          dedup_key?: string | null
          fired_at?: string | null
          fires_at: string
          id?: string
          kind: string
          paused_at?: string | null
          payload?: Json
          recurring?: boolean
          remaining_ms?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          custom_interval_minutes?: number | null
          dedup_key?: string | null
          fired_at?: string | null
          fires_at?: string
          id?: string
          kind?: string
          paused_at?: string | null
          payload?: Json
          recurring?: boolean
          remaining_ms?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_timers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      customer_stats: {
        Row: {
          completed_applications: number | null
          customer_id: string | null
          last_order_at: string | null
          lifetime_value: number | null
          pending_applications: number | null
          total_applications: number | null
        }
        Relationships: []
      }
      payments_safe: {
        Row: {
          application_id: string | null
          created_at: string | null
          gateway_name: string | null
          id: string | null
          lead_id: string | null
          payment_date: string | null
          status: Database["public"]["Enums"]["payment_status"] | null
        }
        Insert: {
          application_id?: string | null
          created_at?: string | null
          gateway_name?: string | null
          id?: string | null
          lead_id?: string | null
          payment_date?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
        }
        Update: {
          application_id?: string | null
          created_at?: string | null
          gateway_name?: string | null
          id?: string | null
          lead_id?: string | null
          payment_date?: string | null
          status?: Database["public"]["Enums"]["payment_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_application"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acquire_email_ingestion_lock: {
        Args: { p_mailbox: string; p_ttl_seconds?: number; p_worker_id: string }
        Returns: boolean
      }
      admin_force_logout_all_sessions: {
        Args: { p_employee_id: string; p_reason?: string }
        Returns: Json
      }
      admin_force_logout_session: {
        Args: { p_reason?: string; p_session_id: string }
        Returns: Json
      }
      allowed_order_transitions: {
        Args: { _from: Database["public"]["Enums"]["order_status_enum"] }
        Returns: Database["public"]["Enums"]["order_status_enum"][]
      }
      assign_application: {
        Args: {
          p_actor?: string
          p_actor_type: string
          p_application_id: string
          p_assignment_type: string
          p_auto_assigned?: boolean
          p_check_expected?: boolean
          p_expected_previous?: string
          p_new_assignee: string
          p_reason?: string
          p_source: string
        }
        Returns: Json
      }
      assign_pool_pick: {
        Args: { _module: string; _service_id: string; _website_id: string }
        Returns: string
      }
      assign_pool_touch: {
        Args: { _service_id: string; _user_id: string }
        Returns: undefined
      }
      current_user_is_admin: { Args: never; Returns: boolean }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      find_or_create_customer: {
        Args: {
          p_email: string
          p_language?: string
          p_mobile: string
          p_name: string
          p_state?: string
        }
        Returns: string
      }
      get_dashboard_metrics: { Args: never; Returns: Json }
      get_employee_last_human_action: {
        Args: { p_employees: string[] }
        Returns: {
          application_id: string
          employee_id: string
          event_type: string
          last_action_at: string
        }[]
      }
      get_employee_perf_stream: {
        Args: { p_employee?: string; p_from: string; p_to: string }
        Returns: {
          application_id: string
          assignment_type: string
          attribution: string
          employee_id: string
          event_id: string
          event_type: string
          initiator: string
          kind: string
          new_assignee: string
          new_value: string
          note: string
          occurred_at: string
          old_assignee: string
        }[]
      }
      get_orders_v3_paged: {
        Args: {
          p_action_status?: string
          p_assigned_to?: string
          p_bucket?: string
          p_custom_days?: number
          p_date_from?: string
          p_date_to?: string
          p_fulfillment_status?: string
          p_is_admin?: boolean
          p_page?: number
          p_page_size?: number
          p_payment_status?: string
          p_pending_age?: string
          p_search?: string
          p_service_id?: string
          p_sort_field?: string
          p_sort_order?: string
          p_stage?: string
          p_user_id?: string
        }
        Returns: Json
      }
      has_any_staff_role: { Args: { _user_id: string }; Returns: boolean }
      has_permission: {
        Args: { _action: string; _module: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_account_disabled: { Args: { _user_id: string }; Returns: boolean }
      is_finance_viewer: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_workflow_manager: { Args: { _user_id: string }; Returns: boolean }
      list_order_close_reasons: {
        Args: never
        Returns: {
          category: string
          id: string
          label: string
          number: number
          sort_order: number
          standard_reply: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      prune_analytics_events: { Args: never; Returns: undefined }
      prune_notifications: { Args: never; Returns: undefined }
      prune_sent_email_bodies: { Args: never; Returns: undefined }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_employee_heartbeat_v2: {
        Args: {
          p_active_seconds_delta?: number
          p_away_seconds_delta?: number
          p_browser?: string
          p_browser_version?: string
          p_current_module?: string
          p_current_order_code?: string
          p_current_order_id?: string
          p_current_page?: string
          p_device_type?: string
          p_employee_id?: string
          p_idle_seconds_delta?: number
          p_ip_address?: string
          p_last_action_text?: string
          p_os?: string
          p_presence_status: string
          p_session_id: string
        }
        Returns: Json
      }
      release_email_ingestion_lock: {
        Args: { p_mailbox: string; p_worker_id: string }
        Returns: undefined
      }
      restart_order: {
        Args: { _note?: string; _order_id: string }
        Returns: Json
      }
      restart_order_from_ticket: { Args: { _ticket_id: string }; Returns: Json }
      search_nic_codes: {
        Args: { activity?: string; limit_n?: number; q?: string }
        Returns: {
          activity_type: string
          class_code: string
          code: string
          description: string
          division: string
          group_code: string
          rank: number
          section: string
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      ticket_reopen_or_create: {
        Args: {
          _application_id: string
          _channel?: string
          _customer_email: string
          _subject: string
        }
        Returns: {
          ticket_id: string
          was_created: boolean
          was_reopened: boolean
        }[]
      }
      transition_order_status: {
        Args: {
          _force?: boolean
          _new_status: Database["public"]["Enums"]["order_status_enum"]
          _order_id: string
          _reason_id?: string
          _remarks?: string
        }
        Returns: {
          active_reason_id: string | null
          active_reason_text: string | null
          application_code: string | null
          application_status: Database["public"]["Enums"]["application_status"]
          assigned_at: string | null
          assigned_to: string | null
          auto_assigned: boolean
          awaiting_govt_started_at: string | null
          cancellation_requested_at: string | null
          certificate_number: string | null
          certificate_uploaded_at: string | null
          closure_next_at: string | null
          closure_reason_code: string | null
          closure_reason_id: string | null
          closure_reason_text: string | null
          closure_remarks: string | null
          closure_stage: Database["public"]["Enums"]["closure_stage"]
          created_at: string
          customer_hold_started_at: string | null
          customer_id: string | null
          deleted_at: string | null
          document_status: string
          documents_deleted_at: string | null
          documents_deleted_reason: string | null
          email_thread_message_id: string | null
          email_thread_subject: string | null
          form_link_sent_at: string | null
          form_link_sent_count: number
          form_status: string
          form_submitted_at: string | null
          fulfilled_at: string | null
          fulfillment_status:
            | Database["public"]["Enums"]["fulfillment_status_enum"]
            | null
          govt_portals_selected: Json | null
          id: string
          is_deleted: boolean | null
          is_hot: boolean
          lead_id: string
          order_status: Database["public"]["Enums"]["order_status_enum"]
          priority: string | null
          refund_approved_at: string | null
          refund_approved_by: string | null
          refund_gateway_ref: string | null
          refund_processed_at: string | null
          refund_reason: string | null
          refund_requested_at: string | null
          refund_requested_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          service_id: string | null
          technical_hold_kind: string | null
          technical_hold_started_at: string | null
          updated_at: string
          website_id: string
          workflow_delay_reason: string | null
          workflow_expected_review_at: string | null
          workflow_priority: string | null
          workflow_status: Database["public"]["Enums"]["workflow_status"] | null
        }
        SetofOptions: {
          from: "*"
          to: "applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_service_form_schema: {
        Args: {
          _description: string
          _documents: Json
          _schema: Json
          _service_code: string
          _title: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "super_admin"
        | "operations"
        | "support"
        | "accounts"
        | "finance"
        | "manager"
        | "executive"
      application_status:
        | "awaiting_payment"
        | "payment_received"
        | "details_pending"
        | "documents_pending"
        | "under_review"
        | "under_process"
        | "completed"
        | "form_submitted"
        | "documents_submitted"
        | "certificate_uploaded"
        | "certificate_ready"
        | "on_hold"
        | "cancelled"
        | "refund_pending"
        | "refunded"
        | "consultation_pending"
        | "consultation_scheduled"
        | "rejected"
      closure_stage:
        | "none"
        | "request_received"
        | "closure_pending"
        | "notice_sent"
        | "closed"
        | "concern_reply_sent"
        | "refund_reviewed"
        | "final_ticket_closed"
        | "acknowledged"
      complaint_status_enum:
        | "draft"
        | "submitted"
        | "under_review"
        | "awaiting_response"
        | "resolved"
        | "closed"
      email_log_status: "sent" | "failed" | "bounced"
      email_queue_status: "queued" | "sending" | "sent" | "failed" | "dlq"
      fulfillment_status_enum:
        | "order_received"
        | "documents_received"
        | "verification_pending"
        | "application_submitted"
        | "under_processing"
        | "completed"
        | "cancelled"
        | "form_not_submitted"
        | "form_submitted"
        | "technical_delay"
        | "customer_delay"
        | "consultation_completed"
        | "awaiting_govt"
        | "order_completed"
        | "certificate_rejected"
        | "ticket_open"
        | "order_closed"
        | "awaiting_customer_form"
        | "waiting_for_customer_submission"
        | "government_processing"
        | "application_approved"
        | "application_rejected"
      lead_status:
        | "lead_created"
        | "payment_pending"
        | "payment_successful"
        | "details_pending"
        | "documents_pending"
        | "under_review"
        | "under_process"
        | "completed"
        | "closed"
        | "new_lead"
        | "contacted"
        | "refund_requested"
      lead_status_enum:
        | "new_lead"
        | "contacted"
        | "follow_up_required"
        | "payment_pending"
        | "payment_failed"
        | "payment_successful"
        | "welcome_mail_sent"
        | "documents_pending"
        | "under_process"
        | "uninterested"
        | "refund_requested"
        | "refund_approved"
        | "refunded"
        | "closed"
        | "closed_refunded"
      order_status_enum:
        | "NEW_ORDER"
        | "WAITING_CUSTOMER_INFO"
        | "INFO_RECEIVED"
        | "IN_PROCESSING"
        | "CUSTOMER_HOLD"
        | "OUR_SIDE_DELAY"
        | "SUBMITTED_TO_GOVT"
        | "CERTIFICATE_ISSUED"
        | "COMPLETED"
        | "HIGH_PRIORITY"
        | "REFUND_REQUESTED"
        | "REFUND_APPROVED"
        | "REFUND_PROCESSED"
        | "CLOSED"
        | "REOPENED"
        | "PAYMENT_RECEIVED"
        | "ORDER_RECEIVED"
        | "FORM_PENDING"
        | "FORM_RECEIVED"
        | "TECHNICAL_HOLD_EXTERNAL"
        | "TECHNICAL_HOLD_INTERNAL"
        | "AWAITING_GOVT_APPROVAL"
        | "CHECKING_STATUS"
      payment_status: "created" | "attempted" | "paid" | "failed" | "refunded"
      payment_status_enum:
        | "pending"
        | "paid"
        | "partially_paid"
        | "refunded"
        | "cancelled"
        | "failed"
      priority_enum: "high" | "medium" | "low" | "urgent"
      refund_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "info_needed"
        | "escalated"
      support_ticket_state:
        | "open"
        | "pending"
        | "waiting_customer"
        | "closed"
        | "escalated"
      ticket_status_enum:
        | "open"
        | "in_progress"
        | "waiting_customer"
        | "resolved"
        | "closed"
      workflow_reminder_kind:
        | "followup_3d"
        | "followup_5d"
        | "followup_7d"
        | "closure_24h"
        | "custom"
        | "pending_closure_followup"
        | "internal_review"
      workflow_reminder_status: "pending" | "sent" | "cancelled" | "failed"
      workflow_status:
        | "new"
        | "documents_pending"
        | "processing"
        | "government_portal_pending"
        | "verification_pending"
        | "external_dependency"
        | "waiting_for_customer"
        | "waiting_for_documents"
        | "customer_non_responsive"
        | "processing_resumed"
        | "completed"
        | "pending_closure"
        | "closed"
        | "refund_review"
        | "refund_closed"
        | "cancelled"
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
    Enums: {
      app_role: [
        "admin",
        "super_admin",
        "operations",
        "support",
        "accounts",
        "finance",
        "manager",
        "executive",
      ],
      application_status: [
        "awaiting_payment",
        "payment_received",
        "details_pending",
        "documents_pending",
        "under_review",
        "under_process",
        "completed",
        "form_submitted",
        "documents_submitted",
        "certificate_uploaded",
        "certificate_ready",
        "on_hold",
        "cancelled",
        "refund_pending",
        "refunded",
        "consultation_pending",
        "consultation_scheduled",
        "rejected",
      ],
      closure_stage: [
        "none",
        "request_received",
        "closure_pending",
        "notice_sent",
        "closed",
        "concern_reply_sent",
        "refund_reviewed",
        "final_ticket_closed",
        "acknowledged",
      ],
      complaint_status_enum: [
        "draft",
        "submitted",
        "under_review",
        "awaiting_response",
        "resolved",
        "closed",
      ],
      email_log_status: ["sent", "failed", "bounced"],
      email_queue_status: ["queued", "sending", "sent", "failed", "dlq"],
      fulfillment_status_enum: [
        "order_received",
        "documents_received",
        "verification_pending",
        "application_submitted",
        "under_processing",
        "completed",
        "cancelled",
        "form_not_submitted",
        "form_submitted",
        "technical_delay",
        "customer_delay",
        "consultation_completed",
        "awaiting_govt",
        "order_completed",
        "certificate_rejected",
        "ticket_open",
        "order_closed",
        "awaiting_customer_form",
        "waiting_for_customer_submission",
        "government_processing",
        "application_approved",
        "application_rejected",
      ],
      lead_status: [
        "lead_created",
        "payment_pending",
        "payment_successful",
        "details_pending",
        "documents_pending",
        "under_review",
        "under_process",
        "completed",
        "closed",
        "new_lead",
        "contacted",
        "refund_requested",
      ],
      lead_status_enum: [
        "new_lead",
        "contacted",
        "follow_up_required",
        "payment_pending",
        "payment_failed",
        "payment_successful",
        "welcome_mail_sent",
        "documents_pending",
        "under_process",
        "uninterested",
        "refund_requested",
        "refund_approved",
        "refunded",
        "closed",
        "closed_refunded",
      ],
      order_status_enum: [
        "NEW_ORDER",
        "WAITING_CUSTOMER_INFO",
        "INFO_RECEIVED",
        "IN_PROCESSING",
        "CUSTOMER_HOLD",
        "OUR_SIDE_DELAY",
        "SUBMITTED_TO_GOVT",
        "CERTIFICATE_ISSUED",
        "COMPLETED",
        "HIGH_PRIORITY",
        "REFUND_REQUESTED",
        "REFUND_APPROVED",
        "REFUND_PROCESSED",
        "CLOSED",
        "REOPENED",
        "PAYMENT_RECEIVED",
        "ORDER_RECEIVED",
        "FORM_PENDING",
        "FORM_RECEIVED",
        "TECHNICAL_HOLD_EXTERNAL",
        "TECHNICAL_HOLD_INTERNAL",
        "AWAITING_GOVT_APPROVAL",
        "CHECKING_STATUS",
      ],
      payment_status: ["created", "attempted", "paid", "failed", "refunded"],
      payment_status_enum: [
        "pending",
        "paid",
        "partially_paid",
        "refunded",
        "cancelled",
        "failed",
      ],
      priority_enum: ["high", "medium", "low", "urgent"],
      refund_request_status: [
        "pending",
        "approved",
        "rejected",
        "info_needed",
        "escalated",
      ],
      support_ticket_state: [
        "open",
        "pending",
        "waiting_customer",
        "closed",
        "escalated",
      ],
      ticket_status_enum: [
        "open",
        "in_progress",
        "waiting_customer",
        "resolved",
        "closed",
      ],
      workflow_reminder_kind: [
        "followup_3d",
        "followup_5d",
        "followup_7d",
        "closure_24h",
        "custom",
        "pending_closure_followup",
        "internal_review",
      ],
      workflow_reminder_status: ["pending", "sent", "cancelled", "failed"],
      workflow_status: [
        "new",
        "documents_pending",
        "processing",
        "government_portal_pending",
        "verification_pending",
        "external_dependency",
        "waiting_for_customer",
        "waiting_for_documents",
        "customer_non_responsive",
        "processing_resumed",
        "completed",
        "pending_closure",
        "closed",
        "refund_review",
        "refund_closed",
        "cancelled",
      ],
    },
  },
} as const
