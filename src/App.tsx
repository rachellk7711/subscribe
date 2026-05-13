// Deployment Trigger: Final Layout Polishing (Red & White + Persistent Sidebar on PC)
import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
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

    const currentMonth = new Date().toISOString().slice(0, 7);
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

  const handleEditSubscription = (sub: Subscription) => {
    setEditingSub(sub);
    setModalBillingCycle(sub.billing_cycle);
    setIsModalOpen(true);
  };

  const handleDeleteSubscription = async (id: string) => {
    if (!window.confirm('정말로 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) alert('삭제 중 오류가 발생했습니다.');
    else fetchSubscriptions();
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
      backgroundColor: ['#ff385c', '#222222', '#717171', '#ffb6c1', '#f8f9fa', '#dddddd'],
      borderWidth: 0
    }]
  };

  return (
    <div className="flex h-screen bg-[#f7f7f7] text-[#222222] font-sans overflow-hidden">
      {/* Sidebar Overlay (Mobile only) */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar - Fix: Always visible on Desktop (lg:static + lg:translate-x-0) */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 bg-white border-r border-[#dddddd] flex flex-col transition-transform lg:translate-x-0 lg:static lg:z-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-8 shrink-0">
          <h1 className="text-2xl font-black text-[#ff385c] tracking-tighter flex items-center gap-2">
            <LayoutDashboard /> 관리자
          </h1>
          <p className="text-[10px] text-[#717171] font-bold uppercase tracking-widest mt-1">우리 집 통합 고정비 관리</p>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {['전체', ...CATEGORIES].map(cat => (
            <button 
              key={cat}
              onClick={() => { setActiveTab(cat); setIsSidebarOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-[14px] font-bold transition-all",
                activeTab === cat ? "bg-[#ff385c] text-white shadow-sm" : "text-[#717171] hover:bg-[#f7f7f7]"
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
        <div className="p-6 border-t border-[#dddddd] bg-white shrink-0">
          <div className="p-4 rounded-2xl bg-[#f8f9fa] border border-[#dddddd] flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ff385c] text-white flex items-center justify-center font-black shadow-sm">A</div>
            <div>
              <p className="text-xs font-black uppercase tracking-tighter">Household Admin</p>
              <p className="text-[10px] text-[#717171]">Antigravity Pro</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative h-full bg-[#f7f7f7]">
        {/* Header */}
        <header className="h-20 border-b border-[#dddddd] bg-white/90 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-3 bg-[#f8f9fa] border border-[#dddddd] rounded-xl shadow-sm" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#717171]" size={18} />
              <input 
                type="text" 
                placeholder="항목 검색..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-6 py-3 bg-[#f7f7f7] border border-[#dddddd] rounded-full text-[15px] outline-none focus:border-[#ff385c] focus:bg-white transition-all shadow-inner" 
              />
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-10 pb-32">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight">통합 고정비 대시보드</h2>
              <p className="text-[#717171] text-[16px] lg:text-[18px] font-medium mt-1">총 {filteredSubs.length}개의 고정비 항목을 관리 중입니다.</p>
            </div>
            <button 
              onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }} 
              className="btn-primary px-10 py-4 text-[17px] shadow-lg shadow-[#ff385c]/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              + 지출 항목 추가
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white border border-[#dddddd] rounded-[32px] p-8 lg:p-12 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#ff385c]/5 rounded-full -mr-20 -mt-20 blur-3xl" />
              <p className="text-[12px] font-black text-[#717171] uppercase tracking-[0.2em] mb-4">Current Monthly Total</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl lg:text-7xl font-black tabular-nums tracking-tighter">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-lg lg:text-xl text-[#717171] font-bold">/ MO</span>
              </div>
              <div className="mt-12 flex flex-wrap gap-3">
                <div className="px-5 py-2.5 rounded-full bg-[#f8f9fa] border border-[#dddddd] text-[13px] font-black text-[#717171] shadow-sm">환율: ₩{Math.round(exchangeRate).toLocaleString()}</div>
                <div className="px-5 py-2.5 rounded-full bg-[#ff385c]/10 border border-[#ff385c]/20 text-[13px] font-black text-[#ff385c] shadow-sm">납부 진행률: {Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</div>
              </div>
            </div>
            <div className="bg-white border border-[#dddddd] rounded-[32px] p-8 lg:p-10 shadow-sm flex flex-col items-center justify-center min-h-[300px]">
              <div className="w-44 h-44 relative">
                <Pie data={chartData} options={{ cutout: '80%', plugins: { legend: { display: false } } }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-black text-[#717171]/40 uppercase tracking-widest">Analytics</span>
                </div>
              </div>
              <p className="text-[16px] font-black mt-8 tracking-tight">지출 성격별 분석</p>
            </div>
          </div>

          <div className="bg-white border border-[#dddddd] rounded-[32px] shadow-sm overflow-hidden mb-12">
            <div className="px-8 lg:px-12 py-8 border-b border-[#dddddd] flex justify-between items-center bg-[#fcfcfc]">
              <h3 className="font-black text-2xl tracking-tight">지출 상세 목록</h3>
            </div>
            
            {/* Desktop View */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-[#f8f9fa] text-[#717171] font-black border-b border-[#dddddd] uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-12 py-6">상태</th>
                    <th className="px-12 py-6">지출 항목</th>
                    <th className="px-12 py-6">금액</th>
                    <th className="px-12 py-6">결제일</th>
                    <th className="px-12 py-6">납부수단</th>
                    <th className="px-12 py-6 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dddddd]">
                  {filteredSubs.map((sub) => {
                    const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                    const daysRemaining = getDaysRemaining(sub.billing_date);
                    return (
                      <tr key={sub.id} className={cn("hover:bg-[#f8f9fa] transition-all group", isManualUnpaid && "bg-red-50/50")}>
                        <td className="px-12 py-8">
                          <button onClick={() => togglePaidStatus(sub)} className={cn("transition-all active:scale-90", sub.is_paid ? "text-[#008a05]" : "text-[#dddddd] hover:text-[#717171]")}>
                            {sub.is_paid ? <CheckCircle2 size={28} /> : <Circle size={28} />}
                          </button>
                        </td>
                        <td className="px-12 py-8">
                          <div className="flex flex-col">
                            <span className="font-black text-xl flex items-center gap-2">
                              {sub.service_name}
                              {sub.is_variable && <span className="text-[10px] font-black text-[#ff385c] border border-[#ff385c]/30 px-2 py-0.5 rounded uppercase tracking-tighter">변동비</span>}
                            </span>
                            <span className="text-[13px] text-[#717171] font-bold mt-1">{sub.category}</span>
                          </div>
                        </td>
                        <td className="px-12 py-8">
                          <div className="flex flex-col">
                            <span className="font-black text-xl text-[#222222]">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</span>
                            {sub.billing_cycle === 'yearly' && <span className="text-[10px] font-black text-[#717171] uppercase mt-1">{sub.annual_type === 'split' ? '12개월 분할' : '연간 일시불'}</span>}
                          </div>
                        </td>
                        <td className="px-12 py-8 font-black">
                          <div className="text-lg">
                            {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}
                          </div>
                          <div className={cn("text-[12px] font-bold mt-1", daysRemaining <= 3 ? "text-[#ff385c]" : "text-[#717171]")}>
                            D-{daysRemaining === 0 ? 'Day' : daysRemaining}
                          </div>
                        </td>
                        <td className="px-12 py-8">
                          <div className="flex flex-col">
                            <span className="text-[14px] font-bold text-[#222222]">{sub.payment_method}</span>
                            <span className={cn("text-[10px] font-black uppercase mt-2 px-3 py-1 rounded-full w-fit shadow-sm", sub.payment_type === 'auto' ? "bg-white border border-[#dddddd] text-[#717171]" : "bg-red-500 text-white")}>
                              {sub.payment_type === 'auto' ? '자동 납부' : '직접 납부'}
                            </span>
                          </div>
                        </td>
                        <td className="px-12 py-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform group-hover:-translate-x-2">
                            <div className="relative">
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-3 bg-white border border-[#dddddd] rounded-xl hover:bg-[#ff385c] hover:text-white transition-all shadow-sm"><Calendar size={20} /></button>
                              {calendarMenuId === sub.id && (
                                <div className="absolute bottom-full right-0 mb-4 w-52 bg-white border border-[#dddddd] rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in zoom-in-95">
                                  <a href={getNaverCalendarLink(sub)} target="_blank" rel="noopener noreferrer" className="w-full px-6 py-4 text-left flex items-center gap-3 hover:bg-[#f8f9fa] font-black text-[13px] border-b border-[#dddddd] text-green-600"><ExternalLink size={18} /> 네이버 등록</a>
                                  <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noopener noreferrer" className="w-full px-6 py-4 text-left flex items-center gap-3 hover:bg-[#f8f9fa] font-black text-[13px] border-b border-[#dddddd] text-blue-600"><ExternalLink size={18} /> 구글 등록</a>
                                  <button onClick={() => { downloadICS(sub); setCalendarMenuId(null); }} className="w-full px-6 py-4 text-left flex items-center gap-3 hover:bg-[#f8f9fa] font-black text-[13px] text-[#222222]"><Download size={18} /> ICS 다운로드</button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleEditSubscription(sub)} className="p-3 bg-white border border-[#dddddd] rounded-xl hover:shadow-md transition-all"><Edit2 size={20} /></button>
                            <button onClick={() => handleDeleteSubscription(sub.id)} className="p-3 bg-white border border-[#dddddd] rounded-xl hover:bg-red-50 text-red-600 transition-all"><Trash2 size={20} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile View */}
            <div className="lg:hidden divide-y divide-[#dddddd]">
              {filteredSubs.map((sub) => {
                const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                return (
                  <div key={sub.id} className={cn("p-6 relative transition-all", isManualUnpaid && "bg-red-50")}>
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex gap-4">
                        <button onClick={() => togglePaidStatus(sub)} className={cn("mt-1 transition-all active:scale-75", sub.is_paid ? "text-[#008a05]" : "text-[#dddddd]")}>
                          {sub.is_paid ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-black text-xl">{sub.service_name}</h4>
                            {sub.is_variable && <span className="text-[9px] font-black text-[#ff385c] border border-[#ff385c]/30 px-1 rounded uppercase tracking-tighter">변동비</span>}
                          </div>
                          <p className="text-[13px] font-bold text-[#717171]">{sub.category}</p>
                        </div>
                      </div>
                      <div className={cn("px-4 py-1.5 rounded-full font-black text-[11px] shadow-sm", sub.payment_type === 'auto' ? "bg-white border border-[#dddddd] text-[#717171]" : "bg-red-500 text-white")}>
                        {sub.payment_type === 'auto' ? 'AUTO' : 'MANUAL'}
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[24px] font-black text-[#ff385c] tracking-tighter">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</p>
                        <p className="text-[13px] text-[#717171] font-bold mt-1">결제일: {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ` : ''}{sub.billing_date}일</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleEditSubscription(sub)} className="p-4 bg-[#f8f9fa] border border-[#dddddd] rounded-2xl active:scale-90 transition-all"><Edit2 size={22} /></button>
                        <button onClick={() => handleDeleteSubscription(sub.id)} className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl active:scale-90 transition-all"><Trash2 size={22} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-white border border-[#dddddd] rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-xl flex flex-col h-[92vh] sm:h-auto animate-in slide-in-from-bottom sm:zoom-in-95 mt-auto sm:mt-0">
              <div className="px-10 py-8 border-b border-[#dddddd] flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-black tracking-tight">{editingSub ? '지출 정보 수정' : '새로운 지출 항목'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-[#f8f9fa] rounded-2xl hover:rotate-90 transition-all duration-300"><X size={24} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-8 pb-32 sm:pb-10">
                <div className="grid grid-cols-2 gap-8">
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-3">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 아파트 관리비, 실비보험" className="w-full input-standard text-lg font-black" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-3">금액 (기본)</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full input-standard text-lg font-black" />
                    <label className="flex items-center gap-3 mt-4 cursor-pointer group">
                      <input type="checkbox" name="is_variable" defaultChecked={editingSub?.is_variable} className="w-5 h-5 rounded border-[#dddddd] text-[#ff385c] focus:ring-[#ff385c]" />
                      <span className="text-[13px] font-black text-[#717171] group-hover:text-[#222222] transition-colors">매달 금액이 달라짐 (변동비)</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-3">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full input-standard font-black bg-white"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>

                  <div className="col-span-2 pt-4">
                    <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-4">납부 방식 선택</label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className={cn("flex flex-col p-5 rounded-2xl border-2 transition-all cursor-pointer group", (editingSub?.payment_type === 'auto' || !editingSub) ? "border-[#ff385c] bg-[#ff385c]/5" : "border-[#dddddd] hover:border-[#717171]")}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="payment_type" value="auto" defaultChecked={editingSub?.payment_type === 'auto' || !editingSub} className="text-[#ff385c]" />
                          <span className="font-black text-sm">자동 납부</span>
                        </div>
                        <p className="text-[10px] text-[#717171] mt-2 font-bold">자동이체 또는 카드 승인</p>
                      </label>
                      <label className={cn("flex flex-col p-5 rounded-2xl border-2 transition-all cursor-pointer group", editingSub?.payment_type === 'manual' ? "border-red-500 bg-red-50" : "border-[#dddddd] hover:border-[#717171]")}>
                        <div className="flex items-center gap-3">
                          <input type="radio" name="payment_type" value="manual" defaultChecked={editingSub?.payment_type === 'manual'} className="text-red-500" />
                          <span className="font-black text-sm">직접 납부</span>
                        </div>
                        <p className="text-[10px] text-[#717171] mt-2 font-bold">지로/이체 등으로 직접 납부</p>
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-3">결제 주기</label>
                      <select name="billing_cycle" defaultValue={editingSub?.billing_cycle || 'monthly'} onChange={(e) => setModalBillingCycle(e.target.value as 'monthly'|'yearly')} className="w-full input-standard font-black"><option value="monthly">매월 결제</option><option value="yearly">매년 결제</option></select>
                    </div>
                    {modalBillingCycle === 'yearly' && (
                      <div>
                        <label className="block text-xs font-black text-[#717171] uppercase tracking-[0.2em] mb-3">연간 비용 정산</label>
                        <select name="annual_type" defaultValue={editingSub?.annual_type || 'split'} className="w-full input-standard font-black"><option value="split">12개월 분할 표시</option><option value="single">일시불 (당월만)</option></select>
                      </div>
                    )}
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-6">
                    {modalBillingCycle === 'yearly' && (<div><label className="block text-xs font-black text-[#717171] mb-3 uppercase tracking-widest">결제 월</label><select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full input-standard font-black">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div>)}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}><label className="block text-xs font-black text-[#717171] mb-3 uppercase tracking-widest">결제 일</label><select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full input-standard font-black">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select></div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-6 pb-20 sm:pb-0">
                    <div>
                      <label className="block text-xs font-black text-[#717171] uppercase mb-3 tracking-widest">카테고리</label>
                      <select name="category" defaultValue={editingSub?.category || '디지털 구독'} className="w-full input-standard font-black bg-white">{CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-[#717171] uppercase mb-3 tracking-widest">결제 수단</label>
                      <input name="payment_method" defaultValue={editingSub?.payment_method} type="text" placeholder="예: 신한카드 1234" className="w-full input-standard font-black" />
                    </div>
                  </div>
                </div>

                <div className="fixed sm:static bottom-0 left-0 right-0 p-8 sm:p-0 bg-white sm:bg-transparent border-t border-[#dddddd] sm:border-none flex flex-col sm:flex-row gap-4 mt-8">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 flex-1 py-5 font-black text-[#717171] hover:bg-[#f8f9fa] rounded-2xl transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] btn-primary py-5 text-xl flex items-center justify-center gap-3 shadow-xl shadow-[#ff385c]/20">
                    {isSubmitting && <Loader2 className="w-7 h-7 animate-spin" />}
                    {editingSub ? '변경사항 저장' : '새 항목 등록'}
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
