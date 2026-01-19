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
        ]
      }
      driver_settings: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          theme_preference: string | null
          updated_at: string
          weekly_miles_goal: number | null
          weekly_revenue_goal: number | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          theme_preference?: string | null
          updated_at?: string
          weekly_miles_goal?: number | null
          weekly_revenue_goal?: number | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
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
          destination: string
          detention_pay: number | null
          driver_id: string | null
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
          rate: number | null
          settlement: number | null
          start_miles: number | null
          status: string
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
          destination: string
          detention_pay?: number | null
          driver_id?: string | null
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
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
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
          destination?: string
          detention_pay?: number | null
          driver_id?: string | null
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
          rate?: number | null
          settlement?: number | null
          start_miles?: number | null
          status?: string
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
            foreignKeyName: "fleet_loads_truck_id_fkey"
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
            foreignKeyName: "maintenance_requests_truck_id_fkey"
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
      trucks: {
        Row: {
          created_at: string
          current_driver_id: string | null
          id: string
          license_plate: string | null
          license_plate_state: string | null
          make: string | null
          model: string | null
          next_inspection_date: string | null
          status: string
          unit_number: string
          updated_at: string
          vin: string | null
          year: number | null
        }
        Insert: {
          created_at?: string
          current_driver_id?: string | null
          id?: string
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          next_inspection_date?: string | null
          status?: string
          unit_number: string
          updated_at?: string
          vin?: string | null
          year?: number | null
        }
        Update: {
          created_at?: string
          current_driver_id?: string | null
          id?: string
          license_plate?: string | null
          license_plate_state?: string | null
          make?: string | null
          model?: string | null
          next_inspection_date?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_driver_id_for_user: { Args: { _user_id: string }; Returns: string }
      has_admin_access: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
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
