import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Subscription = {
  id: string;
  user_id: string;
  service_name: string;
  amount: number;
  currency: 'KRW' | 'USD';
  billing_cycle: 'monthly' | 'yearly';
  billing_month?: number | null;
  billing_date: number;
  payment_method: string;
  user_type: 'personal' | 'family';
  category: string;
  memo?: string;
  created_at: string;
}
