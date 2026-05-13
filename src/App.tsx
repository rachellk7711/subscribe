// UI Polish: Table Header Shading, Larger Titles, Permanent Action Buttons, and Compact D-Day Layout
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
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus
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
      backgroundColor: monthlyExpenditureData.map((_, i) => i + 1 === currentMonthNum ? '#ff385c' : '#e5e5e5'),
      borderRadius: 6,
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
      backgroundColor: ['#ff385c', '#222222', '#717171', '#ffb6c1', '#c1c1c1', '#dddddd'],
      borderWidth: 0
    }]
  }), [subscriptions, exchangeRate]);

  return (
    <div className="flex h-screen bg-canvas text-[#222222] font-sans overflow-hidden">
      {/* PC 사이드바 */}
      <aside className="hidden lg:flex flex-col w-72 bg-white border-r border-hairline shrink-0 h-full z-50 shadow-sm">
        <div className="p-8 shrink-0">
          <h1 className="text-xl font-black text-primary tracking-tight flex items-center gap-2 mb-1">
            <LayoutDashboard size={24} /> 구독/고정비 관리
          </h1>
          <p className="text-[10px] text-[#717171] font-bold uppercase tracking-widest">Household Manager</p>
        </div>
        <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto">
          {['전체', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)} className={cn("w-full flex items-center justify-between px-5 py-2 rounded-xl text-sm font-bold transition-all text-left", activeTab === cat ? "bg-primary text-white shadow-md" : "text-[#484848] hover:bg-canvas")}>
              <span className="flex items-center gap-3">{cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}{cat}</span>
              {activeTab === cat && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-hairline bg-white shrink-0">
          <div className="flex items-center gap-3 p-4 bg-canvas rounded-2xl border border-hairline">
            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-black shadow-sm">A</div>
            <div><p className="text-xs font-black">MASTER</p><p className="text-[10px] text-[#717171] font-bold">Household Pro</p></div>
          </div>
        </div>
      </aside>

      {/* 모바일 사이드바 */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col shadow-airbnb animate-in slide-in-from-left duration-300">
            <div className="p-8 flex justify-between items-center border-b border-hairline shrink-0">
              <h1 className="text-xl font-black text-primary">메뉴</h1>
              <button onClick={() => setIsMobileMenuOpen(false)} className="p-2"><X size={24} /></button>
            </div>
            <div className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {['전체', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => { setActiveTab(cat); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-5 py-3 rounded-xl font-bold", activeTab === cat ? "bg-primary text-white shadow-md" : "text-[#484848] hover:bg-canvas")}>
                  {cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}{cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-canvas overflow-hidden">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-hairline flex items-center justify-between px-6 lg:px-10 shrink-0 z-40 sticky top-0">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-2.5 bg-white border border-hairline rounded-xl shadow-sm" onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#717171]" size={18} />
              <input type="text" placeholder="항목 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-3 bg-canvas border border-hairline rounded-full text-sm focus:bg-white focus:border-primary outline-none transition-all shadow-inner font-medium" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-8 pb-32">
          {/* 대시보드 상단 헤더 */}
          <div className="flex items-center gap-5">
            <div className="p-4 bg-primary text-white rounded-2xl shadow-lg shadow-primary/20 hidden sm:block">
              <BarChart3 size={28} />
            </div>
            <div>
              <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-[#222222]">통합 고정비 대시보드</h2>
              <div className="flex items-center gap-3 text-[#717171] font-bold mt-1.5 text-xs">
                <Clock size={14} className="text-primary" />
                <span>{todayStr}</span>
                <span className="mx-1 opacity-30">|</span>
                <p>총 {filteredSubs.length}건 관리 중</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* 총 지출액 카드: 컴팩트 레이아웃 (숫자 크기 축소 및 여백 압축) */}
            <div className="lg:col-span-12 bg-white border border-hairline rounded-airbnb p-6 lg:p-8 shadow-sm relative overflow-hidden group flex flex-col lg:flex-row justify-between items-center">
              <div className="absolute top-0 right-0 w-80 h-80 bg-primary/5 rounded-full -mr-24 -mt-24 blur-3xl pointer-events-none" />
              
              {/* 좌측: 총 금액 영역 (크기 축소) */}
              <div className="z-10 flex flex-col items-center lg:items-start mb-6 lg:mb-0">
                <p className="text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">Total Monthly Expenditure</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl lg:text-5xl font-black tabular-nums tracking-tighter text-[#222222]">₩{Math.round(currentMonthTotal).toLocaleString()}</span>
                  <span className="text-lg lg:text-xl text-[#717171] font-bold">/ MO</span>
                </div>
              </div>

              {/* 우측: 세로 정렬된 지표 박스들 (간격 압축) */}
              <div className="z-10 flex flex-col gap-2 w-full lg:w-[280px]">
                <div className="flex items-center gap-3 px-4 py-2 bg-canvas border border-hairline rounded-xl">
                  {diff > 0 ? <TrendingUp className="text-primary" size={16} /> : (diff < 0 ? <TrendingDown className="text-green-600" size={16} /> : <Minus className="text-[#717171]" size={16} />)}
                  <span className={cn("text-xs font-black", diff > 0 ? "text-primary" : (diff < 0 ? "text-green-600" : "text-[#717171]"))}>
                    전월 대비 {Math.abs(diffPercent)}% {diff > 0 ? '증가' : (diff < 0 ? '감소' : '동일')}
                  </span>
                </div>
                <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border border-primary/10 rounded-xl">
                  <div className="flex-1 h-1.5 bg-hairline rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%` }} />
                  </div>
                  <span className="text-[10px] font-black text-primary uppercase tracking-tight">납부 {Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</span>
                </div>
                <div className="flex items-center justify-between px-4 py-2 bg-canvas border border-hairline rounded-xl">
                  <span className="text-[9px] font-black text-[#717171] uppercase tracking-wider">USD Exchange</span>
                  <span className="text-xs font-black text-[#222222]">₩{Math.round(exchangeRate).toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* 시각화 분석 영역 */}
            <div className="lg:col-span-8 bg-white border border-hairline rounded-airbnb p-10 shadow-sm min-h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-10">
                <h3 className="font-black text-xl text-[#222222] tracking-tight">12개월 지출 추이</h3>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-[11px] font-black text-[#717171]">
                    <div className="w-3.5 h-3.5 bg-primary rounded-[4px]" /> <span>현재 달</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-black text-[#717171]">
                    <div className="w-3.5 h-3.5 bg-[#e5e5e5] rounded-[4px]" /> <span>예측 월</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 w-full">
                <Bar 
                  key={`chart-${monthlyExpenditureData.join('-')}`}
                  data={barChartData} 
                  options={{ 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { 
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#222222',
                        padding: 14,
                        cornerRadius: 12,
                        titleFont: { weight: 'bold', size: 15 },
                        bodyFont: { weight: 'bold', size: 14 },
                        callbacks: {
                          label: (context) => `지출액: ₩${Math.round(context.raw as number).toLocaleString()}`
                        }
                      }
                    },
                    scales: {
                      y: { beginAtZero: true, grid: { display: false }, ticks: { display: false } },
                      x: { grid: { display: false }, ticks: { font: { weight: 'bold', size: 12 }, color: '#717171', padding: 10 } }
                    }
                  }} 
                />
              </div>
            </div>

            <div className="lg:col-span-4 bg-white border border-hairline rounded-airbnb p-10 shadow-sm min-h-[420px] flex flex-col">
              <div className="flex justify-between items-center mb-10">
                <h3 className="font-black text-xl text-[#222222] tracking-tight">지출 성격별 분석</h3>
              </div>
              <div className="flex-1 flex flex-col items-center">
                <div className="w-48 h-48 relative mb-10 mt-2">
                  <Pie data={pieChartData} options={{ cutout: '80%', plugins: { legend: { display: false } } }} />
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 w-full px-2">
                  {CATEGORIES.map((cat, i) => (
                    <div key={cat} className="flex items-center gap-3 text-[11px] font-black text-[#717171] hover:text-[#222222] transition-all group">
                      <div className="w-3.5 h-3.5 rounded-[4px] shrink-0 group-hover:scale-110 transition-transform" style={{ backgroundColor: pieChartData.datasets[0].backgroundColor[i] }} />
                      <span className="truncate">{cat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* 테이블 영역: 타이틀 크기를 상단 지출액 수준으로 축소 및 간격 최적화 */}
          <div className="space-y-6 pt-4">
            <div className="flex justify-between items-end border-b border-hairline pb-4 px-2">
              <div>
                <h3 className="font-black text-2xl lg:text-3xl text-[#222222] tracking-tight">지출 상세 내역</h3>
                <p className="text-[11px] font-bold text-[#717171] mt-1.5 flex items-center gap-2">
                  <div className="w-1 h-1 bg-primary rounded-full animate-pulse" /> 결제일 임박순 자동 정렬 시스템
                </p>
              </div>
              <button onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setHasEndDate(false); setIsModalOpen(true); }} className="bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg hover:bg-primary-dark transition-all active:scale-95 flex items-center gap-2 shadow-primary/25">
                <Plus size={18} /> 지출 항목 추가
              </button>
            </div>
            
            <div className="bg-white border border-hairline rounded-airbnb shadow-sm overflow-hidden mb-20">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  {/* 헤더 부분 핑크 음영 적용 */}
                  <thead className="bg-primary/[0.03] text-[#717171] font-black text-[11px] uppercase tracking-[0.15em] border-b border-hairline">
                    <tr>
                      <th className="px-8 py-5 w-24 text-center">납부</th>
                      <th className="px-8 py-5">지출 항목</th>
                      <th className="px-8 py-5">금액</th>
                      <th className="px-8 py-5">결제예정일</th>
                      <th className="px-8 py-5">구독 기간</th>
                      <th className="px-8 py-5">메모</th>
                      <th className="px-8 py-5 text-right">관리</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
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
                        <tr key={sub.id} className={cn("group transition-colors", isManualUnpaid ? "bg-red-50/50" : "hover:bg-canvas/50")}>
                          <td className="px-8 py-4 text-center">
                            <button onClick={() => togglePaidStatus(sub)} className={cn("transition-all active:scale-90", sub.is_paid ? "text-green-600" : "text-hairline hover:text-[#717171]")}>
                              {sub.is_paid ? <CheckCircle2 size={30} /> : <Circle size={30} />}
                            </button>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col">
                              <span className="font-black text-xl text-[#222222] flex items-center gap-2 tracking-tight">
                                {sub.service_name}
                                {sub.is_variable && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md font-black shadow-sm">변동</span>}
                              </span>
                              <span className="text-[12px] text-[#717171] font-bold mt-1">{sub.category}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4 font-black text-xl text-[#222222] tabular-nums tracking-tight">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</td>
                          <td className="px-8 py-4">
                            {/* D-Day를 날짜 좌측으로 이동하여 한 줄로 표시 */}
                            <div className="flex items-center gap-3">
                              <div className={cn("text-[10px] font-black px-2.5 py-1 rounded-full shadow-sm border shrink-0", days <= 3 ? "bg-primary text-white border-primary" : "bg-canvas text-[#717171] border-hairline")}>D-{days === 0 ? 'Day' : days}</div>
                              <span className="text-[17px] font-black text-[#222222] whitespace-nowrap">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="text-[11px] font-black text-[#484848]">{sub.started_at ? `${sub.started_at.slice(2)} ~` : '시작일 미입력'}</span>
                              <span className="text-[11px] font-bold text-[#717171]">{sub.ended_at ? `${sub.ended_at.slice(2)} 종료` : '계속 구독 중'}</span>
                            </div>
                          </td>
                          <td className="px-8 py-4">
                            <span className="text-[13px] text-[#484848] font-bold line-clamp-2 max-w-[240px] leading-relaxed italic opacity-80">{sub.memo || '-'}</span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            {/* 관리 버튼 항상 표시 */}
                            <div className="flex justify-end gap-3 scale-95 origin-right">
                              <button onClick={() => { setEditingSub(sub); setModalBillingCycle(sub.billing_cycle); setHasEndDate(!!sub.ended_at); setIsModalOpen(true); }} className="p-2 bg-white border border-hairline rounded-xl hover:shadow-lg transition-all text-[#484848] shadow-sm"><Edit2 size={18} /></button>
                              <button onClick={async () => { if(window.confirm('정말 삭제할까요?')) { await supabase.from('subscriptions').delete().eq('id', sub.id); fetchSubscriptions(); } }} className="p-2 bg-white border border-hairline rounded-xl hover:bg-red-50 text-red-600 transition-all shadow-sm"><Trash2 size={18} /></button>
                              <div className="relative">
                                <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-2 bg-white border border-hairline rounded-xl hover:bg-primary hover:text-white transition-all shadow-sm"><CalendarIcon size={18} /></button>
                                {calendarMenuId === sub.id && (
                                  <div className="absolute right-0 mt-3 w-60 bg-white border border-hairline rounded-2xl shadow-airbnb z-[100] overflow-hidden text-left animate-in fade-in zoom-in-95">
                                    <a href={getNaverCalendarLink(sub)} target="_blank" rel="noreferrer" className="block px-7 py-4 text-[13px] font-black text-green-600 hover:bg-green-50 border-b border-hairline transition-colors">네이버 캘린더 등록</a>
                                    <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noreferrer" className="block px-7 py-4 text-[13px] font-black text-blue-600 hover:bg-blue-50 border-b border-hairline transition-colors">구글 캘린더 등록</a>
                                    <button onClick={() => { downloadICS(sub); setCalendarMenuId(null); }} className="w-full text-left px-7 py-4 text-[13px] font-black text-[#222222] hover:bg-canvas transition-colors">ICS 파일 내보내기</button>
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
        </div>

        {/* 모달 창 */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-white rounded-t-airbnb-sm sm:rounded-airbnb shadow-airbnb w-full max-w-lg flex flex-col h-[90vh] sm:h-auto mt-auto sm:mt-0 overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95">
              <div className="px-8 py-6 border-b border-hairline flex justify-between items-center shrink-0">
                <h3 className="text-xl font-black tracking-tight text-[#222222]">{editingSub ? '정보 수정' : '새 지출 등록'}</h3>
                <button onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="p-2 bg-canvas rounded-xl hover:bg-hairline transition-all"><X size={20} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6 pb-32 sm:pb-10 bg-white">
                <div className="grid grid-cols-2 gap-5">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 아파트 관리비" className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 text-base font-black outline-none focus:bg-white focus:border-primary transition-all shadow-inner" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">금액</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 text-base font-black outline-none focus:bg-white focus:border-primary shadow-inner" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 font-black text-sm outline-none bg-white shadow-inner"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">구독 시작일</label>
                      <input name="started_at" defaultValue={editingSub?.started_at || todayDate.toISOString().split('T')[0]} type="date" className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 font-bold text-sm shadow-inner" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">구독 종료일</label>
                      <div className="flex flex-col gap-2">
                        <input disabled={!hasEndDate} name="ended_at" defaultValue={editingSub?.ended_at || ''} type="date" className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 font-bold text-sm shadow-inner disabled:opacity-30" />
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!hasEndDate} onChange={(e) => setHasEndDate(!e.target.checked)} className="w-4 h-4 rounded text-primary" />
                          <span className="text-[11px] font-bold text-[#717171]">종료일 없음</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  
                  <div className="col-span-2 border-t border-hairline pt-4">
                    <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-3">납부 주기 및 유형</label>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <button type="button" onClick={() => setModalBillingCycle('monthly')} className={cn("py-2.5 rounded-xl border-2 font-black text-sm transition-all", modalBillingCycle === 'monthly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-[#717171]")}>매월</button>
                      <button type="button" onClick={() => setModalBillingCycle('yearly')} className={cn("py-2.5 rounded-xl border-2 font-black text-sm transition-all", modalBillingCycle === 'yearly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-[#717171]")}>매년</button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", (editingSub?.payment_type === 'auto' || !editingSub) ? "border-primary bg-primary/5 shadow-sm" : "border-hairline hover:border-gray-300")}>
                        <div className="flex items-center gap-2 font-black text-xs"><input type="radio" name="payment_type" value="auto" defaultChecked={editingSub?.payment_type === 'auto' || !editingSub} className="text-primary" /> 자동 납부</div>
                      </label>
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", editingSub?.payment_type === 'manual' ? "border-red-500 bg-red-50 shadow-sm" : "border-hairline hover:border-gray-300")}>
                        <div className="flex items-center gap-2 font-black text-xs"><input type="radio" name="payment_type" value="manual" defaultChecked={editingSub?.payment_type === 'manual'} className="text-red-500" /> 직접 납부</div>
                      </label>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    {modalBillingCycle === 'yearly' && (
                      <div className="animate-in fade-in slide-in-from-top-1">
                        <label className="block text-[10px] font-black text-[#717171] mb-2">결제 월</label>
                        <select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full bg-canvas border border-hairline rounded-xl px-4 py-2.5 font-black bg-white shadow-inner">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select>
                      </div>
                    )}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}>
                      <label className="block text-[10px] font-black text-[#717171] mb-2">결제 일</label>
                      <select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full bg-canvas border border-hairline rounded-xl px-4 py-2.5 font-black bg-white shadow-inner">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select>
                    </div>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">카테고리</label>
                      <select name="category" defaultValue={editingSub?.category || '디지털 구독'} className="w-full bg-canvas border border-hairline rounded-xl px-4 py-2.5 font-black bg-white shadow-inner">
                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">결제 수단 명칭</label>
                      <input required name="payment_method" defaultValue={editingSub?.payment_method} type="text" placeholder="예: 신한카드 1234" className="w-full bg-canvas border border-hairline rounded-xl px-4 py-2.5 text-sm font-black outline-none focus:bg-white focus:border-primary shadow-inner" />
                    </div>
                  </div>

                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-[#717171] uppercase tracking-widest mb-2">메모</label>
                    <textarea name="memo" defaultValue={editingSub?.memo || ''} rows={2} placeholder="추가 정보를 입력하세요..." className="w-full bg-canvas border border-hairline rounded-xl px-4 py-3 text-sm font-medium outline-none focus:bg-white focus:border-primary transition-all resize-none shadow-inner leading-relaxed" />
                  </div>
                </div>

                <div className="fixed sm:static bottom-0 left-0 right-0 p-8 sm:p-0 bg-white sm:bg-transparent border-t border-hairline sm:border-none flex flex-col sm:flex-row gap-3 mt-6">
                  <button type="button" onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="order-2 sm:order-1 flex-1 py-3.5 font-black text-[#717171] hover:bg-canvas rounded-xl transition-all text-sm">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] bg-primary text-white py-3.5 rounded-xl font-black text-base hover:bg-primary-dark shadow-md flex items-center justify-center gap-2 active:scale-95 transition-all shadow-primary/20">
                    {isSubmitting && <Loader2 className="animate-spin" size={18} />}
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
