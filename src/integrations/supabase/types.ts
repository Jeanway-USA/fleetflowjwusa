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
      agency_loads: {
        Row: {
          broker_name: string | null
          broker_rate: number | null
          carrier_name: string | null
          carrier_rate: number | null
          created_at: string
          delivery_date: string | null
          destination: string
          id: string
          load_reference: string | null
          margin: number | null
          notes: string | null
          origin: string
          pickup_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          broker_name?: string | null
          broker_rate?: number | null
          carrier_name?: string | null
          carrier_rate?: number | null
          created_at?: string
          delivery_date?: string | null
          destination: string
          id?: string
          load_reference?: string | null
          margin?: number | null
          notes?: string | null
          origin: string
          pickup_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          broker_name?: string | null
          broker_rate?: number | null
          carrier_name?: string | null
          carrier_rate?: number | null
          created_at?: string
          delivery_date?: string | null
          destination?: string
          id?: string
          load_reference?: string | null
          margin?: number | null
          notes?: string | null
          origin?: string
          pickup_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
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
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string
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
          phone?: string | null
          resource_type?: string
          service_area?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      company_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string
        }
        Relationships: []
      }
      detention_requests: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          load_id: string
          notes: string | null
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
        ]
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
          related_id?: string | null
          related_type?: string | null
          uploaded_by?: string | null
        }
        Relationships: []
      }
      driver_inspections: {
        Row: {
          created_at: string
          defect_notes: string | null
          defects_found: boolean
          driver_id: string
          id: string
          inspection_date: string
          inspection_type: string
          odometer_reading: number | null
          signature: string | null
          signature_url: string | null
          status: string
          truck_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          defect_notes?: string | null
          defects_found?: boolean
          driver_id: string
          id?: string
          inspection_date?: string
          inspection_type: string
          odometer_reading?: number | null
          signature?: string | null
          signature_url?: string | null
          status?: string
          truck_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          defect_notes?: string | null
          defects_found?: boolean
          driver_id?: string
          id?: string
          inspection_date?: string
          inspection_type?: string
          odometer_reading?: number | null
          signature?: string | null
          signature_url?: string | null
          status?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_inspections_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
            referencedColumns: ["id"]
          },
        ]
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
          id: string
          landstar_password: string | null
          landstar_username: string | null
          theme_preference: string | null
          updated_at: string
          weekly_miles_goal: number | null
          weekly_revenue_goal: number | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          landstar_password?: string | null
          landstar_username?: string | null
          theme_preference?: string | null
          updated_at?: string
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          landstar_password?: string | null
          landstar_username?: string | null
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
        ]
      }
      drivers: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          endorsements: string[] | null
          first_name: string
          has_twic: boolean | null
          hazmat_expiry: string | null
          hire_date: string | null
          id: string
          last_name: string
          license_expiry: string | null
          license_number: string | null
          medical_card_expiry: string | null
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
          email?: string | null
          endorsements?: string[] | null
          first_name: string
          has_twic?: boolean | null
          hazmat_expiry?: string | null
          hire_date?: string | null
          id?: string
          last_name: string
          license_expiry?: string | null
          license_number?: string | null
          medical_card_expiry?: string | null
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
          email?: string | null
          endorsements?: string[] | null
          first_name?: string
          has_twic?: boolean | null
          hazmat_expiry?: string | null
          hire_date?: string | null
          id?: string
          last_name?: string
          license_expiry?: string | null
          license_number?: string | null
          medical_card_expiry?: string | null
          pay_rate?: number | null
          pay_type?: string | null
          phone?: string | null
          status?: string
          twic_expiry?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          expense_date: string
          expense_type: string
          gallons: number | null
          id: string
          jurisdiction: string | null
          load_id: string | null
          notes: string | null
          truck_id: string | null
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_type: string
          gallons?: number | null
          id?: string
          jurisdiction?: string | null
          load_id?: string | null
          notes?: string | null
          truck_id?: string | null
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          expense_date?: string
          expense_type?: string
          gallons?: number | null
          id?: string
          jurisdiction?: string | null
          load_id?: string | null
          notes?: string | null
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
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      fleet_loads: {
        Row: {
          accessorials: number | null
          actual_miles: number | null
          advance_available: number | null
          advance_taken: number | null
          agency_code: string | null
          booked_miles: number | null
          created_at: string
          delivery_date: string | null
          delivery_time: string | null
          destination: string
          detention_pay: number | null
          driver_id: string | null
          empty_miles: number | null
          end_miles: number | null
          fuel_advance: number | null
          fuel_surcharge: number | null
          gross_revenue: number | null
          id: string
          is_power_only: boolean | null
          landstar_load_id: string | null
          lumper: number | null
          net_revenue: number | null
          notes: string | null
          origin: string
          pickup_date: string | null
          pickup_time: string | null
          rate: number | null
          settlement: number | null
          start_miles: number | null
          status: string
          trailer_id: string | null
          trailer_revenue: number | null
          truck_id: string | null
          truck_revenue: number | null
          updated_at: string
        }
        Insert: {
          accessorials?: number | null
          actual_miles?: number | null
          advance_available?: number | null
          advance_taken?: number | null
          agency_code?: string | null
          booked_miles?: number | null
          created_at?: string
          delivery_date?: string | null
          delivery_time?: string | null
          destination: string
          detention_pay?: number | null
          driver_id?: string | null
          empty_miles?: number | null
          end_miles?: number | null
          fuel_advance?: number | null
          fuel_surcharge?: number | null
          gross_revenue?: number | null
          id?: string
          is_power_only?: boolean | null
          landstar_load_id?: string | null
          lumper?: number | null
          net_revenue?: number | null
          notes?: string | null
          origin: string
          pickup_date?: string | null
          pickup_time?: string | null
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
          trailer_id?: string | null
          trailer_revenue?: number | null
          truck_id?: string | null
          truck_revenue?: number | null
          updated_at?: string
        }
        Update: {
          accessorials?: number | null
          actual_miles?: number | null
          advance_available?: number | null
          advance_taken?: number | null
          agency_code?: string | null
          booked_miles?: number | null
          created_at?: string
          delivery_date?: string | null
          delivery_time?: string | null
          destination?: string
          detention_pay?: number | null
          driver_id?: string | null
          empty_miles?: number | null
          end_miles?: number | null
          fuel_advance?: number | null
          fuel_surcharge?: number | null
          gross_revenue?: number | null
          id?: string
          is_power_only?: boolean | null
          landstar_load_id?: string | null
          lumper?: number | null
          net_revenue?: number | null
          notes?: string | null
          origin?: string
          pickup_date?: string | null
          pickup_time?: string | null
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
          trailer_id?: string | null
          trailer_revenue?: number | null
          truck_id?: string | null
          truck_revenue?: number | null
          updated_at?: string
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
      fuel_stops_cache: {
        Row: {
          amenities: string[] | null
          chain: string | null
          city: string | null
          created_at: string
          diesel_price: number | null
          fetched_at: string
          id: string
          latitude: number
          lcapp_discount: number | null
          longitude: number
          name: string
          net_price: number | null
          source: string
          state: string
        }
        Insert: {
          amenities?: string[] | null
          chain?: string | null
          city?: string | null
          created_at?: string
          diesel_price?: number | null
          fetched_at?: string
          id?: string
          latitude: number
          lcapp_discount?: number | null
          longitude: number
          name: string
          net_price?: number | null
          source?: string
          state: string
        }
        Update: {
          amenities?: string[] | null
          chain?: string | null
          city?: string | null
          created_at?: string
          diesel_price?: number | null
          fetched_at?: string
          id?: string
          latitude?: number
          lcapp_discount?: number | null
          longitude?: number
          name?: string
          net_price?: number | null
          source?: string
          state?: string
        }
        Relationships: []
      }
      general_ledger: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          id: string
          notes: string | null
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
          reference_id?: string | null
          reference_type?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      hos_logs: {
        Row: {
          break_taken: boolean | null
          created_at: string
          cycle_hours_used: number
          driver_id: string
          driving_hours_used: number
          duty_status: string
          id: string
          last_status_change: string | null
          log_date: string
          notes: string | null
          on_duty_hours_used: number
          updated_at: string
          violations: string[] | null
        }
        Insert: {
          break_taken?: boolean | null
          created_at?: string
          cycle_hours_used?: number
          driver_id: string
          driving_hours_used?: number
          duty_status?: string
          id?: string
          last_status_change?: string | null
          log_date?: string
          notes?: string | null
          on_duty_hours_used?: number
          updated_at?: string
          violations?: string[] | null
        }
        Update: {
          break_taken?: boolean | null
          created_at?: string
          cycle_hours_used?: number
          driver_id?: string
          driving_hours_used?: number
          duty_status?: string
          id?: string
          last_status_change?: string | null
          log_date?: string
          notes?: string | null
          on_duty_hours_used?: number
          updated_at?: string
          violations?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "hos_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hos_logs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers_public_view"
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
          photo_url: string
          uploaded_at: string
        }
        Insert: {
          description?: string | null
          id?: string
          incident_id: string
          photo_url: string
          uploaded_at?: string
        }
        Update: {
          description?: string | null
          id?: string
          incident_id?: string
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
        ]
      }
      incident_witnesses: {
        Row: {
          created_at: string
          email: string | null
          id: string
          incident_id: string
          name: string
          phone: string | null
          statement: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          incident_id: string
          name: string
          phone?: string | null
          statement?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          incident_id?: string
          name?: string
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
      inspection_photos: {
        Row: {
          created_at: string
          description: string | null
          id: string
          inspection_id: string
          photo_url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          inspection_id: string
          photo_url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          inspection_id?: string
          photo_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspection_photos_inspection_id_fkey"
            columns: ["inspection_id"]
            isOneToOne: false
            referencedRelation: "driver_inspections"
            referencedColumns: ["id"]
          },
        ]
      }
      load_accessorials: {
        Row: {
          accessorial_type: string
          amount: number
          created_at: string
          id: string
          load_id: string
          notes: string | null
          percentage: number | null
          updated_at: string
        }
        Insert: {
          accessorial_type: string
          amount?: number
          created_at?: string
          id?: string
          load_id: string
          notes?: string | null
          percentage?: number | null
          updated_at?: string
        }
        Update: {
          accessorial_type?: string
          amount?: number
          created_at?: string
          id?: string
          load_id?: string
          notes?: string | null
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
          previous_status: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          load_id: string
          new_status: string
          notes?: string | null
          previous_status?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          id?: string
          load_id?: string
          new_status?: string
          notes?: string | null
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
        ]
      }
      maintenance_logs: {
        Row: {
          cost: number | null
          created_at: string
          description: string | null
          id: string
          next_service_date: string | null
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
          service_date?: string
          service_type?: string
          truck_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_truck_id_fkey"
            columns: ["truck_id"]
            isOneToOne: false
            referencedRelation: "trucks"
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
      pm_notifications: {
        Row: {
          created_at: string
          days_or_miles_remaining: number | null
          dismissed_at: string | null
          id: string
          is_read: boolean
          notification_type: string
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
          service_code?: string | null
          service_name?: string
          truck_id?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
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
          id: string
          last_name: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      service_schedules: {
        Row: {
          created_at: string
          id: string
          interval_days: number | null
          interval_miles: number | null
          last_performed_date: string | null
          last_performed_miles: number | null
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
          profile_service_id?: string | null
          service_name?: string
          truck_id?: string
          updated_at?: string
        }
        Relationships: [
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
          settlement_id: string
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          description: string
          id?: string
          load_id?: string | null
          settlement_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          id?: string
          load_id?: string | null
          settlement_id?: string
        }
        Relationships: [
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
          created_at: string
          driver_id: string
          driver_pay: number
          escrow_deduction: number | null
          fuel_advances: number | null
          gross_revenue: number
          id: string
          net_pay: number | null
          notes: string | null
          other_deductions: number | null
          pdf_url: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string
        }
        Insert: {
          cash_advances?: number | null
          created_at?: string
          driver_id: string
          driver_pay?: number
          escrow_deduction?: number | null
          fuel_advances?: number | null
          gross_revenue?: number
          id?: string
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          pdf_url?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string
        }
        Update: {
          cash_advances?: number | null
          created_at?: string
          driver_id?: string
          driver_pay?: number
          escrow_deduction?: number | null
          fuel_advances?: number | null
          gross_revenue?: number
          id?: string
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number | null
          pdf_url?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trailer_assignments: {
        Row: {
          assigned_at: string
          created_at: string
          driver_id: string | null
          id: string
          released_at: string | null
          trailer_id: string
          truck_id: string | null
        }
        Insert: {
          assigned_at?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          released_at?: string | null
          trailer_id: string
          truck_id?: string | null
        }
        Update: {
          assigned_at?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          released_at?: string | null
          trailer_id?: string
          truck_id?: string | null
        }
        Relationships: [
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
          owned_or_leased?: string | null
          status?: string
          trailer_type?: string
          unit_number?: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Relationships: []
      }
      trucks: {
        Row: {
          created_at: string
          current_driver_id: string | null
          current_odometer: number | null
          id: string
          last_120_inspection_date: string | null
          last_120_inspection_miles: number | null
          license_plate: string | null
          license_plate_state: string | null
          make: string | null
          model: string | null
          next_inspection_date: string | null
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
          last_120_inspection_date?: string | null
          last_120_inspection_miles?: number | null
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          next_inspection_date?: string | null
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
          last_120_inspection_date?: string | null
          last_120_inspection_miles?: number | null
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          next_inspection_date?: string | null
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
      work_orders: {
        Row: {
          completed_at: string | null
          cost_estimate: number | null
          created_at: string
          description: string | null
          entry_date: string
          estimated_completion: string | null
          final_cost: number | null
          id: string
          invoice_url: string | null
          is_reimbursable: boolean | null
          notes: string | null
          odometer_reading: number | null
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
          description?: string | null
          entry_date?: string
          estimated_completion?: string | null
          final_cost?: number | null
          id?: string
          invoice_url?: string | null
          is_reimbursable?: boolean | null
          notes?: string | null
          odometer_reading?: number | null
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
          description?: string | null
          entry_date?: string
          estimated_completion?: string | null
          final_cost?: number | null
          id?: string
          invoice_url?: string | null
          is_reimbursable?: boolean | null
          notes?: string | null
          odometer_reading?: number | null
          service_type?: string
          service_types?: string[] | null
          status?: string
          truck_id?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
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
      drivers_public_view: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          endorsements: string[] | null
          first_name: string | null
          has_twic: boolean | null
          hire_date: string | null
          id: string | null
          last_name: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          endorsements?: string[] | null
          first_name?: string | null
          has_twic?: boolean | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          endorsements?: string[] | null
          first_name?: string | null
          has_twic?: boolean | null
          hire_date?: string | null
          id?: string | null
          last_name?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
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
      get_driver_id_for_user: { Args: { _user_id: string }; Returns: string }
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
    }
    Enums: {
      app_role: "owner" | "payroll_admin" | "dispatcher" | "safety" | "driver"
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
      app_role: ["owner", "payroll_admin", "dispatcher", "safety", "driver"],
    },
  },
} as const
