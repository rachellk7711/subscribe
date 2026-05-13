// Build Stability Fix: Removed all unused imports and variables to ensure a clean production build
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
  TrendingUp,
  TrendingDown,
  Plus,
  AlertCircle
} from 'lucide-react';
import { 
  Chart as ChartJS, 
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title 
} from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase, type Subscription } from './lib/supabase';
import { downloadICS, getGoogleCalendarLink, getNaverCalendarLink } from './utils/icsGenerator';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

ChartJS.register(
  ArcElement, 
  Tooltip, 
  Legend, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title
);

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
  const [hasEndDate, setHasEndDate] = useState(false);

  const todayDate = new Date();
  const currentMonthNum = todayDate.getMonth() + 1;
  const todayStr = useMemo(() => {
    return new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
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
      started_at: (formData.get('started_at') as string) || todayDate.toISOString().split('T')[0],
      ended_at: hasEndDate ? (formData.get('ended_at') as string) : null,
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

  const monthlyExpenditureData = useMemo(() => {
    const year = todayDate.getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1;
      const targetMonthStart = `${year}-${String(monthNum).padStart(2, '0')}-01`;
      const targetMonthEnd = `${year}-${String(monthNum).padStart(2, '0')}-${new Date(year, monthNum, 0).getDate()}`;

      return subscriptions.reduce((sum, sub) => {
        const start = sub.started_at || '1900-01-01';
        const end = sub.ended_at || '2999-12-31';
        const isActive = start <= targetMonthEnd && end >= targetMonthStart;
        if (!isActive) return sum;

        let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
        if (sub.billing_cycle === 'monthly') return sum + amountKRW;
        if (sub.billing_cycle === 'yearly') {
          if (sub.annual_type === 'split') return sum + (amountKRW / 12);
          if (sub.billing_month === monthNum) return sum + amountKRW;
        }
        return sum;
      }, 0);
    });
  }, [subscriptions, exchangeRate, todayDate]);

  const currentMonthTotal = monthlyExpenditureData[currentMonthNum - 1];
  const lastMonthTotal = monthlyExpenditureData[(currentMonthNum - 2 + 12) % 12];
  const diff = currentMonthTotal - lastMonthTotal;
  const diffPercent = lastMonthTotal === 0 ? 0 : Math.round((diff / lastMonthTotal) * 100);

  const barChartData = {
    labels: ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'],
    datasets: [{
      label: '월간 지출액',
      data: monthlyExpenditureData,
      backgroundColor: monthlyExpenditureData.map((_, i) => i + 1 === currentMonthNum ? '#ff385c' : '#ebebeb'),
      borderRadius: 4,
      hoverBackgroundColor: '#ff385c',
    }]
  };

  const filteredSubs = useMemo(() => {
    const filtered = subscriptions.filter(sub => 
      (activeTab === '전체' || sub.category === activeTab) && 
      sub.service_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getDaysUntil = (sub: Subscription) => {
      const currentDay = todayDate.getDate();
      if (sub.billing_cycle === 'monthly') {
        let diff = sub.billing_date - currentDay;
        return diff >= 0 ? diff : diff + 31;
      } else {
        const targetDate = new Date(todayDate.getFullYear(), (sub.billing_month || 1) - 1, sub.billing_date);
        if (targetDate < todayDate) targetDate.setFullYear(todayDate.getFullYear() + 1);
        return Math.ceil((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    };
    return [...filtered].sort((a, b) => getDaysUntil(a) - getDaysUntil(b));
  }, [subscriptions, activeTab, searchTerm, todayDate]);

  const pieChartData = useMemo(() => ({
    labels: CATEGORIES,
    datasets: [{
      data: CATEGORIES.map(cat => subscriptions.filter(s => s.category === cat).reduce((sum, s) => sum + (s.currency === 'USD' ? s.amount * exchangeRate : s.amount), 0)),
      backgroundColor: ['#ff385c', '#222222', '#717171', '#ffb6c1', '#ebebeb', '#f7f7f7'],
      borderWidth: 0
    }]
  }), [subscriptions, exchangeRate]);

  return (
    <div className="flex h-screen bg-white text-[#222222] font-sans overflow-hidden">
      {/* PC 사이드바 */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-[#ebebeb] shrink-0 h-full z-50">
        <div className="p-10 shrink-0">
          <h1 className="text-xl font-bold text-primary tracking-tight flex items-center gap-2 mb-1">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-white"><LayoutDashboard size={20} /></div>
            구독 관리
          </h1>
          <p className="text-[10px] text-[#717171] font-medium uppercase tracking-[0.2em] mt-1">Management Pro</p>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {['전체', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)} className={cn("w-full flex items-center justify-between px-5 py-3 rounded-xl text-base font-semibold transition-all text-left", activeTab === cat ? "bg-[#f7f7f7] text-[#222222]" : "text-[#484848] hover:bg-[#f7f7f7]/50")}>
              <span className="flex items-center gap-3">{cat === '전체' ? <Filter size={18} /> : <div className={cn("w-1.5 h-1.5 rounded-full", activeTab === cat ? "bg-primary" : "bg-[#dddddd]")} />}{cat}</span>
              {activeTab === cat && <ChevronRight size={18} className="text-primary" />}
            </button>
          ))}
        </nav>
        <div className="p-8 border-t border-[#ebebeb] shrink-0">
          <div className="flex items-center gap-3 p-4 bg-[#f7f7f7] rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold">A</div>
            <div><p className="text-sm font-bold">MASTER</p><p className="text-[10px] text-[#717171] font-medium">Household Admin</p></div>
          </div>
        </div>
      </aside>

      {/* 모바일 사이드바 */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col shadow-2xl animate-in slide-in-from-left duration-300">
            <div className="p-8 flex justify-between items-center border-b border-[#ebebeb] shrink-0">
              <h1 className="text-xl font-bold text-[#222222]">메뉴</h1>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2"><X size={24} /></button>
            </div>
            <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {['전체', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => { setActiveTab(cat); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-5 py-4 rounded-xl text-base font-semibold", activeTab === cat ? "bg-[#f7f7f7]" : "text-[#484848] hover:bg-[#f7f7f7]")}>
                  {cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-primary" />}{cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-white overflow-hidden">
        <header className="h-20 bg-white border-b border-[#ebebeb] flex items-center justify-between px-6 lg:px-10 shrink-0 z-40">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-2.5 bg-[#f7f7f7] rounded-xl" onClick={() => setIsMobileMenuOpen(true)}><Menu size={20} /></button>
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#717171]" size={16} />
              <input type="text" placeholder="서비스 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-3 bg-[#f7f7f7] rounded-full text-sm focus:bg-white border border-transparent focus:border-[#dddddd] outline-none transition-all font-medium" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-12 pb-32">
          <div className="flex items-center gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-[#222222]">구독 대시보드</h2>
              <div className="flex items-center gap-2 text-[#717171] font-medium mt-1 text-xs">
                <span>{todayStr}</span>
                <span className="opacity-30">•</span>
                <p>{filteredSubs.length}개 항목</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-12 bg-white border border-[#ebebeb] rounded-2xl p-8 shadow-[0_6px_16px_rgba(0,0,0,0.12)] flex flex-col lg:flex-row justify-between items-center">
              <div className="flex flex-col items-center lg:items-start mb-6 lg:mb-0">
                <p className="text-[11px] font-bold text-[#717171] uppercase tracking-wider mb-2">Total Monthly Spend</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl lg:text-5xl font-bold tabular-nums tracking-tight text-[#222222]">₩{Math.round(currentMonthTotal).toLocaleString()}</span>
                  <span className="text-lg text-[#717171] font-medium">/ mo</span>
                </div>
              </div>
              <div className="z-10 flex flex-col gap-3 w-full lg:w-[280px]">
                <div className="flex items-center justify-between px-5 py-3 bg-[#f7f7f7] rounded-xl">
                  <span className="text-xs font-bold text-[#484848]">전월 대비</span>
                  <div className="flex items-center gap-2 font-bold text-sm">
                    {diff > 0 ? <TrendingUp className="text-primary" size={14} /> : <TrendingDown className="text-green-600" size={14} />}
                    <span className={diff > 0 ? "text-primary" : "text-green-600"}>{Math.abs(diffPercent)}%</span>
                  </div>
                </div>
                <div className="flex items-center justify-between px-5 py-3 bg-[#f7f7f7] rounded-xl">
                  <span className="text-xs font-bold text-[#484848]">납부 완료</span>
                  <span className="text-sm font-bold text-primary">{Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-8 bg-white border border-[#ebebeb] rounded-2xl p-8 shadow-sm h-[400px] flex flex-col">
              <h3 className="font-bold text-lg text-[#222222] mb-8">지출 추이</h3>
              <div className="flex-1 w-full">
                <Bar key={`chart-${monthlyExpenditureData.join('-')}`} data={barChartData} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, ticks: { font: { weight: 'bold', size: 12 }, color: '#717171' } } } }} />
              </div>
            </div>

            <div className="lg:col-span-4 bg-white border border-[#ebebeb] rounded-2xl p-8 shadow-sm h-[400px] flex flex-col">
              <h3 className="font-bold text-lg text-[#222222] mb-8">카테고리 분석</h3>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-40 h-40 relative mb-8">
                  <Pie data={pieChartData} options={{ cutout: '85%', plugins: { legend: { display: false } } }} />
                </div>
                <div className="grid grid-cols-2 gap-4 w-full text-[11px] font-bold text-[#717171]">
                  {CATEGORIES.map((cat, i) => (
                    <div key={cat} className="flex items-center gap-2 truncate">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pieChartData.datasets[0].backgroundColor[i] }} />
                      <span className="truncate">{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 pt-4">
            <div className="flex justify-between items-end border-b border-[#ebebeb] pb-6 px-1">
              <div>
                <h3 className="font-bold text-2xl lg:text-3xl text-[#222222] tracking-tight">지출 상세 내역</h3>
                <p className="text-xs font-medium text-[#717171] mt-1.5">임박일 순 자동 정렬 중</p>
              </div>
              <button onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setHasEndDate(false); setIsModalOpen(true); }} className="bg-primary text-white px-6 py-3.5 rounded-lg font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-2">
                <Plus size={18} /> 지출 항목 추가
              </button>
            </div>
            
            <div className="bg-white border border-[#ebebeb] rounded-2xl shadow-sm overflow-hidden mb-20">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-[#fff1f3] text-[#222222] font-bold text-xs border-b border-[#ebebeb]">
                    <tr>
                      <th className="px-8 py-5 w-24 text-center">납부</th>
                      <th className="px-8 py-5">서비스</th>
                      <th className="px-8 py-5">금액</th>
                      <th className="px-8 py-5">결제일</th>
                      <th className="px-8 py-5">기간</th>
                      <th className="px-8 py-5">메모</th>
                      <th className="px-8 py-5 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#ebebeb]">
                    {filteredSubs.map((sub) => {
                      const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                      const getDaysUntil = (sub: Subscription) => {
                        const currentDay = todayDate.getDate();
                        if (sub.billing_cycle === 'monthly') {
                          let diff = sub.billing_date - currentDay;
                          return diff >= 0 ? diff : diff + 31;
                        } else {
                          const targetDate = new Date(todayDate.getFullYear(), (sub.billing_month || 1) - 1, sub.billing_date);
                          if (targetDate < todayDate) targetDate.setFullYear(todayDate.getFullYear() + 1);
                          return Math.ceil((targetDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
                        }
                      };
                      const days = getDaysUntil(sub);
                      
                      return (
                        <tr key={sub.id} className="group transition-colors odd:bg-[#f7f7f7]/50 hover:bg-[#f7f7f7]">
                          <td className="px-8 py-5 text-center">
                            <button onClick={() => togglePaidStatus(sub)} className={cn("transition-all active:scale-90", sub.is_paid ? "text-green-600" : "text-[#dddddd] hover:text-[#717171]")}>
                              {sub.is_paid ? <CheckCircle2 size={26} /> : <Circle size={26} />}
                            </button>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex flex-col">
                              <span className="font-bold text-lg text-[#222222] flex items-center gap-2">
                                {sub.service_name}
                                {sub.is_variable && <span className="text-[9px] bg-[#f7f7f7] border border-[#dddddd] text-[#717171] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">변동</span>}
                                {isManualUnpaid && <span title="직접 납부 필요"><AlertCircle size={14} className="text-primary animate-pulse" /></span>}
                              </span>
                              <span className="text-[11px] text-[#717171] font-medium mt-0.5">{sub.category}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 font-bold text-lg text-[#222222] tabular-nums">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              <div className={cn("text-[10px] font-bold px-2 py-0.5 rounded shadow-sm shrink-0", days <= 3 ? "bg-primary text-white" : "bg-[#f7f7f7] text-[#484848] border border-[#dddddd]")}>D-{days === 0 ? 'Day' : days}</div>
                              <span className="text-base font-bold text-[#222222]">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}/${sub.billing_date}` : `매월 ${sub.billing_date}일`}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-xs font-medium text-[#717171]">
                            {sub.started_at?.slice(2)} ~ {sub.ended_at?.slice(2) || '계속'}
                          </td>
                          <td className="px-8 py-5">
                            <span className="text-xs text-[#717171] font-medium line-clamp-1 max-w-[200px] italic">{sub.memo || '-'}</span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingSub(sub); setModalBillingCycle(sub.billing_cycle); setHasEndDate(!!sub.ended_at); setIsModalOpen(true); }} className="p-2 hover:bg-white rounded-full transition-all text-[#717171] hover:text-[#222222] hover:shadow-sm border border-transparent hover:border-[#ebebeb]"><Edit2 size={16} /></button>
                              <button onClick={async () => { if(window.confirm('삭제하시겠습니까?')) { await supabase.from('subscriptions').delete().eq('id', sub.id); fetchSubscriptions(); } }} className="p-2 hover:bg-white rounded-full transition-all text-[#717171] hover:text-primary hover:shadow-sm border border-transparent hover:border-[#ebebeb]"><Trash2 size={16} /></button>
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-2 hover:bg-white rounded-full transition-all text-[#717171] hover:text-primary hover:shadow-sm border border-transparent hover:border-[#ebebeb]"><CalendarIcon size={16} /></button>
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
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col h-[85vh] sm:h-auto overflow-hidden">
              <div className="px-8 py-6 border-b border-[#ebebeb] flex justify-between items-center shrink-0">
                <h3 className="text-lg font-bold text-[#222222]">{editingSub ? '정보 수정' : '항목 추가'}</h3>
                <button onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="p-2 hover:bg-[#f7f7f7] rounded-full transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 bg-white">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-[#717171] uppercase mb-2">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" className="w-full bg-white border border-[#dddddd] rounded-lg px-4 py-3 text-base font-medium outline-none focus:border-[#222222] transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#717171] uppercase mb-2">금액</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" className="w-full bg-white border border-[#dddddd] rounded-lg px-4 py-3 text-base font-bold outline-none focus:border-[#222222]" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#717171] uppercase mb-2">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full bg-white border border-[#dddddd] rounded-lg px-4 py-3 font-bold text-sm outline-none"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <button type="button" onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="flex-1 py-3.5 font-bold text-[#717171] hover:bg-[#f7f7f7] rounded-lg transition-all text-sm">취소</button>
                  <button type="submit" disabled={isSubmitting} className="flex-[2] bg-primary text-white py-3.5 rounded-lg font-bold text-base hover:bg-[#e00b41] shadow-md flex items-center justify-center gap-2">
                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
                    저장하기
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
