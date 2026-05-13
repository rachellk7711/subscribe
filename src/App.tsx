// Deployment Trigger: Professional Household Expense Manager (Deep Navy Theme)
import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  PieChart as PieChartIcon, 
  Search,
  X,
  Loader2,
  Trash2,
  Edit2,
  Calendar,
  Menu,
  Download,
  ExternalLink,
  CheckCircle2,
  Circle,
  AlertCircle,
  ChevronRight,
  Filter
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase, type Subscription } from './lib/supabase';
import { downloadICS, getGoogleCalendarLink, getNaverCalendarLink } from './utils/icsGenerator';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

ChartJS.register(ArcElement, Tooltip, Legend);

const getDaysRemaining = (billingDate: number) => {
  const today = new Date();
  const currentDay = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  
  if (billingDate >= currentDay) return billingDate - currentDay;
  else return daysInMonth - currentDay + billingDate;
};

const CATEGORIES = [
  '디지털 구독', '생활/주거', '교육/가족', '보험/금융', '세금/연간', '운동/취미'
];

function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalBillingCycle, setModalBillingCycle] = useState<'monthly'|'yearly'>('monthly');
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1350);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [calendarMenuId, setCalendarMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('전체');

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data?.rates?.KRW) setExchangeRate(data.rates.KRW);
      })
      .catch(err => console.error('Failed to fetch exchange rate:', err));
  }, []);

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching subscriptions:', error);
      return;
    }

    // [로직] 매달 1일 납부 상태 자동 초기화 체크
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const processedData = data.map((sub: Subscription) => {
      if (sub.last_paid_month !== currentMonth) {
        return { ...sub, is_paid: false };
      }
      return sub;
    });

    setSubscriptions(processedData as Subscription[]);
  };

  const togglePaidStatus = async (sub: Subscription) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const newStatus = !sub.is_paid;
    const { error } = await supabase
      .from('subscriptions')
      .update({ 
        is_paid: newStatus, 
        last_paid_month: newStatus ? currentMonth : null 
      })
      .eq('id', sub.id);

    if (!error) fetchSubscriptions();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    
    const subData = {
      service_name: formData.get('service_name') as string,
      amount: parseFloat(formData.get('amount') as string),
      currency: formData.get('currency') as 'KRW' | 'USD',
      billing_cycle: formData.get('billing_cycle') as 'monthly' | 'yearly',
      billing_month: formData.get('billing_cycle') === 'yearly' ? parseInt(formData.get('billing_month') as string, 10) : null,
      billing_date: parseInt(formData.get('billing_date') as string, 10),
      payment_method: formData.get('payment_method') as string,
      user_type: formData.get('user_type') as 'personal' | 'family',
      category: formData.get('category') as string,
      memo: formData.get('memo') as string || null,
      is_variable: formData.get('is_variable') === 'on',
      annual_type: formData.get('annual_type') as 'split' | 'single',
      payment_type: formData.get('payment_type') as 'auto' | 'manual',
      is_paid: editingSub ? editingSub.is_paid : false,
      last_paid_month: editingSub ? editingSub.last_paid_month : null,
    };

    let error;
    if (editingSub) {
      const { error: updateError } = await supabase.from('subscriptions').update(subData).eq('id', editingSub.id);
      error = updateError;
    } else {
      const { error: insertError } = await supabase.from('subscriptions').insert([subData]);
      error = insertError;
    }
    
    setIsSubmitting(false);
    if (error) alert('데이터 처리 중 오류가 발생했습니다.');
    else {
      setIsModalOpen(false);
      setEditingSub(null);
      fetchSubscriptions();
    }
  };

  const totalMonthlyKRW = useMemo(() => {
    const today = new Date();
    const currentMonthNum = today.getMonth() + 1;

    return subscriptions.reduce((acc, sub) => {
      let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
      
      if (sub.billing_cycle === 'yearly') {
        if (sub.annual_type === 'split') return acc + (amountKRW / 12);
        else if (sub.billing_month === currentMonthNum) return acc + amountKRW;
        else return acc;
      }
      return acc + amountKRW;
    }, 0);
  }, [subscriptions, exchangeRate]);

  const filteredSubs = subscriptions.filter(sub => {
    const matchesSearch = sub.service_name.toLowerCase().includes(searchTerm.toLowerCase()) || sub.category.includes(searchTerm);
    const matchesTab = activeTab === '전체' || sub.category === activeTab;
    return matchesSearch && matchesTab;
  });

  const chartData = {
    labels: CATEGORIES,
    datasets: [{
      data: CATEGORIES.map(cat => subscriptions.filter(s => s.category === cat).reduce((sum, s) => sum + (s.currency === 'USD' ? s.amount * exchangeRate : s.amount), 0)),
      backgroundColor: ['#d4af37', '#001f3f', '#1a2a44', '#2ecc71', '#ff4d4d', '#717171'],
      borderWidth: 0
    }]
  };

  return (
    <div className="flex h-screen bg-[#050a18] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 bg-[#0a1128] border-r border-white/5 flex flex-col transition-transform lg:translate-x-0 lg:static",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 shrink-0">
          <h1 className="text-2xl font-black text-[#d4af37] tracking-tighter italic flex items-center gap-2">
            <LayoutDashboard /> HOME EXPENSE
          </h1>
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">우리 집 통합 고정비 관리</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {['전체', ...CATEGORIES].map(cat => (
            <button 
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={cn(
                "w-full flex items-center justify-between px-5 py-4 rounded-2xl text-[14px] font-bold transition-all",
                activeTab === cat ? "bg-[#d4af37] text-[#0a1128] shadow-lg shadow-[#d4af37]/20" : "text-white/60 hover:bg-white/5"
              )}
            >
              <span className="flex items-center gap-3">
                {cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}
                {cat}
              </span>
              {activeTab === cat && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5">
          <div className="p-4 rounded-3xl bg-white/5 border border-white/10 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#d4af37] to-[#f1c40f] flex items-center justify-center text-[#0a1128] font-black">A</div>
            <div>
              <p className="text-xs font-black">MASTER USER</p>
              <p className="text-[10px] text-white/40">Household Admin</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        <header className="h-20 border-b border-white/5 bg-[#0a1128]/80 backdrop-blur-xl flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-3 bg-white/5 rounded-2xl" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
              <input 
                type="text" 
                placeholder="지출 항목 검색..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3.5 bg-white/5 border border-white/10 rounded-full text-[15px] focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] transition-all outline-none" 
              />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-10 pb-32">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight">이번 달 예정 지출</h2>
              <p className="text-white/40 text-[16px] font-medium mt-2">오늘 기준 총 {filteredSubs.length}개의 고정비가 집계되었습니다.</p>
            </div>
            <button onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }} className="btn-gold px-10 py-4 text-[16px] shadow-2xl transition-all">+ 지출 항목 추가</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 card-premium p-8 lg:p-12 relative overflow-hidden group">
              <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#d4af37]/10 rounded-full blur-3xl" />
              <p className="text-[12px] font-black text-[#d4af37] uppercase tracking-[0.3em] mb-4">Total Monthly Budget</p>
              <div className="flex items-baseline gap-4">
                <span className="text-5xl lg:text-7xl font-black tabular-nums tracking-tighter">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-xl text-white/40 font-bold">/ MONTH</span>
              </div>
              <div className="mt-12 flex gap-4">
                <div className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[13px] font-bold text-white/60">환율: ₩{Math.round(exchangeRate).toLocaleString()}</div>
                <div className="px-4 py-2 rounded-xl bg-[#d4af37]/10 border border-[#d4af37]/20 text-[13px] font-bold text-[#d4af37]">납부 진행률: {Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</div>
              </div>
            </div>
            <div className="card-premium p-8 flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-40 h-40 relative">
                <Pie data={chartData} options={{ cutout: '80%', plugins: { legend: { display: false } } }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Analysis</span>
                </div>
              </div>
              <p className="text-[15px] font-black mt-8 tracking-tight">카테고리별 지출 비중</p>
            </div>
          </div>

          <div className="card-premium overflow-hidden">
            <div className="px-8 py-6 border-b border-white/5 flex justify-between items-center bg-white/2">
              <h3 className="font-black text-xl tracking-tight flex items-center gap-2">지출 목록 <span className="text-[12px] bg-white/10 px-2 py-0.5 rounded-md text-white/40">{filteredSubs.length}</span></h3>
            </div>
            
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="text-white/40 font-black border-b border-white/5 uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-8 py-5">상태</th>
                    <th className="px-8 py-5">지출 항목</th>
                    <th className="px-8 py-5">금액</th>
                    <th className="px-8 py-5">결제일</th>
                    <th className="px-8 py-5">수단/타입</th>
                    <th className="px-8 py-5 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredSubs.map((sub) => {
                    const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                    const daysRemaining = getDaysRemaining(sub.billing_date);
                    return (
                      <tr key={sub.id} className={cn("hover:bg-white/[0.02] transition-all group", isManualUnpaid && "bg-red-500/5")}>
                        <td className="px-8 py-6">
                          <button onClick={() => togglePaidStatus(sub)} className={cn("transition-colors", sub.is_paid ? "text-[var(--success-green)]" : "text-white/20")}>
                            {sub.is_paid ? <CheckCircle2 size={24} /> : <Circle size={24} />}
                          </button>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="font-black text-lg flex items-center gap-2">
                              {sub.service_name}
                              {sub.is_variable && <span className="text-[10px] font-black text-[#d4af37] border border-[#d4af37]/30 px-1.5 rounded uppercase">Variable</span>}
                            </span>
                            <span className="text-[12px] text-white/40 font-bold">{sub.category}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="font-black text-lg">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</span>
                            {sub.billing_cycle === 'yearly' && <span className="text-[10px] font-black text-white/30 uppercase">{sub.annual_type === 'split' ? '12개월 분할' : '연 1회 일시불'}</span>}
                          </div>
                        </td>
                        <td className="px-8 py-6 font-black">
                          {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}
                          <div className={cn("text-[11px] font-bold mt-1", daysRemaining <= 3 ? "text-red-400" : "text-white/30")}>D-{daysRemaining === 0 ? 'Day' : daysRemaining}</div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex flex-col">
                            <span className="text-[13px] font-bold">{sub.payment_method}</span>
                            <span className={cn("text-[10px] font-black uppercase mt-1 px-2 py-0.5 rounded-md w-fit", sub.payment_type === 'auto' ? "bg-white/5 text-white/40" : "bg-red-500/20 text-red-400")}>
                              {sub.payment_type === 'auto' ? '자동 납부' : '직접 납부'}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <div className="relative">
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-2.5 bg-white/5 hover:bg-[#d4af37] hover:text-[#0a1128] rounded-xl transition-all"><Calendar size={18} /></button>
                              {calendarMenuId === sub.id && (
                                <div className="absolute bottom-full right-0 mb-3 w-52 bg-[#0a1128] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                                  <a href={getNaverCalendarLink(sub)} target="_blank" rel="noopener noreferrer" className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-white/5 font-bold text-sm border-b border-white/5 text-green-400"><ExternalLink size={16} /> 네이버 등록</a>
                                  <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noopener noreferrer" className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-white/5 font-bold text-sm border-b border-white/5 text-blue-400"><ExternalLink size={16} /> 구글 등록</a>
                                  <button onClick={() => downloadICS(sub)} className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-white/5 font-bold text-sm text-white/60"><Download size={16} /> ICS 다운로드</button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleEditSubscription(sub)} className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteSubscription(sub.id)} className="p-2.5 bg-white/5 hover:bg-red-500/20 text-red-400 rounded-xl"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="lg:hidden divide-y divide-white/5">
              {filteredSubs.map((sub) => {
                const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                return (
                  <div key={sub.id} className={cn("p-6 relative", isManualUnpaid && "bg-red-500/5")}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex gap-4">
                        <button onClick={() => togglePaidStatus(sub)} className={cn("mt-1", sub.is_paid ? "text-[var(--success-green)]" : "text-white/20")}>
                          {sub.is_paid ? <CheckCircle2 size={28} /> : <Circle size={28} />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-xl">{sub.service_name}</h4>
                            {sub.is_variable && <span className="text-[9px] font-black text-[#d4af37] border border-[#d4af37]/30 px-1 rounded uppercase tracking-tighter">VAR</span>}
                          </div>
                          <p className="text-[12px] font-bold text-white/40">{sub.category}</p>
                        </div>
                      </div>
                      <div className={cn("px-4 py-1.5 rounded-full font-black text-[11px]", sub.payment_type === 'auto' ? "bg-white/5 text-white/40" : "bg-red-500/20 text-red-400")}>
                        {sub.payment_type === 'auto' ? 'AUTO' : 'MANUAL'}
                      </div>
                    </div>
                    <div className="flex justify-between items-end mt-2">
                      <div>
                        <p className="text-[22px] font-black tracking-tighter text-[#d4af37]">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</p>
                        <p className="text-[12px] text-white/30 font-bold mt-1">결제일: {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ` : ''}{sub.billing_date}일</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditSubscription(sub)} className="p-4 bg-white/5 rounded-2xl"><Edit2 size={20} /></button>
                        <button onClick={() => handleDeleteSubscription(sub.id)} className="p-4 bg-white/5 text-red-400 rounded-2xl"><Trash2 size={20} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Improved Dynamic Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-[#0a1128] border border-white/10 rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-xl flex flex-col h-[90vh] sm:h-auto animate-in slide-in-from-bottom sm:zoom-in-95 mt-auto sm:mt-0">
              <div className="px-10 py-8 border-b border-white/5 flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-black text-[#d4af37] tracking-tight">{editingSub ? '지출 항목 수정' : '새 지출 항목 추가'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-white/5 rounded-2xl"><X size={24} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-8 pb-32 sm:pb-10">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-3">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 아파트 관리비, 실비보험" className="w-full input-navy text-lg font-black" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-3">금액 (기준)</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full input-navy text-lg font-black" />
                    <label className="flex items-center gap-2 mt-3 cursor-pointer">
                      <input type="checkbox" name="is_variable" defaultChecked={editingSub?.is_variable} className="w-4 h-4 rounded border-white/10 bg-white/5 text-[#d4af37]" />
                      <span className="text-[12px] font-bold text-white/60">매달 금액 변동됨</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-3">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full input-navy font-black bg-[#0a1128]"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>

                  <div className="col-span-2 border-t border-white/5 pt-6">
                    <label className="block text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-3">납부 방식</label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", (editingSub?.payment_type === 'auto' || !editingSub) ? "border-[#d4af37] bg-[#d4af37]/5" : "border-white/5")}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="payment_type" value="auto" defaultChecked={editingSub?.payment_type === 'auto' || !editingSub} className="text-[#d4af37]" />
                          <span className="font-black text-sm">자동 납부</span>
                        </div>
                        <span className="text-[10px] text-white/40 mt-1">계좌이체/카드 자동 승인</span>
                      </label>
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", editingSub?.payment_type === 'manual' ? "border-red-500 bg-red-500/5" : "border-white/5")}>
                        <div className="flex items-center gap-2">
                          <input type="radio" name="payment_type" value="manual" defaultChecked={editingSub?.payment_type === 'manual'} className="text-red-500" />
                          <span className="font-black text-sm">직접 납부</span>
                        </div>
                        <span className="text-[10px] text-white/40 mt-1">이체/지로 직접 결제</span>
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-black text-white/40 uppercase tracking-[0.2em] mb-3">결제 주기 및 연간 처리</label>
                    <div className="grid grid-cols-2 gap-4">
                      <select name="billing_cycle" defaultValue={editingSub?.billing_cycle || 'monthly'} onChange={(e) => setModalBillingCycle(e.target.value as 'monthly'|'yearly')} className="input-navy font-black bg-[#0a1128]"><option value="monthly">매월</option><option value="yearly">매년</option></select>
                      {modalBillingCycle === 'yearly' && (
                        <select name="annual_type" defaultValue={editingSub?.annual_type || 'split'} className="input-navy font-black bg-[#0a1128]"><option value="split">12개월 분할 표시</option><option value="single">일시불 (당월만)</option></select>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    {modalBillingCycle === 'yearly' && (<div><label className="block text-xs font-black text-white/40 mb-3 uppercase tracking-widest">결제 월</label><select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full input-navy font-black bg-[#0a1128]">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div>)}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}><label className="block text-xs font-black text-white/40 mb-3 uppercase tracking-widest">결제 일</label><select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full input-navy font-black bg-[#0a1128]">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select></div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-black text-white/40 uppercase mb-3 tracking-widest">카테고리</label>
                      <select name="category" defaultValue={editingSub?.category || '디지털 구독'} className="w-full input-navy font-black bg-[#0a1128]">{CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-white/40 uppercase mb-3 tracking-widest">결제 수단</label>
                      <input name="payment_method" defaultValue={editingSub?.payment_method} type="text" placeholder="예: 신한카드 1234" className="w-full input-navy font-black" />
                    </div>
                  </div>
                </div>

                <div className="fixed sm:static bottom-0 left-0 right-0 p-8 sm:p-0 bg-[#0a1128] sm:bg-transparent border-t border-white/5 sm:border-none flex flex-col sm:flex-row gap-4 mt-8">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 flex-1 py-5 font-black text-white/40 hover:bg-white/5 rounded-2xl transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] btn-gold py-5 text-xl flex items-center justify-center gap-3">
                    {isSubmitting && <Loader2 className="w-7 h-7 animate-spin" />}
                    {editingSub ? '정보 업데이트' : '지출 항목 등록'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
