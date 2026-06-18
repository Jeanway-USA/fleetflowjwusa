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
      accessorial_types: {
        Row: {
          created_at: string
          default_is_driver_pay: boolean
          id: string
          is_active: boolean
          name: string
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_is_driver_pay?: boolean
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_is_driver_pay?: boolean
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accessorial_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accessorial_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "accessorial_types_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_loads: {
        Row: {
          broker_name: string | null
          broker_rate: number | null
          carrier_name: string | null
          carrier_rate: number | null
          created_at: string
          delivery_at: string | null
          delivery_date: string | null
          delivery_tz: string | null
          destination: string
          id: string
          load_reference: string | null
          margin: number | null
          notes: string | null
          org_id: string
          origin: string
          pickup_at: string | null
          pickup_date: string | null
          pickup_tz: string | null
          status: string
          updated_at: string
        }
        Insert: {
          broker_name?: string | null
          broker_rate?: number | null
          carrier_name?: string | null
          carrier_rate?: number | null
          created_at?: string
          delivery_at?: string | null
          delivery_date?: string | null
          delivery_tz?: string | null
          destination: string
          id?: string
          load_reference?: string | null
          margin?: number | null
          notes?: string | null
          org_id: string
          origin: string
          pickup_at?: string | null
          pickup_date?: string | null
          pickup_tz?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          broker_name?: string | null
          broker_rate?: number | null
          carrier_name?: string | null
          carrier_rate?: number | null
          created_at?: string
          delivery_at?: string | null
          delivery_date?: string | null
          delivery_tz?: string | null
          destination?: string
          id?: string
          load_reference?: string | null
          margin?: number | null
          notes?: string | null
          org_id?: string
          origin?: string
          pickup_at?: string | null
          pickup_date?: string | null
          pickup_tz?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "agency_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_commissions: {
        Row: {
          agent_name: string
          commission_amount: number
          commission_rate: number
          created_at: string
          id: string
          load_id: string | null
          notes: string | null
          org_id: string | null
          payout_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_name: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          load_id?: string | null
          notes?: string | null
          org_id?: string | null
          payout_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_name?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          id?: string
          load_id?: string | null
          notes?: string | null
          org_id?: string | null
          payout_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_commissions_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "agency_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "agent_commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          org_id: string | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          org_id?: string | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          org_id?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string
          id: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description: string
          id?: string
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string
          id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      company_resources: {
        Row: {
          address: string | null
          agent_code: string | null
          agent_status: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          org_id: string | null
          phone: string | null
          resource_type: string
          service_area: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agent_code?: string | null
          agent_status?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          resource_type: string
          service_area?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agent_code?: string | null
          agent_status?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          resource_type?: string
          service_area?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "company_resources_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          org_id: string | null
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string | null
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string | null
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "company_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_date: string
          activity_type: string
          contact_id: string
          created_at: string
          description: string | null
          id: string
          org_id: string | null
          subject: string
          user_id: string
        }
        Insert: {
          activity_date?: string
          activity_type?: string
          contact_id: string
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string | null
          subject: string
          user_id: string
        }
        Update: {
          activity_date?: string
          activity_type?: string
          contact_id?: string
          created_at?: string
          description?: string | null
          id?: string
          org_id?: string | null
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "crm_activities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contact_loads: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          load_id: string
          org_id: string | null
          relationship_type: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          load_id: string
          org_id?: string | null
          relationship_type: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          load_id?: string
          org_id?: string | null
          relationship_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_contact_loads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_loads_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contact_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "crm_contact_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          address: string | null
          agent_code: string | null
          agent_status: string | null
          city: string | null
          company_name: string
          contact_name: string | null
          contact_type: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          notes: string | null
          org_id: string | null
          phone: string | null
          state: string | null
          tags: string[] | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agent_code?: string | null
          agent_status?: string | null
          city?: string | null
          company_name: string
          contact_name?: string | null
          contact_type: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agent_code?: string | null
          agent_status?: string | null
          city?: string | null
          company_name?: string
          contact_name?: string | null
          contact_type?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string | null
          phone?: string | null
          state?: string | null
          tags?: string[] | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "crm_contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_requests: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          load_id: string
          notes: string | null
          org_id: string | null
          responded_at: string | null
          responded_by: string | null
          response_notes: string | null
          status: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          load_id: string
          notes?: string | null
          org_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          load_id?: string
          notes?: string | null
          org_id?: string | null
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_requests_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "detention_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      detention_rules: {
        Row: {
          created_at: string
          free_time_minutes: number
          hourly_rate: number
          id: string
          max_charge_per_day: number
          org_id: string
          trailer_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          free_time_minutes?: number
          hourly_rate?: number
          id?: string
          max_charge_per_day?: number
          org_id: string
          trailer_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          free_time_minutes?: number
          hourly_rate?: number
          id?: string
          max_charge_per_day?: number
          org_id?: string
          trailer_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "detention_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "detention_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "detention_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          document_type: string
          id: string
          is_active: boolean
          name: string | null
          org_id: string
          updated_at: string
          version: number
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          document_type: string
          id?: string
          is_active?: boolean
          name?: string | null
          org_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          document_type?: string
          id?: string
          is_active?: boolean
          name?: string | null
          org_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          notes: string | null
          org_id: string | null
          related_id: string | null
          related_type: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          notes?: string | null
          org_id?: string | null
          related_id?: string | null
          related_type?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          notes?: string | null
          org_id?: string | null
          related_id?: string | null
          related_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_banking_info: {
        Row: {
          account_number_encrypted: string | null
          account_number_last4: string | null
          account_type: string | null
          bank_name: string | null
          created_at: string
          driver_id: string
          id: string
          org_id: string
          routing_number_encrypted: string | null
          updated_at: string
        }
        Insert: {
          account_number_encrypted?: string | null
          account_number_last4?: string | null
          account_type?: string | null
          bank_name?: string | null
          created_at?: string
          driver_id: string
          id?: string
          org_id: string
          routing_number_encrypted?: string | null
          updated_at?: string
        }
        Update: {
          account_number_encrypted?: string | null
          account_number_last4?: string | null
          account_type?: string | null
          bank_name?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          org_id?: string
          routing_number_encrypted?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          heading: number | null
          id: string
          is_sharing: boolean
          latitude: number
          load_id: string | null
          longitude: number
          org_id: string | null
          speed: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          heading?: number | null
          id?: string
          is_sharing?: boolean
          latitude: number
          load_id?: string | null
          longitude: number
          org_id?: string | null
          speed?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          heading?: number | null
          id?: string
          is_sharing?: boolean
          latitude?: number
          load_id?: string | null
          longitude?: number
          org_id?: string | null
          speed?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_notifications: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          is_read: boolean
          message: string
          notification_type: string
          org_id: string | null
          related_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          is_read?: boolean
          message: string
          notification_type?: string
          org_id?: string | null
          related_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          is_read?: boolean
          message?: string
          notification_type?: string
          org_id?: string | null
          related_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_notifications_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_payroll: {
        Row: {
          created_at: string
          driver_id: string
          fuel_deductions: number | null
          gross_pay: number
          id: string
          net_pay: number | null
          notes: string | null
          org_id: string
          other_deductions: number | null
          period_end: string
          period_start: string
          repair_deductions: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          fuel_deductions?: number | null
          gross_pay?: number
          id?: string
          net_pay?: number | null
          notes?: string | null
          org_id: string
          other_deductions?: number | null
          period_end: string
          period_start: string
          repair_deductions?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          fuel_deductions?: number | null
          gross_pay?: number
          id?: string
          net_pay?: number | null
          notes?: string | null
          org_id?: string
          other_deductions?: number | null
          period_end?: string
          period_start?: string
          repair_deductions?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_payroll_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payroll_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payroll_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_payroll_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_payroll_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_performance_metrics: {
        Row: {
          created_at: string
          driver_id: string
          dvir_compliance_rate: number | null
          fuel_efficiency_mpg: number | null
          id: string
          incidents_count: number | null
          late_deliveries: number | null
          on_time_deliveries: number | null
          org_id: string | null
          overall_score: number | null
          period_end: string
          period_start: string
          period_type: string
          safety_score: number | null
          total_loads: number | null
          total_miles: number | null
          total_revenue: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          driver_id: string
          dvir_compliance_rate?: number | null
          fuel_efficiency_mpg?: number | null
          id?: string
          incidents_count?: number | null
          late_deliveries?: number | null
          on_time_deliveries?: number | null
          org_id?: string | null
          overall_score?: number | null
          period_end: string
          period_start: string
          period_type?: string
          safety_score?: number | null
          total_loads?: number | null
          total_miles?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          driver_id?: string
          dvir_compliance_rate?: number | null
          fuel_efficiency_mpg?: number | null
          id?: string
          incidents_count?: number | null
          late_deliveries?: number | null
          on_time_deliveries?: number | null
          org_id?: string | null
          overall_score?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          safety_score?: number | null
          total_loads?: number | null
          total_miles?: number | null
          total_revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_performance_metrics_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_performance_metrics_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_performance_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_performance_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_performance_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_requests: {
        Row: {
          created_at: string
          description: string | null
          driver_id: string
          end_date: string | null
          id: string
          load_id: string | null
          org_id: string | null
          priority: string
          request_type: string
          responded_at: string | null
          responded_by: string | null
          response_notes: string | null
          start_date: string | null
          status: string
          subject: string
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          driver_id: string
          end_date?: string | null
          id?: string
          load_id?: string | null
          org_id?: string | null
          priority?: string
          request_type: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          start_date?: string | null
          status?: string
          subject: string
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          driver_id?: string
          end_date?: string | null
          id?: string
          load_id?: string | null
          org_id?: string | null
          priority?: string
          request_type?: string
          responded_at?: string | null
          responded_by?: string | null
          response_notes?: string | null
          start_date?: string | null
          status?: string
          subject?: string
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_requests_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_requests_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_settings: {
        Row: {
          created_at: string
          driver_id: string
          goal_type: string
          id: string
          landstar_username: string | null
          org_id: string | null
          pay_week_start_day: number
          target_miles: number | null
          theme_preference: string | null
          updated_at: string
          weekly_miles_goal: number | null
          weekly_revenue_goal: number | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          goal_type?: string
          id?: string
          landstar_username?: string | null
          org_id?: string | null
          pay_week_start_day?: number
          target_miles?: number | null
          theme_preference?: string | null
          updated_at?: string
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          goal_type?: string
          id?: string
          landstar_username?: string | null
          org_id?: string | null
          pay_week_start_day?: number
          target_miles?: number | null
          theme_preference?: string | null
          updated_at?: string
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_settings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_settlement_items: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expense_id: string | null
          id: string
          item_type: string
          load_id: string | null
          org_id: string
          quantity: number | null
          rate: number | null
          settlement_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          item_type: string
          load_id?: string | null
          org_id: string
          quantity?: number | null
          rate?: number | null
          settlement_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_id?: string | null
          id?: string
          item_type?: string
          load_id?: string | null
          org_id?: string
          quantity?: number | null
          rate?: number | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "driver_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_settlements: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          base_pay: number
          bonus_pay: number
          created_at: string
          deductions: number
          driver_id: string
          id: string
          net_pay: number | null
          notes: string | null
          org_id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number
          bonus_pay?: number
          created_at?: string
          deductions?: number
          driver_id: string
          id?: string
          net_pay?: number | null
          notes?: string | null
          org_id: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          base_pay?: number
          bonus_pay?: number
          created_at?: string
          deductions?: number
          driver_id?: string
          id?: string
          net_pay?: number | null
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      driver_signed_documents: {
        Row: {
          attachment_file_path: string | null
          created_at: string
          document_type: string
          driver_address: string | null
          driver_id: string
          file_path: string
          id: string
          org_id: string
          review_status: Database["public"]["Enums"]["onboarding_review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          revision_notes: string | null
          signature_data_url: string | null
          signed_at: string
          template_id: string | null
        }
        Insert: {
          attachment_file_path?: string | null
          created_at?: string
          document_type: string
          driver_address?: string | null
          driver_id: string
          file_path: string
          id?: string
          org_id: string
          review_status?: Database["public"]["Enums"]["onboarding_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_notes?: string | null
          signature_data_url?: string | null
          signed_at?: string
          template_id?: string | null
        }
        Update: {
          attachment_file_path?: string | null
          created_at?: string
          document_type?: string
          driver_address?: string | null
          driver_id?: string
          file_path?: string
          id?: string
          org_id?: string
          review_status?: Database["public"]["Enums"]["onboarding_review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_notes?: string | null
          signature_data_url?: string | null
          signed_at?: string
          template_id?: string | null
        }
        Relationships: []
      }
      drivers: {
        Row: {
          avatar_url: string | null
          created_at: string
          credentials_review_status: Database["public"]["Enums"]["onboarding_review_status"]
          credentials_reviewed_at: string | null
          credentials_reviewed_by: string | null
          credentials_revision_notes: string | null
          direct_deposit_attachment_url: string | null
          email: string | null
          endorsements: string[] | null
          first_name: string
          has_twic: boolean | null
          hazmat_expiry: string | null
          hire_date: string | null
          id: string
          landstar_operator_id: string | null
          last_name: string
          license_expiry: string | null
          license_number: string | null
          license_state: string | null
          medical_card_expiry: string | null
          mvr_expiry: string | null
          org_id: string
          pay_rate: number | null
          pay_type: string | null
          phone: string | null
          status: string
          twic_expiry: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credentials_review_status?: Database["public"]["Enums"]["onboarding_review_status"]
          credentials_reviewed_at?: string | null
          credentials_reviewed_by?: string | null
          credentials_revision_notes?: string | null
          direct_deposit_attachment_url?: string | null
          email?: string | null
          endorsements?: string[] | null
          first_name: string
          has_twic?: boolean | null
          hazmat_expiry?: string | null
          hire_date?: string | null
          id?: string
          landstar_operator_id?: string | null
          last_name: string
          license_expiry?: string | null
          license_number?: string | null
          license_state?: string | null
          medical_card_expiry?: string | null
          mvr_expiry?: string | null
          org_id: string
          pay_rate?: number | null
          pay_type?: string | null
          phone?: string | null
          status?: string
          twic_expiry?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credentials_review_status?: Database["public"]["Enums"]["onboarding_review_status"]
          credentials_reviewed_at?: string | null
          credentials_reviewed_by?: string | null
          credentials_revision_notes?: string | null
          direct_deposit_attachment_url?: string | null
          email?: string | null
          endorsements?: string[] | null
          first_name?: string
          has_twic?: boolean | null
          hazmat_expiry?: string | null
          hire_date?: string | null
          id?: string
          landstar_operator_id?: string | null
          last_name?: string
          license_expiry?: string | null
          license_number?: string | null
          license_state?: string | null
          medical_card_expiry?: string | null
          mvr_expiry?: string | null
          org_id?: string
          pay_rate?: number | null
          pay_type?: string | null
          phone?: string | null
          status?: string
          twic_expiry?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          expense_date: string
          expense_type: string
          gallons: number | null
          id: string
          is_approved: boolean
          jurisdiction: string | null
          load_id: string | null
          notes: string | null
          org_id: string
          truck_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_type: string
          gallons?: number | null
          id?: string
          is_approved?: boolean
          jurisdiction?: string | null
          load_id?: string | null
          notes?: string | null
          org_id: string
          truck_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_type?: string
          gallons?: number | null
          id?: string
          is_approved?: boolean
          jurisdiction?: string | null
          load_id?: string | null
          notes?: string | null
          org_id?: string
          truck_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      facilities: {
        Row: {
          address: string
          appointment_required: boolean | null
          city: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          dock_info: string | null
          facility_type: string
          id: string
          name: string
          notes: string | null
          operating_hours: string | null
          org_id: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address: string
          appointment_required?: boolean | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dock_info?: string | null
          facility_type?: string
          id?: string
          name: string
          notes?: string | null
          operating_hours?: string | null
          org_id?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string
          appointment_required?: boolean | null
          city?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          dock_info?: string | null
          facility_type?: string
          id?: string
          name?: string
          notes?: string | null
          operating_hours?: string | null
          org_id?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "facilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_loads: {
        Row: {
          accessorials: number | null
          actual_miles: number | null
          advance_available: number | null
          advance_taken: number | null
          agency_code: string | null
          auto_email_updates: boolean
          booked_miles: number | null
          cf_7512_number: string | null
          created_at: string
          current_route_geometry: Json | null
          current_route_origin: Json | null
          current_route_updated_at: string | null
          delivery_at: string | null
          delivery_date: string | null
          delivery_time: string | null
          delivery_time_type: string
          delivery_tz: string | null
          destination: string
          detention_hours: number | null
          detention_pay: number | null
          driver_id: string | null
          empty_miles: number | null
          end_miles: number | null
          factoring_status: string | null
          factoring_submission_id: string | null
          fuel_advance: number | null
          fuel_surcharge: number | null
          gross_revenue: number | null
          height_inches: number | null
          id: string
          invoice_email: string | null
          invoice_number: string | null
          invoice_status: string | null
          invoice_url: string | null
          invoiced_at: string | null
          is_in_bond: boolean
          is_power_only: boolean | null
          is_spotted_trailer: boolean
          landstar_load_id: string | null
          length_inches: number | null
          lumper: number | null
          negotiation_notes: string | null
          net_revenue: number | null
          notes: string | null
          org_id: string
          origin: string
          pickup_at: string | null
          pickup_date: string | null
          pickup_number: string | null
          pickup_time: string | null
          pickup_time_type: string
          pickup_tz: string | null
          pod_required: boolean
          pod_signature_path: string | null
          pod_transflo_link: string | null
          rate: number | null
          settlement: number | null
          start_miles: number | null
          status: string
          tracking_id: string | null
          trailer_id: string | null
          trailer_revenue: number | null
          truck_id: string | null
          truck_revenue: number | null
          updated_at: string
          width_inches: number | null
        }
        Insert: {
          accessorials?: number | null
          actual_miles?: number | null
          advance_available?: number | null
          advance_taken?: number | null
          agency_code?: string | null
          auto_email_updates?: boolean
          booked_miles?: number | null
          cf_7512_number?: string | null
          created_at?: string
          current_route_geometry?: Json | null
          current_route_origin?: Json | null
          current_route_updated_at?: string | null
          delivery_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_time_type?: string
          delivery_tz?: string | null
          destination: string
          detention_hours?: number | null
          detention_pay?: number | null
          driver_id?: string | null
          empty_miles?: number | null
          end_miles?: number | null
          factoring_status?: string | null
          factoring_submission_id?: string | null
          fuel_advance?: number | null
          fuel_surcharge?: number | null
          gross_revenue?: number | null
          height_inches?: number | null
          id?: string
          invoice_email?: string | null
          invoice_number?: string | null
          invoice_status?: string | null
          invoice_url?: string | null
          invoiced_at?: string | null
          is_in_bond?: boolean
          is_power_only?: boolean | null
          is_spotted_trailer?: boolean
          landstar_load_id?: string | null
          length_inches?: number | null
          lumper?: number | null
          negotiation_notes?: string | null
          net_revenue?: number | null
          notes?: string | null
          org_id: string
          origin: string
          pickup_at?: string | null
          pickup_date?: string | null
          pickup_number?: string | null
          pickup_time?: string | null
          pickup_time_type?: string
          pickup_tz?: string | null
          pod_required?: boolean
          pod_signature_path?: string | null
          pod_transflo_link?: string | null
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
          tracking_id?: string | null
          trailer_id?: string | null
          trailer_revenue?: number | null
          truck_id?: string | null
          truck_revenue?: number | null
          updated_at?: string
          width_inches?: number | null
        }
        Update: {
          accessorials?: number | null
          actual_miles?: number | null
          advance_available?: number | null
          advance_taken?: number | null
          agency_code?: string | null
          auto_email_updates?: boolean
          booked_miles?: number | null
          cf_7512_number?: string | null
          created_at?: string
          current_route_geometry?: Json | null
          current_route_origin?: Json | null
          current_route_updated_at?: string | null
          delivery_at?: string | null
          delivery_date?: string | null
          delivery_time?: string | null
          delivery_time_type?: string
          delivery_tz?: string | null
          destination?: string
          detention_hours?: number | null
          detention_pay?: number | null
          driver_id?: string | null
          empty_miles?: number | null
          end_miles?: number | null
          factoring_status?: string | null
          factoring_submission_id?: string | null
          fuel_advance?: number | null
          fuel_surcharge?: number | null
          gross_revenue?: number | null
          height_inches?: number | null
          id?: string
          invoice_email?: string | null
          invoice_number?: string | null
          invoice_status?: string | null
          invoice_url?: string | null
          invoiced_at?: string | null
          is_in_bond?: boolean
          is_power_only?: boolean | null
          is_spotted_trailer?: boolean
          landstar_load_id?: string | null
          length_inches?: number | null
          lumper?: number | null
          negotiation_notes?: string | null
          net_revenue?: number | null
          notes?: string | null
          org_id?: string
          origin?: string
          pickup_at?: string | null
          pickup_date?: string | null
          pickup_number?: string | null
          pickup_time?: string | null
          pickup_time_type?: string
          pickup_tz?: string | null
          pod_required?: boolean
          pod_signature_path?: string | null
          pod_transflo_link?: string | null
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
          tracking_id?: string | null
          trailer_id?: string | null
          trailer_revenue?: number | null
          truck_id?: string | null
          truck_revenue?: number | null
          updated_at?: string
          width_inches?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_loads_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_loads_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "fleet_loads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_loads_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      fuel_purchases: {
        Row: {
          created_at: string
          driver_id: string | null
          gallons: number
          id: string
          jurisdiction: string
          org_id: string | null
          price_per_gallon: number
          purchase_date: string
          receipt_url: string | null
          source_expense_id: string | null
          total_cost: number
          truck_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          created_at?: string
          driver_id?: string | null
          gallons?: number
          id?: string
          jurisdiction: string
          org_id?: string | null
          price_per_gallon?: number
          purchase_date?: string
          receipt_url?: string | null
          source_expense_id?: string | null
          total_cost?: number
          truck_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          created_at?: string
          driver_id?: string | null
          gallons?: number
          id?: string
          jurisdiction?: string
          org_id?: string | null
          price_per_gallon?: number
          purchase_date?: string
          receipt_url?: string | null
          source_expense_id?: string | null
          total_cost?: number
          truck_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fuel_purchases_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "fuel_purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_source_expense_id_fkey"
            columns: ["source_expense_id"]
            isOneToOne: true
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fuel_purchases_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      general_ledger: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          notes: string | null
          org_id: string | null
          reference_id: string | null
          reference_type: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description: string
          id?: string
          notes?: string | null
          org_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "general_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "general_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "general_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ifta_records: {
        Row: {
          created_at: string
          fuel_cost: number | null
          fuel_gallons: number | null
          id: string
          jurisdiction: string
          org_id: string | null
          quarter: string
          tax_owed: number | null
          tax_rate: number | null
          taxable_miles: number | null
          total_miles: number | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          fuel_cost?: number | null
          fuel_gallons?: number | null
          id?: string
          jurisdiction: string
          org_id?: string | null
          quarter: string
          tax_owed?: number | null
          tax_rate?: number | null
          taxable_miles?: number | null
          total_miles?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          fuel_cost?: number | null
          fuel_gallons?: number | null
          id?: string
          jurisdiction?: string
          org_id?: string | null
          quarter?: string
          tax_owed?: number | null
          tax_rate?: number | null
          taxable_miles?: number | null
          total_miles?: number | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ifta_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ifta_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "ifta_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ifta_records_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_photos: {
        Row: {
          description: string | null
          id: string
          incident_id: string
          org_id: string | null
          photo_url: string
          uploaded_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          incident_id: string
          org_id?: string | null
          photo_url: string
          uploaded_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          incident_id?: string
          org_id?: string | null
          photo_url?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_photos_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "incident_photos_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_witnesses: {
        Row: {
          created_at: string
          email: string | null
          id: string
          incident_id: string
          name: string
          org_id: string | null
          phone: string | null
          statement: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          incident_id: string
          name: string
          org_id?: string | null
          phone?: string | null
          statement?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          incident_id?: string
          name?: string
          org_id?: string | null
          phone?: string | null
          statement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_witnesses_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_witnesses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_witnesses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "incident_witnesses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          citation_issued: boolean | null
          created_at: string
          description: string
          driver_id: string | null
          estimated_damage: number | null
          id: string
          incident_date: string
          incident_type: string
          injuries_reported: boolean | null
          injury_details: string | null
          insurance_claim_number: string | null
          latitude: number | null
          location_description: string | null
          longitude: number | null
          org_id: string | null
          police_report_number: string | null
          reported_by: string | null
          resolution_notes: string | null
          severity: string
          status: string
          trailer_id: string | null
          truck_id: string | null
          updated_at: string
        }
        Insert: {
          citation_issued?: boolean | null
          created_at?: string
          description: string
          driver_id?: string | null
          estimated_damage?: number | null
          id?: string
          incident_date?: string
          incident_type?: string
          injuries_reported?: boolean | null
          injury_details?: string | null
          insurance_claim_number?: string | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          org_id?: string | null
          police_report_number?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          severity?: string
          status?: string
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Update: {
          citation_issued?: boolean | null
          created_at?: string
          description?: string
          driver_id?: string | null
          estimated_damage?: number | null
          id?: string
          incident_date?: string
          incident_type?: string
          injuries_reported?: boolean | null
          injury_details?: string | null
          insurance_claim_number?: string | null
          latitude?: number | null
          location_description?: string | null
          longitude?: number | null
          org_id?: string | null
          police_report_number?: string | null
          reported_by?: string | null
          resolution_notes?: string | null
          severity?: string
          status?: string
          trailer_id?: string | null
          truck_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_config: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          driver_id: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          invited_user_id: string | null
          is_existing_user: boolean
          org_id: string
          requires_onboarding: boolean
          role: Database["public"]["Enums"]["app_role"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          driver_id?: string | null
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          invited_user_id?: string | null
          is_existing_user?: boolean
          org_id: string
          requires_onboarding?: boolean
          role: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          driver_id?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          invited_user_id?: string | null
          is_existing_user?: boolean
          org_id?: string
          requires_onboarding?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          token?: string
        }
        Relationships: []
      }
      load_accessorials: {
        Row: {
          accessorial_type: string
          amount: number
          created_at: string
          id: string
          is_driver_pay: boolean
          load_id: string
          notes: string | null
          org_id: string | null
          percentage: number | null
          updated_at: string
        }
        Insert: {
          accessorial_type: string
          amount?: number
          created_at?: string
          id?: string
          is_driver_pay?: boolean
          load_id: string
          notes?: string | null
          org_id?: string | null
          percentage?: number | null
          updated_at?: string
        }
        Update: {
          accessorial_type?: string
          amount?: number
          created_at?: string
          id?: string
          is_driver_pay?: boolean
          load_id?: string
          notes?: string | null
          org_id?: string | null
          percentage?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_accessorials_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_accessorials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_accessorials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "load_accessorials_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      load_expenses: {
        Row: {
          card_load: number | null
          cell_phone: number | null
          created_at: string
          food_bev: number | null
          fuel_cost: number | null
          fuel_gallons: number | null
          household: number | null
          id: string
          insurance: number | null
          laundry: number | null
          lcn_satellite: number | null
          licensing_permits: number | null
          load_id: string
          lumper: number | null
          maintenance_fund: number | null
          misc_operating: number | null
          motel: number | null
          notes: string | null
          office_supplies: number | null
          oil: number | null
          operating_total: number | null
          org_id: string | null
          other_personal: number | null
          parking: number | null
          personal_total: number | null
          prepass_scale: number | null
          repairs_parts: number | null
          retirement: number | null
          road_fuel_tax: number | null
          savings: number | null
          shower: number | null
          tires: number | null
          tolls: number | null
          trailer_payment: number | null
          trip_scanning: number | null
          truck_payment: number | null
          updated_at: string
        }
        Insert: {
          card_load?: number | null
          cell_phone?: number | null
          created_at?: string
          food_bev?: number | null
          fuel_cost?: number | null
          fuel_gallons?: number | null
          household?: number | null
          id?: string
          insurance?: number | null
          laundry?: number | null
          lcn_satellite?: number | null
          licensing_permits?: number | null
          load_id: string
          lumper?: number | null
          maintenance_fund?: number | null
          misc_operating?: number | null
          motel?: number | null
          notes?: string | null
          office_supplies?: number | null
          oil?: number | null
          operating_total?: number | null
          org_id?: string | null
          other_personal?: number | null
          parking?: number | null
          personal_total?: number | null
          prepass_scale?: number | null
          repairs_parts?: number | null
          retirement?: number | null
          road_fuel_tax?: number | null
          savings?: number | null
          shower?: number | null
          tires?: number | null
          tolls?: number | null
          trailer_payment?: number | null
          trip_scanning?: number | null
          truck_payment?: number | null
          updated_at?: string
        }
        Update: {
          card_load?: number | null
          cell_phone?: number | null
          created_at?: string
          food_bev?: number | null
          fuel_cost?: number | null
          fuel_gallons?: number | null
          household?: number | null
          id?: string
          insurance?: number | null
          laundry?: number | null
          lcn_satellite?: number | null
          licensing_permits?: number | null
          load_id?: string
          lumper?: number | null
          maintenance_fund?: number | null
          misc_operating?: number | null
          motel?: number | null
          notes?: string | null
          office_supplies?: number | null
          oil?: number | null
          operating_total?: number | null
          org_id?: string | null
          other_personal?: number | null
          parking?: number | null
          personal_total?: number | null
          prepass_scale?: number | null
          repairs_parts?: number | null
          retirement?: number | null
          road_fuel_tax?: number | null
          savings?: number | null
          shower?: number | null
          tires?: number | null
          tolls?: number | null
          trailer_payment?: number | null
          trip_scanning?: number | null
          truck_payment?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "load_expenses_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "load_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      load_status_logs: {
        Row: {
          changed_at: string
          changed_by: string | null
          id: string
          load_id: string
          new_status: string
          notes: string | null
          org_id: string | null
          previous_status: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          load_id: string
          new_status: string
          notes?: string | null
          org_id?: string | null
          previous_status?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          load_id?: string
          new_status?: string
          notes?: string | null
          org_id?: string | null
          previous_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "load_status_logs_load_id_fkey"
            columns: ["load_id"]
            isOneToOne: false
            referencedRelation: "fleet_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_status_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "load_status_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "load_status_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_logs: {
        Row: {
          cost: number | null
          created_at: string
          description: string | null
          id: string
          next_service_date: string | null
          org_id: string | null
          service_date: string
          service_type: string
          truck_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          next_service_date?: string | null
          org_id?: string | null
          service_date?: string
          service_type: string
          truck_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          next_service_date?: string | null
          org_id?: string | null
          service_date?: string
          service_type?: string
          truck_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "maintenance_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_logs_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_request_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          message_type: string
          org_id: string
          recommendation: Json | null
          request_id: string
          sender_name: string | null
          sender_role: string
          sender_user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_type?: string
          org_id: string
          recommendation?: Json | null
          request_id: string
          sender_name?: string | null
          sender_role: string
          sender_user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_type?: string
          org_id?: string
          recommendation?: Json | null
          request_id?: string
          sender_name?: string | null
          sender_role?: string
          sender_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_request_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_request_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "maintenance_request_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_request_messages_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_requests: {
        Row: {
          admin_notes: string | null
          created_at: string
          description: string
          driver_id: string
          id: string
          issue_type: string
          org_id: string | null
          priority: string
          status: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          description: string
          driver_id: string
          id?: string
          issue_type: string
          org_id?: string | null
          priority?: string
          status?: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          description?: string
          driver_id?: string
          id?: string
          issue_type?: string
          org_id?: string | null
          priority?: string
          status?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "maintenance_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturer_pm_profiles: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          interval_days: number | null
          interval_miles: number | null
          manufacturer: string
          service_code: string
          service_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          interval_days?: number | null
          interval_miles?: number | null
          manufacturer: string
          service_code: string
          service_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          interval_days?: number | null
          interval_miles?: number | null
          manufacturer?: string
          service_code?: string
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_read: boolean
          org_id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          org_id: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          org_id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: []
      }
      org_storage_config: {
        Row: {
          connected_at: string | null
          created_at: string
          encrypted_credentials: string | null
          id: string
          is_active: boolean
          org_id: string
          provider: string
          root_folder_id: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          encrypted_credentials?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          provider?: string
          root_folder_id?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          encrypted_credentials?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          provider?: string
          root_folder_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_storage_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_storage_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_storage_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          applied_promo_code_id: string | null
          banner_url: string | null
          company_timezone: string
          complimentary_ends_at: string | null
          created_at: string
          dot_number: string | null
          factoring_enabled: boolean | null
          factoring_fee_percentage: number | null
          factoring_provider_name: string | null
          factoring_remit_address: string | null
          hide_promotions: boolean
          id: string
          is_active: boolean
          is_complimentary: boolean
          logo_url: string | null
          mc_number: string | null
          name: string
          primary_color: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          subscription_tier: string
          tms_mode: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          applied_promo_code_id?: string | null
          banner_url?: string | null
          company_timezone?: string
          complimentary_ends_at?: string | null
          created_at?: string
          dot_number?: string | null
          factoring_enabled?: boolean | null
          factoring_fee_percentage?: number | null
          factoring_provider_name?: string | null
          factoring_remit_address?: string | null
          hide_promotions?: boolean
          id?: string
          is_active?: boolean
          is_complimentary?: boolean
          logo_url?: string | null
          mc_number?: string | null
          name: string
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          tms_mode?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          applied_promo_code_id?: string | null
          banner_url?: string | null
          company_timezone?: string
          complimentary_ends_at?: string | null
          created_at?: string
          dot_number?: string | null
          factoring_enabled?: boolean | null
          factoring_fee_percentage?: number | null
          factoring_provider_name?: string | null
          factoring_remit_address?: string | null
          hide_promotions?: boolean
          id?: string
          is_active?: boolean
          is_complimentary?: boolean
          logo_url?: string | null
          mc_number?: string | null
          name?: string
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string
          tms_mode?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_applied_promo_code_id_fkey"
            columns: ["applied_promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      over_dimension_rules: {
        Row: {
          cents_per_mile: number
          created_at: string
          dimension: string
          id: string
          max_inches: number | null
          min_charge: number
          min_inches: number
          org_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cents_per_mile?: number
          created_at?: string
          dimension: string
          id?: string
          max_inches?: number | null
          min_charge?: number
          min_inches: number
          org_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cents_per_mile?: number
          created_at?: string
          dimension?: string
          id?: string
          max_inches?: number | null
          min_charge?: number
          min_inches?: number
          org_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "over_dimension_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "over_dimension_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "over_dimension_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      parts_inventory: {
        Row: {
          category: string | null
          created_at: string
          id: string
          last_restocked: string | null
          min_threshold: number
          notes: string | null
          org_id: string
          part_name: string
          part_number: string | null
          quantity_on_hand: number
          reorder_requested_at: string | null
          reorder_url: string | null
          unit: string
          updated_at: string
          vendor_name: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          last_restocked?: string | null
          min_threshold?: number
          notes?: string | null
          org_id: string
          part_name: string
          part_number?: string | null
          quantity_on_hand?: number
          reorder_requested_at?: string | null
          reorder_url?: string | null
          unit?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          last_restocked?: string | null
          min_threshold?: number
          notes?: string | null
          org_id?: string
          part_name?: string
          part_number?: string | null
          quantity_on_hand?: number
          reorder_requested_at?: string | null
          reorder_url?: string | null
          unit?: string
          updated_at?: string
          vendor_name?: string | null
        }
        Relationships: []
      }
      pm_notifications: {
        Row: {
          created_at: string
          days_or_miles_remaining: number | null
          dismissed_at: string | null
          id: string
          is_read: boolean
          notification_type: string
          org_id: string | null
          service_code: string | null
          service_name: string
          truck_id: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          days_or_miles_remaining?: number | null
          dismissed_at?: string | null
          id?: string
          is_read?: boolean
          notification_type: string
          org_id?: string | null
          service_code?: string | null
          service_name: string
          truck_id: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          days_or_miles_remaining?: number | null
          dismissed_at?: string | null
          id?: string
          is_read?: boolean
          notification_type?: string
          org_id?: string | null
          service_code?: string | null
          service_name?: string
          truck_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pm_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_notifications_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          first_name: string | null
          has_completed_onboarding_tour: boolean
          id: string
          last_name: string | null
          onboarding_completed: boolean
          org_id: string | null
          phone: string | null
          requires_onboarding: boolean
          time_display_pref: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          has_completed_onboarding_tour?: boolean
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          requires_onboarding?: boolean
          time_display_pref?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          has_completed_onboarding_tour?: boolean
          id?: string
          last_name?: string | null
          onboarding_completed?: boolean
          org_id?: string | null
          phone?: string | null
          requires_onboarding?: boolean
          time_display_pref?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          id: string
          is_global_event: boolean
          max_uses: number | null
          times_used: number
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_global_event?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string
          valid_until: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          id?: string
          is_global_event?: boolean
          max_uses?: number | null
          times_used?: number
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: []
      }
      safety_bonus_settings: {
        Row: {
          created_at: string
          id: string
          max_bonus_amount: number
          org_id: string
          period_length_days: number
          requires_zero_accidents: boolean
          requires_zero_csa_points: boolean
          requires_zero_service_failures: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_bonus_amount?: number
          org_id: string
          period_length_days?: number
          requires_zero_accidents?: boolean
          requires_zero_csa_points?: boolean
          requires_zero_service_failures?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_bonus_amount?: number
          org_id?: string
          period_length_days?: number
          requires_zero_accidents?: boolean
          requires_zero_csa_points?: boolean
          requires_zero_service_failures?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      safety_bonus_tiers: {
        Row: {
          created_at: string
          id: string
          max_miles: number | null
          min_miles: number
          org_id: string
          rate_per_mile: number
          setting_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_miles?: number | null
          min_miles: number
          org_id: string
          rate_per_mile?: number
          setting_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_miles?: number | null
          min_miles?: number
          org_id?: string
          rate_per_mile?: number
          setting_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "safety_bonus_tiers_setting_id_fkey"
            columns: ["setting_id"]
            isOneToOne: false
            referencedRelation: "safety_bonus_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      service_schedules: {
        Row: {
          created_at: string
          id: string
          interval_days: number | null
          interval_miles: number | null
          last_performed_date: string | null
          last_performed_miles: number | null
          org_id: string | null
          profile_service_id: string | null
          service_name: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_miles?: number | null
          last_performed_date?: string | null
          last_performed_miles?: number | null
          org_id?: string | null
          profile_service_id?: string | null
          service_name: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          interval_days?: number | null
          interval_miles?: number | null
          last_performed_date?: string | null
          last_performed_miles?: number | null
          org_id?: string | null
          profile_service_id?: string | null
          service_name?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "service_schedules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_profile_service_id_fkey"
            columns: ["profile_service_id"]
            isOneToOne: false
            referencedRelation: "manufacturer_pm_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_schedules_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_line_items: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          load_id: string | null
          org_id: string | null
          settlement_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          id?: string
          load_id?: string | null
          org_id?: string | null
          settlement_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          load_id?: string | null
          org_id?: string | null
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "settlement_line_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_line_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          cash_advances: number | null
          cpp_benefits: number | null
          created_at: string
          driver_id: string
          driver_pay: number
          escrow_deduction: number | null
          fuel_advances: number | null
          gross_revenue: number
          id: string
          insurance_liability: number | null
          lcn_satellite_fees: number | null
          net_pay: number | null
          notes: string | null
          org_id: string | null
          other_deductions: number | null
          pdf_url: string | null
          period_end: string
          period_start: string
          plates_permits: number | null
          prepass_scale_fees: number | null
          status: string
          trailer_rental: number | null
          updated_at: string
        }
        Insert: {
          cash_advances?: number | null
          cpp_benefits?: number | null
          created_at?: string
          driver_id: string
          driver_pay?: number
          escrow_deduction?: number | null
          fuel_advances?: number | null
          gross_revenue?: number
          id?: string
          insurance_liability?: number | null
          lcn_satellite_fees?: number | null
          net_pay?: number | null
          notes?: string | null
          org_id?: string | null
          other_deductions?: number | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          plates_permits?: number | null
          prepass_scale_fees?: number | null
          status?: string
          trailer_rental?: number | null
          updated_at?: string
        }
        Update: {
          cash_advances?: number | null
          cpp_benefits?: number | null
          created_at?: string
          driver_id?: string
          driver_pay?: number
          escrow_deduction?: number | null
          fuel_advances?: number | null
          gross_revenue?: number
          id?: string
          insurance_liability?: number | null
          lcn_satellite_fees?: number | null
          net_pay?: number | null
          notes?: string | null
          org_id?: string | null
          other_deductions?: number | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          plates_permits?: number | null
          prepass_scale_fees?: number | null
          status?: string
          trailer_rental?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "settlements_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          base_price_annual: number
          base_price_monthly: number
          created_at: string
          features_json: Json | null
          id: string
          is_active: boolean
          tier: string
          updated_at: string
        }
        Insert: {
          base_price_annual?: number
          base_price_monthly?: number
          created_at?: string
          features_json?: Json | null
          id?: string
          is_active?: boolean
          tier: string
          updated_at?: string
        }
        Update: {
          base_price_annual?: number
          base_price_monthly?: number
          created_at?: string
          features_json?: Json | null
          id?: string
          is_active?: boolean
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trailer_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          driver_id: string | null
          id: string
          org_id: string | null
          released_at: string | null
          trailer_id: string
          truck_id: string | null
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          org_id?: string | null
          released_at?: string | null
          trailer_id: string
          truck_id?: string | null
        }
        Update: {
          assigned_at?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          org_id?: string | null
          released_at?: string | null
          trailer_id?: string
          truck_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trailer_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "trailer_assignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailer_assignments_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "trailers"
            referencedColumns: ["id"]
          },
        ]
      }
      trailers: {
        Row: {
          created_at: string
          current_driver_id: string | null
          id: string
          last_inspection_date: string | null
          license_plate: string | null
          license_plate_state: string | null
          make: string | null
          model: string | null
          monthly_payment: number | null
          next_inspection_date: string | null
          notes: string | null
          org_id: string | null
          owned_or_leased: string | null
          status: string
          trailer_type: string
          unit_number: string
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          current_driver_id?: string | null
          id?: string
          last_inspection_date?: string | null
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          monthly_payment?: number | null
          next_inspection_date?: string | null
          notes?: string | null
          org_id?: string | null
          owned_or_leased?: string | null
          status?: string
          trailer_type?: string
          unit_number: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          current_driver_id?: string | null
          id?: string
          last_inspection_date?: string | null
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          monthly_payment?: number | null
          next_inspection_date?: string | null
          notes?: string | null
          org_id?: string | null
          owned_or_leased?: string | null
          status?: string
          trailer_type?: string
          unit_number?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trailers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trailers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "trailers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_stops: {
        Row: {
          amenities: string[] | null
          brand: string | null
          city: string | null
          created_at: string
          fetched_at: string
          id: string
          latitude: number
          longitude: number
          name: string
          osm_id: number
          source: string | null
          state: string
        }
        Insert: {
          amenities?: string[] | null
          brand?: string | null
          city?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          latitude: number
          longitude: number
          name: string
          osm_id: number
          source?: string | null
          state: string
        }
        Update: {
          amenities?: string[] | null
          brand?: string | null
          city?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          latitude?: number
          longitude?: number
          name?: string
          osm_id?: number
          source?: string | null
          state?: string
        }
        Relationships: []
      }
      trucks: {
        Row: {
          created_at: string
          current_driver_id: string | null
          current_odometer: number | null
          id: string
          interest_rate: number | null
          last_120_inspection_date: string | null
          last_120_inspection_miles: number | null
          lender_name: string | null
          license_plate: string | null
          license_plate_state: string | null
          loan_balance: number | null
          loan_start_date: string | null
          loan_term_months: number | null
          make: string | null
          model: string | null
          monthly_payment: number | null
          next_inspection_date: string | null
          org_id: string
          purchase_mileage: number | null
          status: string
          unit_number: string
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          current_driver_id?: string | null
          current_odometer?: number | null
          id?: string
          interest_rate?: number | null
          last_120_inspection_date?: string | null
          last_120_inspection_miles?: number | null
          lender_name?: string | null
          license_plate?: string | null
          license_plate_state?: string | null
          loan_balance?: number | null
          loan_start_date?: string | null
          loan_term_months?: number | null
          make?: string | null
          model?: string | null
          monthly_payment?: number | null
          next_inspection_date?: string | null
          org_id: string
          purchase_mileage?: number | null
          status?: string
          unit_number: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          current_driver_id?: string | null
          current_odometer?: number | null
          id?: string
          interest_rate?: number | null
          last_120_inspection_date?: string | null
          last_120_inspection_miles?: number | null
          lender_name?: string | null
          license_plate?: string | null
          license_plate_state?: string | null
          loan_balance?: number | null
          loan_start_date?: string | null
          loan_term_months?: number | null
          make?: string | null
          model?: string | null
          monthly_payment?: number | null
          next_inspection_date?: string | null
          org_id?: string
          purchase_mileage?: number | null
          status?: string
          unit_number?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trucks_current_driver_id_fkey"
            columns: ["current_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_current_driver_id_fkey"
            columns: ["current_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trucks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "trucks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_feedback: {
        Row: {
          created_at: string
          description: string
          feedback_type: string
          id: string
          org_id: string | null
          page_url: string | null
          screenshot_url: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          feedback_type: string
          id?: string
          org_id?: string | null
          page_url?: string | null
          screenshot_url?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          feedback_type?: string
          id?: string
          org_id?: string | null
          page_url?: string | null
          screenshot_url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "user_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "user_roles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      work_orders: {
        Row: {
          completed_at: string | null
          cost_estimate: number | null
          created_at: string
          days_down: number | null
          description: string | null
          entry_date: string
          estimated_completion: string | null
          final_cost: number | null
          id: string
          invoice_url: string | null
          is_reimbursable: boolean | null
          notes: string | null
          odometer_reading: number | null
          org_id: string | null
          service_type: string
          service_types: string[] | null
          status: string
          truck_id: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          completed_at?: string | null
          cost_estimate?: number | null
          created_at?: string
          days_down?: number | null
          description?: string | null
          entry_date?: string
          estimated_completion?: string | null
          final_cost?: number | null
          id?: string
          invoice_url?: string | null
          is_reimbursable?: boolean | null
          notes?: string | null
          odometer_reading?: number | null
          org_id?: string | null
          service_type: string
          service_types?: string[] | null
          status?: string
          truck_id: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          completed_at?: string | null
          cost_estimate?: number | null
          created_at?: string
          days_down?: number | null
          description?: string | null
          entry_date?: string
          estimated_completion?: string | null
          final_cost?: number | null
          id?: string
          invoice_url?: string | null
          is_reimbursable?: boolean | null
          notes?: string | null
          odometer_reading?: number | null
          org_id?: string | null
          service_type?: string
          service_types?: string[] | null
          status?: string
          truck_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "work_orders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_orders_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      driver_settings_safe: {
        Row: {
          created_at: string | null
          driver_id: string | null
          goal_type: string | null
          id: string | null
          landstar_username: string | null
          org_id: string | null
          pay_week_start_day: number | null
          target_miles: number | null
          theme_preference: string | null
          updated_at: string | null
          weekly_miles_goal: number | null
          weekly_revenue_goal: number | null
        }
        Insert: {
          created_at?: string | null
          driver_id?: string | null
          goal_type?: string | null
          id?: string | null
          landstar_username?: string | null
          org_id?: string | null
          pay_week_start_day?: number | null
          target_miles?: number | null
          theme_preference?: string | null
          updated_at?: string | null
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Update: {
          created_at?: string | null
          driver_id?: string | null
          goal_type?: string | null
          id?: string | null
          landstar_username?: string | null
          org_id?: string | null
          pay_week_start_day?: number | null
          target_miles?: number | null
          theme_preference?: string | null
          updated_at?: string | null
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_settings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "driver_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers_public_view: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          endorsements: string[] | null
          first_name: string | null
          has_twic: boolean | null
          hire_date: string | null
          id: string | null
          last_name: string | null
          org_id: string | null
          phone: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          endorsements?: string[] | null
          first_name?: string | null
          has_twic?: boolean | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          org_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          endorsements?: string[] | null
          first_name?: string | null
          has_twic?: boolean | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          org_id?: string | null
          phone?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_audit_logs: {
        Row: {
          action: string | null
          created_at: string | null
          details: Json | null
          id: string | null
          org_id: string | null
          org_name: string | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_infrastructure_stats"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "super_admin_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_dashboard_data: {
        Row: {
          signups_30d: number | null
          signups_7d: number | null
          tier_distribution: Json | null
          total_orgs: number | null
        }
        Relationships: []
      }
      super_admin_infrastructure_stats: {
        Row: {
          document_count: number | null
          driver_count: number | null
          is_active: boolean | null
          load_count: number | null
          org_id: string | null
          org_name: string | null
          storage_connected: boolean | null
          storage_connected_at: string | null
          storage_provider: string | null
          truck_count: number | null
        }
        Relationships: []
      }
      super_admin_organizations: {
        Row: {
          applied_promo_code_id: string | null
          banner_url: string | null
          complimentary_ends_at: string | null
          created_at: string | null
          dot_number: string | null
          factoring_enabled: boolean | null
          factoring_provider_name: string | null
          id: string | null
          is_active: boolean | null
          is_complimentary: boolean | null
          logo_url: string | null
          mc_number: string | null
          name: string | null
          primary_color: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_period_end: string | null
          subscription_status: string | null
          subscription_tier: string | null
          tms_mode: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_count: number | null
        }
        Insert: {
          applied_promo_code_id?: string | null
          banner_url?: string | null
          complimentary_ends_at?: string | null
          created_at?: string | null
          dot_number?: string | null
          factoring_enabled?: boolean | null
          factoring_provider_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_complimentary?: boolean | null
          logo_url?: string | null
          mc_number?: string | null
          name?: string | null
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tms_mode?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_count?: never
        }
        Update: {
          applied_promo_code_id?: string | null
          banner_url?: string | null
          complimentary_ends_at?: string | null
          created_at?: string | null
          dot_number?: string | null
          factoring_enabled?: boolean | null
          factoring_provider_name?: string | null
          id?: string | null
          is_active?: boolean | null
          is_complimentary?: boolean | null
          logo_url?: string | null
          mc_number?: string | null
          name?: string | null
          primary_color?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_period_end?: string | null
          subscription_status?: string | null
          subscription_tier?: string | null
          tms_mode?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_count?: never
        }
        Relationships: [
          {
            foreignKeyName: "organizations_applied_promo_code_id_fkey"
            columns: ["applied_promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admin_usage_metrics: {
        Row: {
          loads_per_day_30d: Json | null
          total_agency_loads: number | null
          total_drivers: number | null
          total_fleet_loads: number | null
          total_trailers: number | null
          total_trucks: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      auto_cleanup_empty_orgs: { Args: never; Returns: number }
      create_audit_log: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: string
          p_record_id?: string
          p_table_name: string
          p_user_id: string
        }
        Returns: string
      }
      create_onboarding_org:
        | { Args: { _name: string; _tier?: string }; Returns: string }
        | {
            Args: { _name: string; _tier?: string; _tms_mode?: string }
            Returns: string
          }
      get_driver_banking: {
        Args: { _driver_id: string }
        Returns: {
          account_number: string
          account_number_last4: string
          account_type: string
          bank_name: string
          routing_number: string
          updated_at: string
        }[]
      }
      get_driver_id_for_user: { Args: { _user_id: string }; Returns: string }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_admin_access: { Args: { _user_id: string }; Returns: boolean }
      has_operations_access: { Args: { _user_id: string }; Returns: boolean }
      has_payroll_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_safety_access: { Args: { _user_id: string }; Returns: boolean }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      parse_legacy_time: { Args: { _t: string }; Returns: string }
      state_to_iana: { Args: { _location: string }; Returns: string }
      storage_user_same_org: {
        Args: { folder_owner_id: string }
        Returns: boolean
      }
      super_admin_delete_org: {
        Args: { target_org_id: string }
        Returns: undefined
      }
      super_admin_end_beta: { Args: never; Returns: number }
      super_admin_get_owner_email: {
        Args: { target_org_id: string }
        Returns: string
      }
      super_admin_reset_demo: { Args: never; Returns: undefined }
      super_admin_resume_beta: { Args: never; Returns: number }
      super_admin_update_org: {
        Args: {
          new_complimentary_ends_at?: string
          new_is_active?: boolean
          new_is_complimentary?: boolean
          new_subscription_tier?: string
          new_tms_mode?: string
          new_trial_ends_at?: string
          target_org_id: string
        }
        Returns: undefined
      }
      upsert_driver_banking: {
        Args: {
          _account_number: string
          _account_type: string
          _bank_name: string
          _driver_id: string
          _routing_number: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "owner"
        | "payroll_admin"
        | "dispatcher"
        | "safety"
        | "driver"
        | "maintenance"
      onboarding_review_status: "pending" | "approved" | "revision_requested"
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
      app_role: [
        "owner",
        "payroll_admin",
        "dispatcher",
        "safety",
        "driver",
        "maintenance",
      ],
      onboarding_review_status: ["pending", "approved", "revision_requested"],
    },
  },
} as const
