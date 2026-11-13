export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18";
  };
  public: {
    Tables: {
      active_metals: {
        Row: {
          metal_id: string;
        };
        Insert: {
          metal_id: string;
        };
        Update: {
          metal_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "active_metals_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: true;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
        ];
      };
      ai_daily_budget: {
        Row: {
          day: string;
          reserved_tokens: number;
        };
        Insert: {
          day: string;
          reserved_tokens: number;
        };
        Update: {
          day?: string;
          reserved_tokens?: number;
        };
        Relationships: [];
      };
      ai_request_limits: {
        Row: {
          requests: number;
          user_id: string;
          window_start: string;
        };
        Insert: {
          requests: number;
          user_id: string;
          window_start: string;
        };
        Update: {
          requests?: number;
          user_id?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      analytical_calculations: {
        Row: {
          comparison_key: string;
          computed_at: string;
          id: string;
          input_quote_ids: string[];
          metal_id: string | null;
          methodology_version: string;
          result: Json;
        };
        Insert: {
          comparison_key: string;
          computed_at?: string;
          id?: string;
          input_quote_ids: string[];
          metal_id?: string | null;
          methodology_version: string;
          result: Json;
        };
        Update: {
          comparison_key?: string;
          computed_at?: string;
          id?: string;
          input_quote_ids?: string[];
          metal_id?: string | null;
          methodology_version?: string;
          result?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "analytical_calculations_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
        ];
      };
      analytical_summaries: {
        Row: {
          cache_key: string;
          content: string;
          created_at: string;
          expires_at: string;
          id: string;
          kind: string;
          owner_id: string | null;
          source_ids: string[];
        };
        Insert: {
          cache_key: string;
          content: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          kind: string;
          owner_id?: string | null;
          source_ids?: string[];
        };
        Update: {
          cache_key?: string;
          content?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          kind?: string;
          owner_id?: string | null;
          source_ids?: string[];
        };
        Relationships: [];
      };
      automation_runs: {
        Row: {
          error_code: string | null;
          finished_at: string | null;
          id: string;
          job: string;
          rows_written: number;
          started_at: string;
          status: string;
        };
        Insert: {
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          job: string;
          rows_written?: number;
          started_at?: string;
          status: string;
        };
        Update: {
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          job?: string;
          rows_written?: number;
          started_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      data_quality_records: {
        Row: {
          check_name: string;
          checked_at: string;
          details: string;
          id: string;
          metal_id: string | null;
          result: string;
          source_id: string | null;
        };
        Insert: {
          check_name: string;
          checked_at?: string;
          details?: string;
          id?: string;
          metal_id?: string | null;
          result: string;
          source_id?: string | null;
        };
        Update: {
          check_name?: string;
          checked_at?: string;
          details?: string;
          id?: string;
          metal_id?: string | null;
          result?: string;
          source_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "data_quality_records_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "data_quality_records_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      data_sources: {
        Row: {
          api_endpoint: string;
          api_key_configured: boolean;
          api_key_required: boolean;
          attribution: string;
          free_tier_limit: string;
          id: string;
          independence_id: string | null;
          last_error: string | null;
          last_success_at: string | null;
          license: string;
          market_type: string;
          name: string;
          quality_score: number;
          region: string;
          status: string;
          updated_at: string;
          url: string;
        };
        Insert: {
          api_endpoint?: string;
          api_key_configured?: boolean;
          api_key_required?: boolean;
          attribution?: string;
          free_tier_limit?: string;
          id: string;
          independence_id?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          license?: string;
          market_type: string;
          name: string;
          quality_score: number;
          region: string;
          status?: string;
          updated_at?: string;
          url?: string;
        };
        Update: {
          api_endpoint?: string;
          api_key_configured?: boolean;
          api_key_required?: boolean;
          attribution?: string;
          free_tier_limit?: string;
          id?: string;
          independence_id?: string | null;
          last_error?: string | null;
          last_success_at?: string | null;
          license?: string;
          market_type?: string;
          name?: string;
          quality_score?: number;
          region?: string;
          status?: string;
          updated_at?: string;
          url?: string;
        };
        Relationships: [];
      };
      exchange_rates: {
        Row: {
          base_currency: string;
          data_status: string;
          id: string;
          origin: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
        };
        Insert: {
          base_currency: string;
          data_status: string;
          id?: string;
          origin: string;
          quote_currency: string;
          rate: number;
          rate_date: string;
        };
        Update: {
          base_currency?: string;
          data_status?: string;
          id?: string;
          origin?: string;
          quote_currency?: string;
          rate?: number;
          rate_date?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          created_at: string;
          id: string;
          metal_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          metal_id: string;
          user_id?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          metal_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "favorites_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
        ];
      };
      fx_observations: {
        Row: {
          base_currency: string;
          data_status: string;
          id: string;
          origin: string;
          payload_id: string | null;
          provider_details: Json;
          quote_currency: string;
          rate: number;
          rate_date: string;
          retrieved_at: string;
          source_id: string;
          source_url: string;
        };
        Insert: {
          base_currency: string;
          data_status: string;
          id?: string;
          origin: string;
          payload_id?: string | null;
          provider_details?: Json;
          quote_currency: string;
          rate: number;
          rate_date: string;
          retrieved_at?: string;
          source_id: string;
          source_url: string;
        };
        Update: {
          base_currency?: string;
          data_status?: string;
          id?: string;
          origin?: string;
          payload_id?: string | null;
          provider_details?: Json;
          quote_currency?: string;
          rate?: number;
          rate_date?: string;
          retrieved_at?: string;
          source_id?: string;
          source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "fx_observations_payload_id_fkey";
            columns: ["payload_id"];
            isOneToOne: false;
            referencedRelation: "ingestion_payloads";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "fx_observations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      index_observations: {
        Row: {
          constituents: Json;
          index_id: string;
          observed_at: string;
          value: number;
        };
        Insert: {
          constituents: Json;
          index_id: string;
          observed_at: string;
          value: number;
        };
        Update: {
          constituents?: Json;
          index_id?: string;
          observed_at?: string;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "index_observations_index_id_fkey";
            columns: ["index_id"];
            isOneToOne: false;
            referencedRelation: "market_indices";
            referencedColumns: ["id"];
          },
        ];
      };
      ingestion_payloads: {
        Row: {
          content_sha256: string;
          fetched_at: string;
          id: string;
          raw_text: string;
          source_id: string;
          source_url: string;
        };
        Insert: {
          content_sha256: string;
          fetched_at?: string;
          id?: string;
          raw_text: string;
          source_id: string;
          source_url: string;
        };
        Update: {
          content_sha256?: string;
          fetched_at?: string;
          id?: string;
          raw_text?: string;
          source_id?: string;
          source_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ingestion_payloads_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      market_indices: {
        Row: {
          id: string;
          methodology: string;
          name: string;
          version: number;
        };
        Insert: {
          id: string;
          methodology: string;
          name: string;
          version?: number;
        };
        Update: {
          id?: string;
          methodology?: string;
          name?: string;
          version?: number;
        };
        Relationships: [];
      };
      metal_categories: {
        Row: {
          description: string;
          id: string;
          name: string;
          short_name: string;
          sort_order: number;
        };
        Insert: {
          description?: string;
          id: string;
          name: string;
          short_name: string;
          sort_order?: number;
        };
        Update: {
          description?: string;
          id?: string;
          name?: string;
          short_name?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      metal_source_coverage: {
        Row: {
          grade: string | null;
          id: string;
          metal_id: string;
          product_form: string | null;
          source_id: string;
          source_symbol: string;
        };
        Insert: {
          grade?: string | null;
          id?: string;
          metal_id: string;
          product_form?: string | null;
          source_id: string;
          source_symbol?: string;
        };
        Update: {
          grade?: string | null;
          id?: string;
          metal_id?: string;
          product_form?: string | null;
          source_id?: string;
          source_symbol?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_source_coverage_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "metal_source_coverage_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      metal_specifications: {
        Row: {
          composition: string | null;
          delivery_terms: string | null;
          element_content: number | null;
          form: string;
          grade: string;
          id: string;
          market_type: string | null;
          metal_id: string;
          purity: number | null;
          standard_ref: string | null;
          verification_status: string;
        };
        Insert: {
          composition?: string | null;
          delivery_terms?: string | null;
          element_content?: number | null;
          form: string;
          grade: string;
          id?: string;
          market_type?: string | null;
          metal_id: string;
          purity?: number | null;
          standard_ref?: string | null;
          verification_status?: string;
        };
        Update: {
          composition?: string | null;
          delivery_terms?: string | null;
          element_content?: number | null;
          form?: string;
          grade?: string;
          id?: string;
          market_type?: string | null;
          metal_id?: string;
          purity?: number | null;
          standard_ref?: string | null;
          verification_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "metal_specifications_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
        ];
      };
      metals: {
        Row: {
          aliases: string[];
          atomic_number: number | null;
          base_price: number | null;
          category_id: string;
          created_at: string;
          currency: string;
          description: string;
          id: string;
          name: string;
          name_ru: string;
          symbol: string;
          trend: number | null;
          unit: string;
          volatility: number | null;
        };
        Insert: {
          aliases?: string[];
          atomic_number?: number | null;
          base_price?: number | null;
          category_id: string;
          created_at?: string;
          currency?: string;
          description?: string;
          id: string;
          name: string;
          name_ru: string;
          symbol: string;
          trend?: number | null;
          unit?: string;
          volatility?: number | null;
        };
        Update: {
          aliases?: string[];
          atomic_number?: number | null;
          base_price?: number | null;
          category_id?: string;
          created_at?: string;
          currency?: string;
          description?: string;
          id?: string;
          name?: string;
          name_ru?: string;
          symbol?: string;
          trend?: number | null;
          unit?: string;
          volatility?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "metals_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "metal_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      news_articles: {
        Row: {
          canonical_url: string;
          categories: string[];
          excerpt: string;
          fingerprint: string;
          id: string;
          is_public: boolean;
          language: string;
          metal_ids: string[];
          original_title: string;
          published_at: string;
          regions: string[];
          retrieved_at: string;
          source_id: string;
          summary_ru: string | null;
          title_ru: string | null;
          translation_status: string;
        };
        Insert: {
          canonical_url: string;
          categories?: string[];
          excerpt: string;
          fingerprint: string;
          id?: string;
          is_public?: boolean;
          language?: string;
          metal_ids: string[];
          original_title: string;
          published_at: string;
          regions?: string[];
          retrieved_at?: string;
          source_id: string;
          summary_ru?: string | null;
          title_ru?: string | null;
          translation_status?: string;
        };
        Update: {
          canonical_url?: string;
          categories?: string[];
          excerpt?: string;
          fingerprint?: string;
          id?: string;
          is_public?: boolean;
          language?: string;
          metal_ids?: string[];
          original_title?: string;
          published_at?: string;
          regions?: string[];
          retrieved_at?: string;
          source_id?: string;
          summary_ru?: string | null;
          title_ru?: string | null;
          translation_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_articles_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "news_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      news_ingestion_runs: {
        Row: {
          accepted: number;
          error_code: string | null;
          finished_at: string | null;
          id: string;
          source_id: string | null;
          started_at: string;
          status: string;
        };
        Insert: {
          accepted?: number;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          source_id?: string | null;
          started_at?: string;
          status: string;
        };
        Update: {
          accepted?: number;
          error_code?: string | null;
          finished_at?: string | null;
          id?: string;
          source_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_ingestion_runs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "news_sources";
            referencedColumns: ["id"];
          },
        ];
      };
      news_metal_links: {
        Row: {
          article_id: string;
          metal_id: string;
        };
        Insert: {
          article_id: string;
          metal_id: string;
        };
        Update: {
          article_id?: string;
          metal_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "news_metal_links_article_id_fkey";
            columns: ["article_id"];
            isOneToOne: false;
            referencedRelation: "news_articles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "news_metal_links_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "active_metals";
            referencedColumns: ["metal_id"];
          },
        ];
      };
      news_sources: {
        Row: {
          allowed_hosts: string[];
          approved_at: string | null;
          enabled: boolean;
          etag: string | null;
          feed_url: string;
          format: string;
          home_url: string;
          id: string;
          last_attempt_at: string | null;
          last_modified: string | null;
          last_success_at: string | null;
          license_note: string;
          license_url: string;
          min_interval_seconds: number;
          name: string;
          retry_after_at: string | null;
          status: string;
        };
        Insert: {
          allowed_hosts: string[];
          approved_at?: string | null;
          enabled?: boolean;
          etag?: string | null;
          feed_url: string;
          format?: string;
          home_url: string;
          id: string;
          last_attempt_at?: string | null;
          last_modified?: string | null;
          last_success_at?: string | null;
          license_note: string;
          license_url: string;
          min_interval_seconds?: number;
          name: string;
          retry_after_at?: string | null;
          status?: string;
        };
        Update: {
          allowed_hosts?: string[];
          approved_at?: string | null;
          enabled?: boolean;
          etag?: string | null;
          feed_url?: string;
          format?: string;
          home_url?: string;
          id?: string;
          last_attempt_at?: string | null;
          last_modified?: string | null;
          last_success_at?: string | null;
          license_note?: string;
          license_url?: string;
          min_interval_seconds?: number;
          name?: string;
          retry_after_at?: string | null;
          status?: string;
        };
        Relationships: [];
      };
      price_history: {
        Row: {
          close: number;
          comparison_key: string;
          country: string | null;
          currency: string;
          data_status: string;
          high: number;
          id: string;
          low: number;
          metal_id: string;
          open: number;
          region_code: string | null;
          source_id: string;
          specification_id: string | null;
          trade_date: string;
          unit: string;
        };
        Insert: {
          close: number;
          comparison_key?: string;
          country?: string | null;
          currency: string;
          data_status: string;
          high: number;
          id?: string;
          low: number;
          metal_id: string;
          open: number;
          region_code?: string | null;
          source_id: string;
          specification_id?: string | null;
          trade_date: string;
          unit: string;
        };
        Update: {
          close?: number;
          comparison_key?: string;
          country?: string | null;
          currency?: string;
          data_status?: string;
          high?: number;
          id?: string;
          low?: number;
          metal_id?: string;
          open?: number;
          region_code?: string | null;
          source_id?: string;
          specification_id?: string | null;
          trade_date?: string;
          unit?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_history_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_history_region_code_fkey";
            columns: ["region_code"];
            isOneToOne: false;
            referencedRelation: "regional_markets";
            referencedColumns: ["code"];
          },
          {
            foreignKeyName: "price_history_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_history_specification_id_fkey";
            columns: ["specification_id"];
            isOneToOne: false;
            referencedRelation: "metal_specifications";
            referencedColumns: ["id"];
          },
        ];
      };
      price_quotations: {
        Row: {
          ask_price: number | null;
          attribution: string;
          bid_price: number | null;
          composition: string | null;
          country: string | null;
          data_status: string;
          delivery_terms: string | null;
          element_content: number | null;
          exchange_name: string | null;
          grade: string | null;
          id: string;
          market_type: string;
          metal_id: string;
          normalized_currency: string;
          normalized_price: number;
          normalized_unit: string;
          original_currency: string;
          original_price: number;
          original_unit: string;
          price_type: string;
          product_form: string | null;
          purity: number | null;
          quality_score: number;
          quoted_at: string;
          region: string;
          retrieved_at: string;
          source_id: string;
          source_url: string;
          specification_id: string | null;
          transaction_price: number | null;
          validation_status: string;
        };
        Insert: {
          ask_price?: number | null;
          attribution?: string;
          bid_price?: number | null;
          composition?: string | null;
          country?: string | null;
          data_status: string;
          delivery_terms?: string | null;
          element_content?: number | null;
          exchange_name?: string | null;
          grade?: string | null;
          id?: string;
          market_type: string;
          metal_id: string;
          normalized_currency: string;
          normalized_price: number;
          normalized_unit: string;
          original_currency: string;
          original_price: number;
          original_unit: string;
          price_type?: string;
          product_form?: string | null;
          purity?: number | null;
          quality_score: number;
          quoted_at: string;
          region: string;
          retrieved_at?: string;
          source_id: string;
          source_url?: string;
          specification_id?: string | null;
          transaction_price?: number | null;
          validation_status?: string;
        };
        Update: {
          ask_price?: number | null;
          attribution?: string;
          bid_price?: number | null;
          composition?: string | null;
          country?: string | null;
          data_status?: string;
          delivery_terms?: string | null;
          element_content?: number | null;
          exchange_name?: string | null;
          grade?: string | null;
          id?: string;
          market_type?: string;
          metal_id?: string;
          normalized_currency?: string;
          normalized_price?: number;
          normalized_unit?: string;
          original_currency?: string;
          original_price?: number;
          original_unit?: string;
          price_type?: string;
          product_form?: string | null;
          purity?: number | null;
          quality_score?: number;
          quoted_at?: string;
          region?: string;
          retrieved_at?: string;
          source_id?: string;
          source_url?: string;
          specification_id?: string | null;
          transaction_price?: number | null;
          validation_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_quotations_metal_id_fkey";
            columns: ["metal_id"];
            isOneToOne: false;
            referencedRelation: "metals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_quotations_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_quotations_specification_id_fkey";
            columns: ["specification_id"];
            isOneToOne: false;
            referencedRelation: "metal_specifications";
            referencedColumns: ["id"];
          },
        ];
      };
      regional_markets: {
        Row: {
          code: string;
          name_ru: string;
        };
        Insert: {
          code: string;
          name_ru: string;
        };
        Update: {
          code?: string;
          name_ru?: string;
        };
        Relationships: [];
      };
      update_logs: {
        Row: {
          finished_at: string | null;
          id: string;
          job: string;
          message: string;
          rows_written: number;
          source_id: string | null;
          started_at: string;
          status: string;
        };
        Insert: {
          finished_at?: string | null;
          id?: string;
          job: string;
          message?: string;
          rows_written?: number;
          source_id?: string | null;
          started_at?: string;
          status: string;
        };
        Update: {
          finished_at?: string | null;
          id?: string;
          job?: string;
          message?: string;
          rows_written?: number;
          source_id?: string | null;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "update_logs_source_id_fkey";
            columns: ["source_id"];
            isOneToOne: false;
            referencedRelation: "data_sources";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      app_exchange_rates: {
        Row: {
          base_currency: string | null;
          data_status: string | null;
          origin: string | null;
          provider_priority: number | null;
          quote_currency: string | null;
          rate: number | null;
          rate_date: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      claim_automation_job: { Args: { p_job: string }; Returns: string };
      claim_news_source: { Args: { p_id: string }; Returns: boolean };
      consume_ai_quota: { Args: { p_user_id: string }; Returns: boolean };
      finish_automation_job: {
        Args: { p_job: string; p_token: string };
        Returns: undefined;
      };
      get_quote_adapters: {
        Args: never;
        Returns: unknown[];
        SetofOptions: {
          from: "*";
          to: "quote_adapters";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      reserve_ai_tokens: {
        Args: { p_limit: number; p_tokens: number };
        Returns: boolean;
      };
      verify_collector_token: { Args: { p_token: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
