// Performance Update: Smart Sorting by D-Day + Typography & Contrast Balancing
import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Search,
  X,
  Loader2,
  Trash2,
  Edit2,
  Calendar as CalendarIcon,
  Menu,
  CheckCircle2,
  Circle,
  ChevronRight,
  Filter,
  BarChart3,
  Clock
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

const CATEGORIES = [
  '디지털 구독', '생활/주거', '교육/가족', '보험/금융', '세금/연간', '운동/취미'
];

function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalBillingCycle, setModalBillingCycle] = useState<'monthly'|'yearly'>('monthly');
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1400);
  const [searchTerm, setSearchTerm] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [calendarMenuId, setCalendarMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('전체');

  const todayDate = new Date();
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    }).format(todayDate);
  }, [todayDate]);

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(res => res.json())
      .then(data => { if (data?.rates?.KRW) setExchangeRate(data.rates.KRW); })
      .catch(err => console.error(err));
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    const { data, error } = await supabase.from('subscriptions').select('*');
    if (error) return;
    const currentMonth = new Date().toISOString().slice(0, 7);
    const processed = (data as Subscription[]).map(sub => ({
      ...sub,
      is_paid: sub.last_paid_month === currentMonth ? sub.is_paid : false
    }));
    setSubscriptions(processed);
  };

  const togglePaidStatus = async (sub: Subscription) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const newStatus = !sub.is_paid;
    const { error } = await supabase.from('subscriptions').update({ 
      is_paid: newStatus, 
      last_paid_month: newStatus ? currentMonth : null 
    }).eq('id', sub.id);
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
      billing_cycle: modalBillingCycle,
      billing_month: modalBillingCycle === 'yearly' ? parseInt(formData.get('billing_month') as string, 10) : null,
      billing_date: parseInt(formData.get('billing_date') as string, 10),
      payment_method: formData.get('payment_method') as string,
      category: formData.get('category') as string,
      memo: formData.get('memo') as string || null,
      is_variable: formData.get('is_variable') === 'on',
      annual_type: (formData.get('annual_type') as 'split' | 'single') || 'single',
      payment_type: (formData.get('payment_type') as 'auto' | 'manual') || 'auto',
      user_type: 'personal',
    };

    const { error } = editingSub 
      ? await supabase.from('subscriptions').update(subData).eq('id', editingSub.id)
      : await supabase.from('subscriptions').insert([subData]);

    setIsSubmitting(false);
    if (!error) { 
      setIsModalOpen(false);
      setEditingSub(null); 
      fetchSubscriptions(); 
    } else {
      alert(`오류: ${error.message}`);
    }
  };

  const totalMonthlyKRW = useMemo(() => {
    return subscriptions.reduce((acc, sub) => {
      let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
      if (sub.billing_cycle === 'yearly') {
        return sub.annual_type === 'split' ? acc + (amountKRW / 12) : (sub.billing_month === (todayDate.getMonth() + 1) ? acc + amountKRW : acc);
      }
      return acc + amountKRW;
    }, 0);
  }, [subscriptions, exchangeRate, todayDate]);

  // 스마트 정렬 및 필터링 로직
  const filteredSubs = useMemo(() => {
    const filtered = subscriptions.filter(sub => 
      (activeTab === '전체' || sub.category === activeTab) && 
      sub.service_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // 남은 일수 계산 함수
    const getDaysUntil = (sub: Subscription) => {
      const currentDay = todayDate.getDate();
      const currentMonth = todayDate.getMonth() + 1;
      
      if (sub.billing_cycle === 'monthly') {
        let diff = sub.billing_date - currentDay;
        return diff >= 0 ? diff : diff + 31;
      } else {
        // 연간은 월까지 고려
        const targetDate = new Date(todayDate.getFullYear(), (sub.billing_month || 1) - 1, sub.billing_date);
        if (targetDate < todayDate) targetDate.setFullYear(todayDate.getFullYear() + 1);
        return Math.ceil((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    };

    // 남은 일수가 적은 순으로 정렬 (3일 후가 상단에 오도록)
    return [...filtered].sort((a, b) => getDaysUntil(a) - getDaysUntil(b));
  }, [subscriptions, activeTab, searchTerm, todayDate]);

  const chartData = useMemo(() => ({
    labels: CATEGORIES,
    datasets: [{
      data: CATEGORIES.map(cat => subscriptions.filter(s => s.category === cat).reduce((sum, s) => sum + (s.currency === 'USD' ? s.amount * exchangeRate : s.amount), 0)),
      backgroundColor: ['#ff385c', '#222222', '#555555', '#ffb6c1', '#f0f0f0', '#cccccc'],
      borderWidth: 0
    }]
  }), [subscriptions, exchangeRate]);

  return (
    <div className="flex h-screen bg-canvas text-ink font-sans overflow-hidden">
      {/* PC 사이드바: 텍스트 크기 및 비율 조정 */}
      <aside className="hidden lg:flex flex-col w-80 bg-white border-r border-hairline shrink-0 h-full shadow-sm z-50">
        <div className="p-10 shrink-0">
          <h1 className="text-3xl font-black text-primary tracking-tighter flex items-center gap-3">
            <LayoutDashboard size={32} /> 구독/고정비 관리
          </h1>
          <p className="text-[11px] text-gray-500 font-black uppercase tracking-[0.2em] mt-2 opacity-80">통합 고정비 관리 시스템</p>
        </div>
        <nav className="flex-1 px-6 space-y-1.5 overflow-y-auto">
          {['전체', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)} className={cn("w-full flex items-center justify-between px-6 py-4 rounded-2xl text-[15px] font-black transition-all text-left", activeTab === cat ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]" : "text-gray-600 hover:bg-canvas hover:text-ink")}>
              <span className="flex items-center gap-4">{cat === '전체' ? <Filter size={20} /> : <div className="w-2 h-2 rounded-full bg-current" />}{cat}</span>
              {activeTab === cat && <ChevronRight size={18} />}
            </button>
          ))}
        </nav>
        <div className="p-8 border-t border-hairline bg-white shrink-0">
          <div className="flex items-center gap-4 p-5 bg-canvas rounded-[24px] border border-hairline">
            <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center text-xl font-black shadow-md">A</div>
            <div><p className="text-sm font-black text-ink">MASTER</p><p className="text-[11px] text-gray-500 font-bold uppercase tracking-wider">Household Pro</p></div>
          </div>
        </div>
      </aside>

      {/* 모바일 사이드바 */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 bg-white flex flex-col shadow-airbnb animate-in slide-in-from-left duration-300">
            <div className="p-10 flex justify-between items-center border-b border-hairline shrink-0">
              <h1 className="text-2xl font-black text-primary">메뉴</h1>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2"><X size={28} /></button>
            </div>
            <div className="flex-1 px-6 py-8 space-y-2 overflow-y-auto">
              {['전체', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => { setActiveTab(cat); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-4 px-6 py-5 rounded-2xl font-black text-lg", activeTab === cat ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-gray-600 hover:bg-canvas")}>
                  {cat === '전체' ? <Filter size={22} /> : <div className="w-2 h-2 rounded-full bg-current" />}{cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-canvas overflow-hidden">
        <header className="h-24 bg-white/80 backdrop-blur-md border-b border-hairline flex items-center justify-between px-8 lg:px-12 shrink-0 z-40 sticky top-0">
          <div className="flex items-center gap-6 flex-1">
            <button className="lg:hidden p-3 bg-white border border-hairline rounded-2xl shadow-sm" onClick={() => setIsMobileMenuOpen(true)}><Menu size={28} /></button>
            <div className="relative flex-1 max-w-xl">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
              <input type="text" placeholder="항목 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-14 pr-8 py-4 bg-canvas border border-hairline rounded-full text-[15px] font-medium focus:bg-white focus:border-primary outline-none transition-all shadow-inner" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 lg:p-12 space-y-12 pb-32">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8">
            <div className="flex items-center gap-6">
              <div className="p-5 bg-primary text-white rounded-[28px] shadow-xl shadow-primary/30 hidden sm:block transform hover:rotate-6 transition-transform">
                <BarChart3 size={36} />
              </div>
              <div>
                <div className="flex items-center gap-4">
                  <BarChart3 size={28} className="text-primary sm:hidden" />
                  <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-ink">통합 고정비 대시보드</h2>
                </div>
                <div className="flex items-center gap-3 text-gray-600 font-bold mt-2.5">
                  <Clock size={16} className="text-primary" />
                  <span className="text-base">{todayStr}</span>
                  <span className="mx-2 text-hairline opacity-50">|</span>
                  <p className="text-base text-ink font-black">총 {filteredSubs.length}건 정렬됨</p>
                </div>
              </div>
            </div>
            <button onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }} className="w-full sm:w-auto shrink-0 bg-primary text-white px-10 py-5 rounded-[20px] font-black text-xl shadow-lg hover:bg-primary-dark transition-all active:scale-95 shadow-primary/20">
              + 지출 항목 추가
            </button>
          </div>

          {/* 대시보드 카드: 텍스트 비율 조정 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 bg-white border border-hairline rounded-airbnb p-10 lg:p-14 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -mr-24 -mt-24 blur-3xl group-hover:bg-primary/10 transition-colors duration-500" />
              <p className="text-sm font-black text-gray-500 uppercase tracking-[0.2em] mb-6 opacity-80">Total Monthly Expenditure</p>
              <div className="flex items-baseline gap-4">
                <span className="text-6xl lg:text-8xl font-black tabular-nums tracking-tighter text-ink leading-none">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-2xl text-gray-500 font-black">/ MO</span>
              </div>
              <div className="mt-12 flex flex-wrap gap-4">
                <div className="px-6 py-2.5 rounded-full bg-canvas border border-hairline text-[13px] font-black text-gray-600 shadow-sm">환율: ₩{Math.round(exchangeRate)}</div>
                <div className="px-6 py-2.5 rounded-full bg-primary/10 border border-primary/20 text-[13px] font-black text-primary shadow-sm">납부 진행률: {Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</div>
              </div>
            </div>
            <div className="bg-white border border-hairline rounded-airbnb p-10 flex flex-col items-center justify-center min-h-[300px] shadow-sm">
              <div className="w-48 h-48 relative">
                <Pie data={chartData} options={{ cutout: '80%', plugins: { legend: { display: false } } }} />
              </div>
              <p className="text-base font-black mt-8 text-ink tracking-tight">지출 성격별 분석</p>
            </div>
          </div>

          {/* 테이블 영역: 명도 및 크기 밸런스 조정 */}
          <div className="bg-white border border-hairline rounded-airbnb shadow-sm overflow-hidden mb-10">
            <div className="px-10 py-8 border-b border-hairline bg-canvas/40 flex justify-between items-center">
              <h3 className="font-black text-2xl text-ink tracking-tight">지출 상세 내역 <span className="text-sm font-bold text-gray-400 ml-2">(결제일 임박순 정렬)</span></h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead className="bg-canvas text-gray-600 font-black text-xs uppercase tracking-[0.15em] border-b border-hairline">
                  <tr>
                    <th className="px-10 py-6 w-20 text-center">납부</th>
                    <th className="px-10 py-6">지출 항목</th>
                    <th className="px-10 py-6">금액</th>
                    <th className="px-10 py-6">결제예정일</th>
                    <th className="px-10 py-6">결제방식</th>
                    <th className="px-10 py-6">메모</th>
                    <th className="px-10 py-6 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredSubs.map((sub) => {
                    const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                    const days = Math.max(0, sub.billing_date - todayDate.getDate());
                    return (
                      <tr key={sub.id} className={cn("group transition-colors", isManualUnpaid ? "bg-red-50/50" : "hover:bg-canvas/50")}>
                        <td className="px-10 py-8 text-center">
                          <button onClick={() => togglePaidStatus(sub)} className={cn("transition-all active:scale-90", sub.is_paid ? "text-green-600 scale-110" : "text-gray-300 hover:text-gray-500")}>
                            {sub.is_paid ? <CheckCircle2 size={32} /> : <Circle size={32} />}
                          </button>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex flex-col">
                            <span className="font-black text-xl text-ink flex items-center gap-2 tracking-tight">
                              {sub.service_name}
                              {sub.is_variable && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-black uppercase tracking-tighter shadow-sm border border-amber-200">변동비</span>}
                            </span>
                            <span className="text-[13px] text-gray-500 font-bold mt-1">{sub.category}</span>
                          </div>
                        </td>
                        <td className="px-10 py-8 font-black text-xl text-ink tabular-nums tracking-tight">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</td>
                        <td className="px-10 py-8 font-black text-ink">
                          <span className="text-lg">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}</span>
                          <div className={cn("text-xs font-black mt-1.5 px-2 py-0.5 rounded-full w-fit", days <= 3 ? "bg-primary text-white animate-pulse" : "bg-gray-100 text-gray-500")}>D-{days === 0 ? 'Day' : days}</div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex flex-col gap-2">
                            <span className="text-sm font-black text-gray-700 tracking-tight">{sub.payment_method}</span>
                            <span className={cn("text-[10px] font-black uppercase px-2.5 py-1 rounded-lg w-fit shadow-sm border", sub.payment_type === 'auto' ? "bg-white text-gray-500 border-hairline" : "bg-primary text-white border-primary-dark")}>
                              {sub.payment_type === 'auto' ? '자동이체' : '직접납부'}
                            </span>
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <span className="text-[13px] text-gray-700 font-medium line-clamp-2 max-w-[250px] leading-relaxed italic">{sub.memo || '-'}</span>
                        </td>
                        <td className="px-10 py-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform group-hover:-translate-x-2">
                            <button onClick={() => { setEditingSub(sub); setModalBillingCycle(sub.billing_cycle); setIsModalOpen(true); }} className="p-3 bg-white border border-hairline rounded-[14px] hover:shadow-lg transition-all text-gray-600 hover:text-ink"><Edit2 size={20} /></button>
                            <button onClick={async () => { if(window.confirm('정말 삭제할까요?')) { await supabase.from('subscriptions').delete().eq('id', sub.id); fetchSubscriptions(); } }} className="p-3 bg-white border border-hairline rounded-[14px] hover:bg-red-50 text-red-600 transition-all shadow-sm"><Trash2 size={20} /></button>
                            <div className="relative">
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-3 bg-white border border-hairline rounded-[14px] hover:bg-primary hover:text-white transition-all shadow-sm"><CalendarIcon size={20} /></button>
                              {calendarMenuId === sub.id && (
                                <div className="absolute right-0 mt-3 w-56 bg-white border border-hairline rounded-[24px] shadow-airbnb z-[100] overflow-hidden text-left animate-in fade-in zoom-in-95">
                                  <a href={getNaverCalendarLink(sub)} target="_blank" rel="noreferrer" className="block px-6 py-4 text-sm font-black text-green-600 hover:bg-green-50 border-b border-hairline transition-colors">네이버 일정 등록</a>
                                  <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noreferrer" className="block px-6 py-4 text-sm font-black text-blue-600 hover:bg-blue-50 border-b border-hairline transition-colors">구글 일정 등록</a>
                                  <button onClick={() => { downloadICS(sub); setCalendarMenuId(null); }} className="w-full text-left px-6 py-4 text-sm font-black text-ink hover:bg-canvas transition-colors">ICS 파일로 내보내기</button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 모달 창: 텍스트 크기 강화 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-t-airbnb-sm sm:rounded-airbnb shadow-airbnb w-full max-w-xl flex flex-col h-[90vh] sm:h-auto mt-auto sm:mt-0 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95">
              <div className="px-12 py-10 border-b border-hairline flex justify-between items-center shrink-0">
                <h3 className="text-3xl font-black tracking-tight text-ink">{editingSub ? '정보 수정' : '새 지출 등록'}</h3>
                <button onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="p-4 bg-canvas rounded-[20px] hover:bg-hairline transition-all"><X size={28} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-12 space-y-10 pb-32 sm:pb-12 bg-white">
                <div className="grid grid-cols-2 gap-8">
                  <div className="col-span-2">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 아파트 관리비" className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-5 text-xl font-black outline-none focus:bg-white focus:border-primary transition-all shadow-inner" />
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">금액</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-5 text-xl font-black outline-none focus:bg-white focus:border-primary shadow-inner" />
                    <label className="flex items-center gap-3 mt-4 cursor-pointer group">
                      <input type="checkbox" name="is_variable" defaultChecked={editingSub?.is_variable} className="w-5 h-5 rounded text-primary" />
                      <span className="text-sm font-black text-gray-500 group-hover:text-primary transition-colors">금액 변동비 체크</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-3">통화 단위</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-5 font-black text-lg outline-none bg-white shadow-inner"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>
                  
                  <div className="col-span-2 border-t border-hairline pt-6">
                    <label className="block text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-5">납부 주기 및 유형</label>
                    <div className="grid grid-cols-2 gap-5 mb-5">
                      <button type="button" onClick={() => setModalBillingCycle('monthly')} className={cn("py-4 rounded-2xl border-2 font-black text-base transition-all", modalBillingCycle === 'monthly' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-hairline text-gray-500")}>매월 결제</button>
                      <button type="button" onClick={() => setModalBillingCycle('yearly')} className={cn("py-4 rounded-2xl border-2 font-black text-base transition-all", modalBillingCycle === 'yearly' ? "border-primary bg-primary/5 text-primary shadow-sm" : "border-hairline text-gray-500")}>매년 결제</button>
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <label className={cn("flex flex-col p-5 rounded-[24px] border-2 transition-all cursor-pointer", (editingSub?.payment_type === 'auto' || !editingSub) ? "border-primary bg-primary/5 shadow-sm" : "border-hairline hover:border-gray-300")}>
                        <div className="flex items-center gap-3 font-black text-base"><input type="radio" name="payment_type" value="auto" defaultChecked={editingSub?.payment_type === 'auto' || !editingSub} className="w-4 h-4 text-primary" /> 자동 납부</div>
                        <span className="text-[11px] text-gray-400 mt-1.5 font-bold">은행/카드 자동이체</span>
                      </label>
                      <label className={cn("flex flex-col p-5 rounded-[24px] border-2 transition-all cursor-pointer", editingSub?.payment_type === 'manual' ? "border-red-500 bg-red-50 shadow-sm" : "border-hairline hover:border-gray-300")}>
                        <div className="flex items-center gap-3 font-black text-base"><input type="radio" name="payment_type" value="manual" defaultChecked={editingSub?.payment_type === 'manual'} className="w-4 h-4 text-red-500" /> 직접 납부</div>
                        <span className="text-[11px] text-gray-400 mt-1.5 font-bold">계좌이체/지로/카드결제</span>
                      </label>
                    </div>
                  </div>

                  {modalBillingCycle === 'yearly' && (
                    <div className="col-span-2 grid grid-cols-2 gap-5 animate-in fade-in slide-in-from-top-2">
                      <div>
                        <label className="block text-xs font-black text-gray-400 uppercase mb-3">연간 처리 방식</label>
                        <select name="annual_type" defaultValue={editingSub?.annual_type || 'split'} className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-4 font-black bg-white shadow-inner"><option value="split">12개월 분할</option><option value="single">일시불 (당월)</option></select>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-400 uppercase mb-3">결제 월</label>
                        <select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-4 font-black bg-white shadow-inner">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                      </div>
                    </div>
                  )}

                  <div className="col-span-2 grid grid-cols-2 gap-5">
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}>
                      <label className="block text-xs font-black text-gray-400 uppercase mb-3">결제 일 (1~31)</label>
                      <select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-4 font-black bg-white shadow-inner">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase mb-3">카테고리 분류</label>
                      <select name="category" defaultValue={editingSub?.category || '디지털 구독'} className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-4 font-black bg-white shadow-inner">{CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-gray-400 uppercase mb-3">결제 수단 명칭</label>
                      <input name="payment_method" defaultValue={editingSub?.payment_method} type="text" placeholder="예: 신한카드 1234" className="w-full bg-canvas border border-hairline rounded-[20px] px-6 py-4 font-black shadow-inner" />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-black text-gray-400 uppercase mb-3">메모 및 참고사항</label>
                    <textarea name="memo" defaultValue={editingSub?.memo || ''} rows={4} placeholder="여기에 메모를 남겨주세요..." className="w-full bg-canvas border border-hairline rounded-[24px] px-6 py-5 text-base font-medium outline-none focus:bg-white focus:border-primary transition-all resize-none shadow-inner leading-relaxed" />
                  </div>
                </div>

                <div className="fixed sm:static bottom-0 left-0 right-0 p-10 sm:p-0 bg-white sm:bg-transparent border-t border-hairline sm:border-none flex flex-col sm:flex-row gap-5 mt-10">
                  <button type="button" onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="order-2 sm:order-1 flex-1 py-6 font-black text-gray-500 hover:bg-canvas rounded-[24px] transition-all text-lg">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] bg-primary text-white py-6 rounded-[24px] font-black text-2xl hover:bg-primary-dark shadow-xl flex items-center justify-center gap-4 active:scale-95 transition-all shadow-primary/20">
                    {isSubmitting && <Loader2 className="animate-spin" size={28} />}
                    {editingSub ? '수정 완료' : '지출 등록'}
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
