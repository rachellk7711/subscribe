// Deployment Trigger: Airbnb Style + Calendar Support (Enhanced Mobile Responsive)
import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  PieChart as PieChartIcon, 
  Bell,
  Search,
  X,
  Loader2,
  Trash2,
  Edit2,
  Calendar,
  Menu
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase, type Subscription } from './lib/supabase';
import { downloadICS } from './utils/icsGenerator';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

ChartJS.register(ArcElement, Tooltip, Legend);

const getDaysRemaining = (billingDate: number) => {
  const today = new Date();
  const currentDay = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  
  if (billingDate >= currentDay) {
    return billingDate - currentDay;
  } else {
    return daysInMonth - currentDay + billingDate;
  }
};

function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalBillingCycle, setModalBillingCycle] = useState<'monthly'|'yearly'>('monthly');
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1350);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

    if (error) console.error('Error fetching subscriptions:', error);
    else setSubscriptions(data as Subscription[]);
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
    if (error) {
      alert('데이터 처리 중 오류가 발생했습니다.');
    } else {
      setIsModalOpen(false);
      setEditingSub(null);
      fetchSubscriptions();
    }
  };

  const handleEditSubscription = (sub: Subscription) => {
    setEditingSub(sub);
    setModalBillingCycle(sub.billing_cycle);
    setIsModalOpen(true);
  };

  const handleDeleteSubscription = async (id: string) => {
    if (!window.confirm('정말로 이 구독을 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
    if (error) alert('삭제 중 오류가 발생했습니다.');
    else fetchSubscriptions();
  };

  const totalMonthlyKRW = subscriptions.reduce((acc, sub) => {
    let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
    return acc + (sub.billing_cycle === 'yearly' ? amountKRW / 12 : amountKRW);
  }, 0);

  const totalFamilyKRW = subscriptions.filter(s => s.user_type === 'family').reduce((acc, sub) => {
    let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
    return acc + (sub.billing_cycle === 'yearly' ? amountKRW / 12 : amountKRW);
  }, 0);

  const totalPersonalKRW = totalMonthlyKRW - totalFamilyKRW;

  const categoryTotals: Record<string, number> = {};
  subscriptions.forEach(s => {
    const val = (s.currency === 'USD' ? s.amount * exchangeRate : s.amount) / (s.billing_cycle === 'yearly' ? 12 : 1);
    categoryTotals[s.category] = (categoryTotals[s.category] || 0) + val;
  });

  const chartData = {
    labels: Object.keys(categoryTotals),
    datasets: [{ data: Object.values(categoryTotals), backgroundColor: ['#ff385c', '#222222', '#717171', '#ffb6c1', '#f7f7f7'] }]
  };

  const filteredSubs = subscriptions.filter(sub => 
    sub.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sub.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (sub.memo && sub.memo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="flex h-screen bg-canvas text-ink font-sans overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-[60] bg-ink/60 lg:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Hidden by default on mobile, fixed on desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 bg-canvas border-r border-hairline flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-2xl font-bold text-primary tracking-tight">구독 관리</h1>
            <p className="text-[11px] text-muted font-medium uppercase tracking-widest mt-1">Subscription Manager</p>
          </div>
          <button className="lg:hidden p-2 hover:bg-surface-soft rounded-full transition-colors" onClick={() => setIsSidebarOpen(false)}>
            <X size={24} />
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2 overflow-y-auto">
          <a href="#" className="flex items-center gap-3 px-4 py-4 bg-surface-soft text-ink rounded-xl font-bold text-[15px] shadow-sm">
            <LayoutDashboard size={22} className="text-primary" /> 대시보드
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-4 text-muted hover:bg-surface-soft hover:text-ink rounded-xl font-medium text-[15px] transition-all group">
            <CreditCard size={22} className="group-hover:text-primary transition-colors" /> 구독 관리
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-4 text-muted hover:bg-surface-soft hover:text-ink rounded-xl font-medium text-[15px] transition-all group">
            <PieChartIcon size={22} className="group-hover:text-primary transition-colors" /> 소비 분석
          </a>
        </nav>
        <div className="p-6 border-t border-hairline bg-canvas shrink-0">
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-surface-soft border border-hairline cursor-pointer transition-all hover:shadow-md">
            <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center text-xl font-bold shrink-0 shadow-airbnb">A</div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-ink">안티그래비티</p>
              <p className="text-xs text-muted font-medium truncate">Premium User</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-canvas relative h-full">
        {/* Header */}
        <header className="h-20 border-b border-hairline bg-canvas/80 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button 
              className="lg:hidden p-3 -ml-2 bg-surface-soft hover:bg-surface-strong rounded-xl transition-all shadow-sm"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu size={24} className="text-ink" />
            </button>
            <div className="relative flex-1 max-w-xl group">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-airbnb pointer-events-none">
                <Search size={16} />
              </div>
              <input 
                type="text" 
                placeholder="어떤 구독을 찾으시나요?" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-14 pr-6 py-3.5 bg-canvas border border-hairline rounded-full text-[15px] shadow-airbnb transition-all outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-6 ml-6">
            <button className="p-3 text-muted hover:bg-surface-soft rounded-full transition-all relative">
              <Bell size={24} />
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-primary rounded-full border-2 border-canvas"></span>
            </button>
            <div className="w-11 h-11 rounded-full border-2 border-hairline p-0.5 shadow-sm">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" className="rounded-full bg-surface-soft" />
            </div>
          </div>
        </header>

        {/* Dashboard Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 lg:p-10 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black text-ink tracking-tight">구독 관리 대시보드</h2>
              <p className="text-muted text-[16px] lg:text-[18px] font-medium mt-2">사용자님의 {subscriptions.length}개 서비스를 보호하고 있어요.</p>
            </div>
            <button 
              onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }}
              className="w-full sm:w-auto px-10 py-4 bg-primary text-white rounded-2xl font-black text-[17px] hover:bg-primary-active transition-all shadow-airbnb active:scale-95 flex items-center justify-center gap-2"
            >
              + 새 구독 추가
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-canvas rounded-[32px] border border-hairline p-8 lg:p-12 shadow-airbnb relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-20 -mt-20 blur-3xl transition-all group-hover:bg-primary/10" />
              <p className="text-[14px] lg:text-[15px] font-black text-muted uppercase tracking-[0.2em] mb-6">Estimated Monthly Spend</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl lg:text-7xl font-black text-ink tabular-nums tracking-tighter">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-xl lg:text-2xl text-muted font-bold">/ mo</span>
              </div>
              <div className="mt-8 flex items-center gap-3">
                <div className="bg-surface-soft border border-hairline px-4 py-2 rounded-full flex items-center gap-2 shadow-sm">
                  <span className="text-primary text-lg">💱</span>
                  <span className="text-[13px] lg:text-[14px] font-bold text-ink">환율: 1$ = {Math.round(exchangeRate).toLocaleString()}원</span>
                </div>
              </div>
              <div className="mt-12 grid grid-cols-2 gap-8 border-t border-hairline pt-8">
                <div className="flex flex-col border-r border-hairline pr-8"><span className="text-[13px] text-muted mb-2 font-black uppercase tracking-widest">Family Plan</span><span className="text-2xl font-black text-ink">₩{Math.round(totalFamilyKRW).toLocaleString()}</span></div>
                <div className="flex flex-col"><span className="text-[13px] text-muted mb-2 font-black uppercase tracking-widest">Personal</span><span className="text-2xl font-black text-ink">₩{Math.round(totalPersonalKRW).toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-canvas rounded-[32px] border border-hairline p-8 lg:p-10 shadow-airbnb flex flex-col items-center justify-center min-h-[350px]">
              <div className="w-44 h-44 lg:w-56 lg:h-56 relative">
                <Pie data={chartData} options={{ cutout: '75%', plugins: { legend: { display: false } } }} />
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[13px] font-black text-muted uppercase tracking-widest">Categories</span>
                </div>
              </div>
              <p className="text-[16px] text-ink mt-8 font-black tracking-tight">구독 소비 분포</p>
            </div>
          </div>

          <div className="bg-canvas border border-hairline rounded-[32px] shadow-airbnb overflow-hidden pb-10">
            <div className="px-8 lg:px-12 py-8 lg:py-10 border-b border-hairline">
              <h3 className="font-black text-ink text-2xl lg:text-3xl tracking-tight">구독 목록 및 일정</h3>
            </div>
            
            {/* Desktop Table - Hidden on Mobile */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-soft text-muted font-black border-b border-hairline">
                  <tr>
                    <th className="px-12 py-6 uppercase tracking-[0.2em] text-[11px]">서비스</th>
                    <th className="px-12 py-6 uppercase tracking-[0.2em] text-[11px]">지출</th>
                    <th className="px-12 py-6 uppercase tracking-[0.2em] text-[11px]">결제일</th>
                    <th className="px-12 py-6 uppercase tracking-[0.2em] text-[11px]">상태</th>
                    <th className="px-12 py-6 uppercase tracking-[0.2em] text-[11px] text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredSubs.map((sub) => {
                    const daysRemaining = getDaysRemaining(sub.billing_date);
                    const isUrgent = daysRemaining <= 3;
                    return (
                      <tr key={sub.id} className="hover:bg-surface-soft transition-all group">
                        <td className="px-12 py-8">
                          <div className="flex flex-col">
                            <span className="font-black text-ink text-[18px]">{sub.service_name}</span>
                            <span className="text-[13px] text-muted font-bold mt-0.5">{sub.category}</span>
                          </div>
                        </td>
                        <td className="px-12 py-8">
                          <div className="flex flex-col">
                            <span className="font-black text-ink text-[18px]">{sub.currency === 'USD' ? '$' : '₩'}{sub.amount.toLocaleString()}</span>
                            <span className={cn("text-[11px] font-black uppercase px-2 py-0.5 rounded-md w-fit mt-1.5", sub.billing_cycle === 'yearly' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700')}>
                              {sub.billing_cycle}
                            </span>
                          </div>
                        </td>
                        <td className="px-12 py-8 font-black text-ink">
                          {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}
                        </td>
                        <td className="px-12 py-8">
                          <div className={cn("flex items-center gap-2.5 px-4 py-2 rounded-full w-fit font-black text-[13px] shadow-sm", isUrgent ? "bg-primary/10 text-primary border border-primary/20" : "bg-surface-strong text-ink border border-hairline")}>
                            <div className={cn("w-2 h-2 rounded-full", isUrgent ? "bg-primary animate-pulse" : "bg-ink")}></div>
                            {daysRemaining === 0 ? '오늘 결제' : `${daysRemaining}일 남음`}
                          </div>
                        </td>
                        <td className="px-12 py-8 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-0 translate-x-4">
                            <button onClick={() => downloadICS(sub)} className="p-3 bg-white hover:bg-primary hover:text-white rounded-xl shadow-airbnb border border-hairline transition-all" title="캘린더 저장"><Calendar size={20} /></button>
                            <button onClick={() => handleEditSubscription(sub)} className="p-3 bg-white hover:bg-surface-strong rounded-xl shadow-airbnb border border-hairline transition-all"><Edit2 size={20} /></button>
                            <button onClick={() => handleDeleteSubscription(sub.id)} className="p-3 bg-white hover:bg-primary hover:text-white rounded-xl shadow-airbnb border border-hairline transition-all"><Trash2 size={20} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile List View - Completely different for Mobile */}
            <div className="lg:hidden space-y-2 p-4">
              {filteredSubs.map((sub) => {
                const daysRemaining = getDaysRemaining(sub.billing_date);
                const isUrgent = daysRemaining <= 3;
                return (
                  <div key={sub.id} className="bg-surface-soft border border-hairline rounded-[24px] p-6 active:scale-[0.98] transition-all">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col">
                        <span className="text-[12px] font-black text-primary uppercase tracking-[0.2em] mb-1">{sub.category}</span>
                        <h4 className="font-black text-ink text-[20px]">{sub.service_name}</h4>
                      </div>
                      <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full font-black text-[12px] shadow-sm", isUrgent ? "bg-primary text-white" : "bg-white text-ink border border-hairline")}>
                        {daysRemaining === 0 ? 'D-Day' : `D-${daysRemaining}`}
                      </div>
                    </div>
                    <div className="flex justify-between items-end border-t border-hairline pt-6">
                      <div className="flex flex-col">
                        <p className="text-[22px] font-black text-ink tracking-tighter">
                          {sub.currency === 'USD' ? '$' : '₩'}{sub.amount.toLocaleString()}
                        </p>
                        <p className="text-[13px] text-muted font-bold mt-1">
                          {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ` : ''}{sub.billing_date}일 결제
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => downloadICS(sub)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm active:bg-surface-strong"><Calendar size={22} /></button>
                        <button onClick={() => handleEditSubscription(sub)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm active:bg-surface-strong"><Edit2 size={22} /></button>
                        <button onClick={() => handleDeleteSubscription(sub.id)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm active:bg-primary active:text-white"><Trash2 size={22} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {filteredSubs.length === 0 && (
              <div className="py-20 text-center flex flex-col items-center gap-6">
                <div className="w-20 h-20 bg-surface-soft rounded-full flex items-center justify-center text-muted shadow-inner">
                  <Search size={40} />
                </div>
                <p className="text-muted font-black text-xl">검색 결과가 없어요.</p>
              </div>
            )}
          </div>
        </div>

        {/* Improved Modal for Mobile */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-md p-0 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-canvas rounded-t-[32px] sm:rounded-[32px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col h-[90vh] sm:h-auto sm:max-h-[90vh] animate-in slide-in-from-bottom sm:zoom-in-95 duration-400 mt-auto sm:mt-0 border-t border-hairline sm:border-none">
              <div className="px-8 py-6 border-b border-hairline flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-black text-ink">{editingSub ? '구독 정보 수정' : '새로운 구독 추가'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-surface-soft hover:bg-surface-strong rounded-2xl transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-8 pb-32 sm:pb-8">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Service Name</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 넷플릭스, 유튜브" className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none focus:border-primary transition-all bg-surface-soft/30" />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Amount</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none focus:border-primary transition-all bg-surface-soft/30" />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Currency</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'USD'} className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none appearance-none bg-white">
                      <option value="USD">USD ($)</option>
                      <option value="KRW">KRW (₩)</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Billing Cycle</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button 
                        type="button" 
                        onClick={() => setModalBillingCycle('monthly')} 
                        className={cn("py-4 rounded-2xl font-black text-[15px] border-2 transition-all", modalBillingCycle === 'monthly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-muted")}
                      >매월 결제</button>
                      <button 
                        type="button" 
                        onClick={() => setModalBillingCycle('yearly')} 
                        className={cn("py-4 rounded-2xl font-black text-[15px] border-2 transition-all", modalBillingCycle === 'yearly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-muted")}
                      >매년 결제</button>
                      <input type="hidden" name="billing_cycle" value={modalBillingCycle} />
                    </div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    {modalBillingCycle === 'yearly' && (
                      <div>
                        <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Month</label>
                        <select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none bg-white">
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                        </select>
                      </div>
                    )}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}>
                      <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Day</label>
                      <select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none bg-white">
                        {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-black text-muted uppercase tracking-[0.2em] mb-3">Category</label>
                    <select name="category" defaultValue={editingSub?.category || 'Entertainment'} className="w-full border-2 border-hairline rounded-2xl px-5 py-4 text-[17px] font-bold outline-none bg-white">
                      <option value="Entertainment">엔터테인먼트</option>
                      <option value="Productivity">생산성</option>
                      <option value="Finance">금융</option>
                      <option value="Education">교육</option>
                      <option value="Other">기타</option>
                    </select>
                  </div>
                </div>
                <div className="fixed sm:static bottom-0 left-0 right-0 p-6 sm:p-0 bg-canvas sm:bg-transparent border-t border-hairline sm:border-none flex flex-col sm:flex-row gap-4 mt-8">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 flex-1 py-4 font-black text-muted hover:bg-surface-soft rounded-2xl transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] py-4 bg-primary text-white rounded-2xl font-black text-[18px] hover:bg-primary-active shadow-airbnb flex items-center justify-center gap-3">
                    {isSubmitting && <Loader2 className="w-6 h-6 animate-spin" />}
                    {editingSub ? '변경사항 저장' : '구독 추가하기'}
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
