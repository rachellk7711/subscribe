import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export type Subscription = {
  id: string;
  created_at: string;
  service_name: string;
  amount: number;
  currency: 'KRW' | 'USD';
  billing_cycle: 'monthly' | 'yearly';
  billing_month: number | null;
  billing_date: number;
  payment_method: string;
  user_type: 'personal' | 'family';
  category: string;
  memo: string | null;
  
  // 추가 필드 (통합 고정비 관리용)
  is_variable: boolean;          // 금액 변동 여부
  annual_type: 'split' | 'single'; // 연간 비용 처리 (분할/일시불)
  payment_type: 'auto' | 'manual'; // 납부 방식 (자동/직접)
  is_paid: boolean;             // 이번 달 납부 완료 여부
  last_paid_month: string | null; // 마지막 납부 월 (YYYY-MM)
  started_at: string | null;
  ended_at: string | null;
};
