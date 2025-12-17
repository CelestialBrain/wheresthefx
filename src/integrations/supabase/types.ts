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
      account_venue_stats: {
        Row: {
          id: string
          instagram_account_id: string | null
          last_used_at: string | null
          post_count: number | null
          venue_name: string
        }
        Insert: {
          id?: string
          instagram_account_id?: string | null
          last_used_at?: string | null
          post_count?: number | null
          venue_name: string
        }
        Update: {
          id?: string
          instagram_account_id?: string | null
          last_used_at?: string | null
          post_count?: number | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_venue_stats_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_venue_stats_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "popular_instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: Database["public"]["Enums"]["attendee_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: Database["public"]["Enums"]["attendee_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: Database["public"]["Enums"]["attendee_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_edit_history: {
        Row: {
          action_type: string
          created_at: string
          edited_by: string | null
          event_id: string
          field_name: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action_type: string
          created_at?: string
          edited_by?: string | null
          event_id: string
          field_name: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action_type?: string
          created_at?: string
          edited_by?: string | null
          event_id?: string
          field_name?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      event_groups: {
        Row: {
          created_at: string | null
          id: string
          merged_post_ids: string[] | null
          primary_post_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          merged_post_ids?: string[] | null
          primary_post_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          merged_post_ids?: string[] | null
          primary_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_groups_primary_post_id_fkey"
            columns: ["primary_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      event_images: {
        Row: {
          created_at: string
          event_id: string
          id: string
          image_url: string
          order_index: number
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          image_url: string
          order_index?: number
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          image_url?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_images_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          instagram_post_id: string | null
          report_type: string | null
          reporter_user_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_post_id?: string | null
          report_type?: string | null
          reporter_user_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          instagram_post_id?: string | null
          report_type?: string | null
          reporter_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_reports_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reports_reporter_user_id_fkey"
            columns: ["reporter_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          description: string
          end_time: string | null
          event_date: string
          event_time: string
          host_id: string
          id: string
          is_featured: boolean
          is_free: boolean
          location_address: string
          location_lat: number
          location_lng: number
          location_name: string
          price: number | null
          status: Database["public"]["Enums"]["event_status"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["event_visibility"]
        }
        Insert: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description: string
          end_time?: string | null
          event_date: string
          event_time: string
          host_id: string
          id?: string
          is_featured?: boolean
          is_free?: boolean
          location_address: string
          location_lat: number
          location_lng: number
          location_name: string
          price?: number | null
          status?: Database["public"]["Enums"]["event_status"]
          title: string
          type: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Update: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string
          end_time?: string | null
          event_date?: string
          event_time?: string
          host_id?: string
          id?: string
          is_featured?: boolean
          is_free?: boolean
          location_address?: string
          location_lat?: number
          location_lng?: number
          location_name?: string
          price?: number | null
          status?: Database["public"]["Enums"]["event_status"]
          title?: string
          type?: Database["public"]["Enums"]["event_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["event_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_corrections: {
        Row: {
          corrected_value: string
          created_at: string | null
          extraction_method: string | null
          field_name: string
          id: string
          learned_pattern_id: string | null
          original_extracted_value: string | null
          original_ocr_text: string | null
          pattern_used: string | null
          post_id: string | null
        }
        Insert: {
          corrected_value: string
          created_at?: string | null
          extraction_method?: string | null
          field_name: string
          id?: string
          learned_pattern_id?: string | null
          original_extracted_value?: string | null
          original_ocr_text?: string | null
          pattern_used?: string | null
          post_id?: string | null
        }
        Update: {
          corrected_value?: string
          created_at?: string | null
          extraction_method?: string | null
          field_name?: string
          id?: string
          learned_pattern_id?: string | null
          original_extracted_value?: string | null
          original_ocr_text?: string | null
          pattern_used?: string | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_corrections_learned_pattern_id_fkey"
            columns: ["learned_pattern_id"]
            isOneToOne: false
            referencedRelation: "extraction_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_corrections_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_feedback: {
        Row: {
          confidence_score: number | null
          corrected_value: string
          created_at: string | null
          created_by: string | null
          feedback_type: string
          field_name: string
          id: string
          original_value: string | null
          pattern_id: string | null
          post_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          corrected_value: string
          created_at?: string | null
          created_by?: string | null
          feedback_type: string
          field_name: string
          id?: string
          original_value?: string | null
          pattern_id?: string | null
          post_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          corrected_value?: string
          created_at?: string | null
          created_by?: string | null
          feedback_type?: string
          field_name?: string
          id?: string
          original_value?: string | null
          pattern_id?: string | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "extraction_feedback_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "extraction_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extraction_feedback_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      extraction_patterns: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          failure_count: number | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          pattern_description: string | null
          pattern_regex: string
          pattern_type: string
          priority: number | null
          source: string | null
          success_count: number | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          pattern_description?: string | null
          pattern_regex: string
          pattern_type: string
          priority?: number | null
          source?: string | null
          success_count?: number | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          failure_count?: number | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          pattern_description?: string | null
          pattern_regex?: string
          pattern_type?: string
          priority?: number | null
          source?: string | null
          success_count?: number | null
        }
        Relationships: []
      }
      instagram_accounts: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          follower_count: number | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          last_scraped_at: string | null
          profile_pic_url: string | null
          scrape_depth: number | null
          updated_at: string
          username: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_scraped_at?: string | null
          profile_pic_url?: string | null
          scrape_depth?: number | null
          updated_at?: string
          username: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          follower_count?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_scraped_at?: string | null
          profile_pic_url?: string | null
          scrape_depth?: number | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      instagram_posts: {
        Row: {
          ai_confidence: number | null
          ai_extraction: Json | null
          ai_reasoning: string | null
          caption: string | null
          comments_count: number | null
          created_at: string
          end_time: string | null
          entity_extraction_method: string | null
          event_date: string | null
          event_end_date: string | null
          event_time: string | null
          event_title: string | null
          extraction_method: string | null
          hashtags: string[] | null
          id: string
          image_storage_path: string | null
          image_url: string | null
          instagram_account_id: string
          is_event: boolean | null
          is_free: boolean
          likes_count: number | null
          location_address: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          mentions: string[] | null
          needs_review: boolean | null
          ocr_confidence: number | null
          ocr_error_count: number | null
          ocr_last_attempt: string | null
          ocr_last_attempt_at: string | null
          ocr_last_error: string | null
          ocr_processed: boolean | null
          ocr_text: string | null
          post_id: string
          post_url: string
          posted_at: string
          price: number | null
          signup_url: string | null
          stored_image_url: string | null
          tags: string[] | null
          topic_confidence: number | null
          topic_label: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence?: number | null
          ai_extraction?: Json | null
          ai_reasoning?: string | null
          caption?: string | null
          comments_count?: number | null
          created_at?: string
          end_time?: string | null
          entity_extraction_method?: string | null
          event_date?: string | null
          event_end_date?: string | null
          event_time?: string | null
          event_title?: string | null
          extraction_method?: string | null
          hashtags?: string[] | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          instagram_account_id: string
          is_event?: boolean | null
          is_free?: boolean
          likes_count?: number | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          mentions?: string[] | null
          needs_review?: boolean | null
          ocr_confidence?: number | null
          ocr_error_count?: number | null
          ocr_last_attempt?: string | null
          ocr_last_attempt_at?: string | null
          ocr_last_error?: string | null
          ocr_processed?: boolean | null
          ocr_text?: string | null
          post_id: string
          post_url: string
          posted_at: string
          price?: number | null
          signup_url?: string | null
          stored_image_url?: string | null
          tags?: string[] | null
          topic_confidence?: number | null
          topic_label?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence?: number | null
          ai_extraction?: Json | null
          ai_reasoning?: string | null
          caption?: string | null
          comments_count?: number | null
          created_at?: string
          end_time?: string | null
          entity_extraction_method?: string | null
          event_date?: string | null
          event_end_date?: string | null
          event_time?: string | null
          event_title?: string | null
          extraction_method?: string | null
          hashtags?: string[] | null
          id?: string
          image_storage_path?: string | null
          image_url?: string | null
          instagram_account_id?: string
          is_event?: boolean | null
          is_free?: boolean
          likes_count?: number | null
          location_address?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          mentions?: string[] | null
          needs_review?: boolean | null
          ocr_confidence?: number | null
          ocr_error_count?: number | null
          ocr_last_attempt?: string | null
          ocr_last_attempt_at?: string | null
          ocr_last_error?: string | null
          ocr_processed?: boolean | null
          ocr_text?: string | null
          post_id?: string
          post_url?: string
          posted_at?: string
          price?: number | null
          signup_url?: string | null
          stored_image_url?: string | null
          tags?: string[] | null
          topic_confidence?: number | null
          topic_label?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "instagram_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instagram_posts_instagram_account_id_fkey"
            columns: ["instagram_account_id"]
            isOneToOne: false
            referencedRelation: "popular_instagram_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      interest_tags: {
        Row: {
          category: string | null
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      known_venues: {
        Row: {
          address: string | null
          aliases: string[] | null
          city: string | null
          correction_count: number | null
          created_at: string | null
          id: string
          instagram_handle: string | null
          lat: number | null
          learned_from_corrections: boolean | null
          lng: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          aliases?: string[] | null
          city?: string | null
          correction_count?: number | null
          created_at?: string | null
          id?: string
          instagram_handle?: string | null
          lat?: number | null
          learned_from_corrections?: boolean | null
          lng?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          aliases?: string[] | null
          city?: string | null
          correction_count?: number | null
          created_at?: string | null
          id?: string
          instagram_handle?: string | null
          lat?: number | null
          learned_from_corrections?: boolean | null
          lng?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      location_corrections: {
        Row: {
          applied_to_event_id: string | null
          confidence_score: number | null
          corrected_by: string | null
          corrected_street_address: string | null
          corrected_venue_name: string
          correction_count: number | null
          created_at: string | null
          id: string
          manual_lat: number | null
          manual_lng: number | null
          match_pattern: string | null
          original_location_address: string | null
          original_location_name: string | null
          original_ocr_text: string | null
          updated_at: string | null
        }
        Insert: {
          applied_to_event_id?: string | null
          confidence_score?: number | null
          corrected_by?: string | null
          corrected_street_address?: string | null
          corrected_venue_name: string
          correction_count?: number | null
          created_at?: string | null
          id?: string
          manual_lat?: number | null
          manual_lng?: number | null
          match_pattern?: string | null
          original_location_address?: string | null
          original_location_name?: string | null
          original_ocr_text?: string | null
          updated_at?: string | null
        }
        Update: {
          applied_to_event_id?: string | null
          confidence_score?: number | null
          corrected_by?: string | null
          corrected_street_address?: string | null
          corrected_venue_name?: string
          correction_count?: number | null
          created_at?: string | null
          id?: string
          manual_lat?: number | null
          manual_lng?: number | null
          match_pattern?: string | null
          original_location_address?: string | null
          original_location_name?: string | null
          original_ocr_text?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      location_templates: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lat: number
          lng: number
          notes: string | null
          street_address: string | null
          template_name: string
          updated_at: string
          usage_count: number
          venue_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lat: number
          lng: number
          notes?: string | null
          street_address?: string | null
          template_name: string
          updated_at?: string
          usage_count?: number
          venue_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lat?: number
          lng?: number
          notes?: string | null
          street_address?: string | null
          template_name?: string
          updated_at?: string
          usage_count?: number
          venue_name?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          correction_id: string | null
          created_at: string
          floor_note: string | null
          formatted_address: string | null
          id: string
          location_lat: number | null
          location_lng: number | null
          location_name: string
          manual_override: boolean | null
          needs_review: boolean
          place_id: string | null
          total_events: number
          updated_at: string
          verified: boolean
        }
        Insert: {
          correction_id?: string | null
          created_at?: string
          floor_note?: string | null
          formatted_address?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          location_name: string
          manual_override?: boolean | null
          needs_review?: boolean
          place_id?: string | null
          total_events?: number
          updated_at?: string
          verified?: boolean
        }
        Update: {
          correction_id?: string | null
          created_at?: string
          floor_note?: string | null
          formatted_address?: string | null
          id?: string
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string
          manual_override?: boolean | null
          needs_review?: boolean
          place_id?: string | null
          total_events?: number
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "locations_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "location_corrections"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_cache: {
        Row: {
          created_at: string | null
          id: string
          image_hash: string
          image_url: string
          last_used_at: string | null
          ocr_confidence: number | null
          ocr_text: string | null
          use_count: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_hash: string
          image_url: string
          last_used_at?: string | null
          ocr_confidence?: number | null
          ocr_text?: string | null
          use_count?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_hash?: string
          image_url?: string
          last_used_at?: string | null
          ocr_confidence?: number | null
          ocr_text?: string | null
          use_count?: number | null
        }
        Relationships: []
      }
      post_rejections: {
        Row: {
          created_at: string | null
          field_issues: Json | null
          id: string
          notes: string | null
          post_id: string | null
          rejected_by: string | null
          rejection_reason: string
        }
        Insert: {
          created_at?: string | null
          field_issues?: Json | null
          id?: string
          notes?: string | null
          post_id?: string | null
          rejected_by?: string | null
          rejection_reason: string
        }
        Update: {
          created_at?: string | null
          field_issues?: Json | null
          id?: string
          notes?: string | null
          post_id?: string | null
          rejected_by?: string | null
          rejection_reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_rejections_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string | null
          has_completed_onboarding: boolean | null
          id: string
          is_host: boolean
          location_lat: number | null
          location_lng: number | null
          preferences: Json | null
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          has_completed_onboarding?: boolean | null
          id: string
          is_host?: boolean
          location_lat?: number | null
          location_lng?: number | null
          preferences?: Json | null
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string | null
          has_completed_onboarding?: boolean | null
          id?: string
          is_host?: boolean
          location_lat?: number | null
          location_lng?: number | null
          preferences?: Json | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      published_events: {
        Row: {
          caption: string | null
          comments_count: number | null
          created_at: string
          description: string | null
          end_date: string | null
          end_time: string | null
          event_date: string
          event_end_date: string | null
          event_time: string | null
          event_title: string
          id: string
          image_url: string | null
          instagram_account_username: string | null
          instagram_post_url: string | null
          is_featured: boolean | null
          is_free: boolean
          likes_count: number | null
          location_address: string | null
          location_lat: number
          location_lng: number
          location_name: string
          price: number | null
          signup_url: string | null
          source_event_id: string | null
          source_post_id: string | null
          stored_image_url: string | null
          topic_label: string | null
          updated_at: string
          verified: boolean | null
        }
        Insert: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date: string
          event_end_date?: string | null
          event_time?: string | null
          event_title: string
          id?: string
          image_url?: string | null
          instagram_account_username?: string | null
          instagram_post_url?: string | null
          is_featured?: boolean | null
          is_free?: boolean
          likes_count?: number | null
          location_address?: string | null
          location_lat: number
          location_lng: number
          location_name: string
          price?: number | null
          signup_url?: string | null
          source_event_id?: string | null
          source_post_id?: string | null
          stored_image_url?: string | null
          topic_label?: string | null
          updated_at?: string
          verified?: boolean | null
        }
        Update: {
          caption?: string | null
          comments_count?: number | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          end_time?: string | null
          event_date?: string
          event_end_date?: string | null
          event_time?: string | null
          event_title?: string
          id?: string
          image_url?: string | null
          instagram_account_username?: string | null
          instagram_post_url?: string | null
          is_featured?: boolean | null
          is_free?: boolean
          likes_count?: number | null
          location_address?: string | null
          location_lat?: number
          location_lng?: number
          location_name?: string
          price?: number | null
          signup_url?: string | null
          source_event_id?: string | null
          source_post_id?: string | null
          stored_image_url?: string | null
          topic_label?: string | null
          updated_at?: string
          verified?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "published_events_source_post_id_fkey"
            columns: ["source_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          reason: string
          reporter_id: string
          status: Database["public"]["Enums"]["report_status"]
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          reason: string
          reporter_id: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          reason?: string
          reporter_id?: string
          status?: Database["public"]["Enums"]["report_status"]
        }
        Relationships: [
          {
            foreignKeyName: "reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_events: {
        Row: {
          created_at: string | null
          id: string
          instagram_post_id: string | null
          published_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          instagram_post_id?: string | null
          published_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          instagram_post_id?: string | null
          published_event_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_events_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_published_event_id_fkey"
            columns: ["published_event_id"]
            isOneToOne: false
            referencedRelation: "published_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scrape_runs: {
        Row: {
          accounts_found: number
          completed_at: string | null
          dataset_id: string | null
          error_message: string | null
          id: string
          posts_added: number
          posts_updated: number
          run_type: Database["public"]["Enums"]["scrape_run_type"]
          started_at: string
          status: Database["public"]["Enums"]["scrape_run_status"]
        }
        Insert: {
          accounts_found?: number
          completed_at?: string | null
          dataset_id?: string | null
          error_message?: string | null
          id?: string
          posts_added?: number
          posts_updated?: number
          run_type: Database["public"]["Enums"]["scrape_run_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["scrape_run_status"]
        }
        Update: {
          accounts_found?: number
          completed_at?: string | null
          dataset_id?: string | null
          error_message?: string | null
          id?: string
          posts_added?: number
          posts_updated?: number
          run_type?: Database["public"]["Enums"]["scrape_run_type"]
          started_at?: string
          status?: Database["public"]["Enums"]["scrape_run_status"]
        }
        Relationships: []
      }
      scraper_logs: {
        Row: {
          created_at: string | null
          data: Json | null
          duration_ms: number | null
          error_details: Json | null
          id: string
          instagram_post_id: string | null
          log_level: string
          message: string
          post_id: string | null
          run_id: string | null
          stage: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          instagram_post_id?: string | null
          log_level: string
          message: string
          post_id?: string | null
          run_id?: string | null
          stage: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          duration_ms?: number | null
          error_details?: Json | null
          id?: string
          instagram_post_id?: string | null
          log_level?: string
          message?: string
          post_id?: string | null
          run_id?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "scraper_logs_instagram_post_id_fkey"
            columns: ["instagram_post_id"]
            isOneToOne: false
            referencedRelation: "instagram_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scraper_logs_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "scrape_runs"
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
      popular_instagram_accounts: {
        Row: {
          bio: string | null
          created_at: string | null
          display_name: string | null
          engagement_score: number | null
          follower_count: number | null
          id: string | null
          is_active: boolean | null
          is_verified: boolean | null
          last_scraped_at: string | null
          post_count: number | null
          profile_pic_url: string | null
          total_comments: number | null
          total_likes: number | null
          updated_at: string | null
          username: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      find_similar_addresses: {
        Args: { search_address: string; similarity_threshold?: number }
        Returns: {
          confidence_score: number
          corrected_street_address: string
          corrected_venue_name: string
          correction_count: number
          id: string
          manual_lat: number
          manual_lng: number
          similarity_score: number
        }[]
      }
      find_similar_venues: {
        Args: { search_venue: string; similarity_threshold?: number }
        Returns: {
          confidence_score: number
          corrected_street_address: string
          corrected_venue_name: string
          correction_count: number
          id: string
          manual_lat: number
          manual_lng: number
          similarity_score: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin" | "moderator" | "host" | "user"
      attendee_status: "interested" | "going" | "maybe" | "cancelled"
      event_status: "draft" | "published" | "cancelled" | "completed"
      event_type: "party" | "thrift" | "market" | "concert" | "other"
      event_visibility: "public" | "private" | "unlisted"
      report_status: "pending" | "reviewed" | "resolved"
      scrape_run_status: "running" | "completed" | "failed"
      scrape_run_type: "manual_dataset" | "manual_scrape" | "automated"
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
      app_role: ["admin", "moderator", "host", "user"],
      attendee_status: ["interested", "going", "maybe", "cancelled"],
      event_status: ["draft", "published", "cancelled", "completed"],
      event_type: ["party", "thrift", "market", "concert", "other"],
      event_visibility: ["public", "private", "unlisted"],
      report_status: ["pending", "reviewed", "resolved"],
      scrape_run_status: ["running", "completed", "failed"],
      scrape_run_type: ["manual_dataset", "manual_scrape", "automated"],
    },
  },
} as const
