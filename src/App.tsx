// Deployment Trigger: Airbnb Style + Calendar Support (Final Fix)
import { useState, useEffect } from 'react';
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
  ExternalLink
} from 'lucide-react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { supabase, type Subscription } from './lib/supabase';
import { downloadICS, getGoogleCalendarLink } from './utils/icsGenerator';

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
  const [calendarMenuId, setCalendarMenuId] = useState<string | null>(null);

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
        <div className="fixed inset-0 z-[60] bg-ink/60 lg:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-[70] w-72 bg-canvas border-r border-hairline flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:z-auto",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-8 flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-2xl font-black text-primary tracking-tight italic">Antigravity</h1>
            <p className="text-[11px] text-muted font-bold uppercase tracking-widest mt-1">Subscription Tracker</p>
          </div>
          <button className="lg:hidden p-2 hover:bg-surface-soft rounded-full" onClick={() => setIsSidebarOpen(false)}><X size={24} /></button>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <a href="#" className="flex items-center gap-3 px-4 py-4 bg-surface-soft text-ink rounded-2xl font-black text-[15px] shadow-sm"><LayoutDashboard size={22} className="text-primary" /> 대시보드</a>
          <a href="#" className="flex items-center gap-3 px-4 py-4 text-muted hover:bg-surface-soft hover:text-ink rounded-2xl font-bold text-[15px] transition-all"><CreditCard size={22} /> 구독 관리</a>
          <a href="#" className="flex items-center gap-3 px-4 py-4 text-muted hover:bg-surface-soft hover:text-ink rounded-2xl font-bold text-[15px] transition-all"><PieChartIcon size={22} /> 소비 분석</a>
        </nav>
        <div className="p-6 border-t border-hairline">
          <div className="flex items-center gap-3 p-4 rounded-3xl bg-surface-soft border border-hairline">
            <div className="w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center text-xl font-black">A</div>
            <div className="overflow-hidden">
              <p className="text-sm font-black truncate">구독 관리</p>
              <p className="text-xs text-muted font-bold truncate">Premium Mode</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-canvas relative h-full">
        {/* Header */}
        <header className="h-20 border-b border-hairline bg-canvas/80 backdrop-blur-md flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-3 bg-surface-soft rounded-2xl shadow-sm" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
            <div className="relative flex-1 max-w-xl">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-airbnb"><Search size={16} /></div>
              <input type="text" placeholder="서비스 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-14 pr-6 py-3.5 bg-canvas border border-hairline rounded-full text-[15px] shadow-airbnb transition-all outline-none focus:ring-2 focus:ring-primary/20" />
            </div>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-10 pb-24 lg:pb-10">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black text-ink tracking-tight">구독 대시보드</h2>
              <p className="text-muted text-[16px] lg:text-[18px] font-medium mt-2">오늘도 현명한 소비를 이어가세요.</p>
            </div>
            <button onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }} className="w-full sm:w-auto px-10 py-4 bg-primary text-white rounded-2xl font-black text-[17px] shadow-airbnb active:scale-95 transition-all">+ 새 구독 추가</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-canvas rounded-[32px] border border-hairline p-8 lg:p-12 shadow-airbnb">
              <p className="text-[14px] font-black text-muted uppercase tracking-[0.2em] mb-4">Total Monthly Spending</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl lg:text-7xl font-black text-ink tracking-tighter">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-xl lg:text-2xl text-muted font-bold">/ mo</span>
              </div>
              <div className="mt-12 grid grid-cols-2 gap-8 border-t border-hairline pt-8">
                <div className="flex flex-col border-r border-hairline pr-8"><span className="text-[13px] text-muted mb-2 font-black">가족 결제</span><span className="text-2xl font-black text-ink">₩{Math.round(totalFamilyKRW).toLocaleString()}</span></div>
                <div className="flex flex-col"><span className="text-[13px] text-muted mb-2 font-black">개인 결제</span><span className="text-2xl font-black text-ink">₩{Math.round(totalPersonalKRW).toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-canvas rounded-[32px] border border-hairline p-8 lg:p-10 shadow-airbnb flex flex-col items-center justify-center">
              <div className="w-44 h-44 relative"><Pie data={chartData} options={{ cutout: '75%', plugins: { legend: { display: false } } }} /></div>
              <p className="text-[16px] text-ink mt-8 font-black tracking-tight">카테고리 비율</p>
            </div>
          </div>

          <div className="bg-canvas border border-hairline rounded-[32px] shadow-airbnb overflow-hidden">
            <div className="px-8 lg:px-12 py-8 lg:py-10 border-b border-hairline flex justify-between items-center">
              <h3 className="font-black text-ink text-2xl lg:text-3xl tracking-tight">구독 리스트</h3>
            </div>
            
            {/* Cards for Mobile & Table for Desktop */}
            <div className="lg:hidden space-y-4 p-4">
              {filteredSubs.map((sub) => {
                const daysRemaining = getDaysRemaining(sub.billing_date);
                const isUrgent = daysRemaining <= 3;
                return (
                  <div key={sub.id} className="bg-surface-soft border border-hairline rounded-[28px] p-6">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black text-primary uppercase tracking-widest mb-1">{sub.category}</span>
                        <h4 className="font-black text-ink text-[20px]">{sub.service_name}</h4>
                      </div>
                      <div className={cn("px-4 py-2 rounded-full font-black text-[12px] shadow-sm", isUrgent ? "bg-primary text-white" : "bg-white text-ink")}>
                        D-{daysRemaining === 0 ? 'Day' : daysRemaining}
                      </div>
                    </div>
                    <div className="flex justify-between items-end">
                      <div className="flex flex-col">
                        <p className="text-[22px] font-black text-ink">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</p>
                        <p className="text-[13px] text-muted font-bold">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ` : ''}{sub.billing_date}일 결제</p>
                      </div>
                      <div className="flex gap-2 relative">
                        <div className="relative">
                          <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm active:scale-90 transition-all"><Calendar size={22} /></button>
                          {calendarMenuId === sub.id && (
                            <div className="absolute bottom-full right-0 mb-3 w-48 bg-white rounded-2xl shadow-2xl border border-hairline overflow-hidden z-50 animate-in slide-in-from-bottom-2">
                              <button onClick={() => { downloadICS(sub); setCalendarMenuId(null); }} className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-surface-soft transition-colors border-b border-hairline font-bold text-sm"><Download size={18} className="text-primary" /> 네이버/애플 (ICS)</button>
                              <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noopener noreferrer" onClick={() => setCalendarMenuId(null)} className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-surface-soft transition-colors font-bold text-sm text-ink"><ExternalLink size={18} className="text-blue-500" /> 구글 캘린더 등록</a>
                            </div>
                          )}
                        </div>
                        <button onClick={() => handleEditSubscription(sub)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm"><Edit2 size={22} /></button>
                        <button onClick={() => handleDeleteSubscription(sub.id)} className="p-4 bg-white border border-hairline rounded-2xl shadow-sm text-primary"><Trash2 size={22} /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="hidden lg:block">
              <table className="w-full text-left">
                <thead className="bg-surface-soft text-muted font-black border-b border-hairline uppercase text-[11px] tracking-widest">
                  <tr><th className="px-12 py-6">서비스</th><th className="px-12 py-6">지출</th><th className="px-12 py-6">결제일</th><th className="px-12 py-6">상태</th><th className="px-12 py-6 text-right">관리</th></tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {filteredSubs.map((sub) => {
                    const daysRemaining = getDaysRemaining(sub.billing_date);
                    return (
                      <tr key={sub.id} className="hover:bg-surface-soft group transition-all">
                        <td className="px-12 py-8"><span className="font-black text-ink text-lg block">{sub.service_name}</span><span className="text-xs text-muted font-bold">{sub.category}</span></td>
                        <td className="px-12 py-8"><span className="font-black text-ink text-lg block">{sub.currency === 'USD' ? '$' : '₩'}{sub.amount.toLocaleString()}</span><span className="text-[11px] font-black uppercase text-rose-500 bg-rose-50 px-2 py-1 rounded-md">{sub.billing_cycle}</span></td>
                        <td className="px-12 py-8 font-black text-ink">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}</td>
                        <td className="px-12 py-8">
                          <div className={cn("flex items-center gap-2 px-4 py-2 rounded-full font-black text-xs w-fit shadow-sm", daysRemaining <= 3 ? "bg-primary/10 text-primary" : "bg-surface-strong text-ink")}>
                            <div className={cn("w-2 h-2 rounded-full", daysRemaining <= 3 ? "bg-primary animate-pulse" : "bg-ink")}></div>
                            D-{daysRemaining === 0 ? 'Day' : daysRemaining}
                          </div>
                        </td>
                        <td className="px-12 py-8 text-right relative">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all">
                            <div className="relative">
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-3 bg-white hover:bg-primary hover:text-white rounded-xl shadow-airbnb border border-hairline"><Calendar size={18} /></button>
                              {calendarMenuId === sub.id && (
                                <div className="absolute bottom-full right-0 mb-3 w-48 bg-white rounded-2xl shadow-2xl border border-hairline overflow-hidden z-50 animate-in zoom-in-95">
                                  <button onClick={() => { downloadICS(sub); setCalendarMenuId(null); }} className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-surface-soft border-b border-hairline font-bold text-sm text-ink"><Download size={16} className="text-primary" /> ICS 파일 다운로드</button>
                                  <a href={getGoogleCalendarLink(sub)} target="_blank" rel="noopener noreferrer" onClick={() => setCalendarMenuId(null)} className="w-full px-5 py-4 text-left flex items-center gap-3 hover:bg-surface-soft font-bold text-sm text-ink"><ExternalLink size={16} className="text-blue-500" /> 구글 캘린더 등록</a>
                                </div>
                              )}
                            </div>
                            <button onClick={() => handleEditSubscription(sub)} className="p-3 bg-white hover:bg-surface-strong rounded-xl shadow-airbnb border border-hairline"><Edit2 size={18} /></button>
                            <button onClick={() => handleDeleteSubscription(sub.id)} className="p-3 bg-white hover:bg-primary hover:text-white rounded-xl shadow-airbnb border border-hairline"><Trash2 size={18} /></button>
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

        {/* Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/60 backdrop-blur-md p-0 sm:p-6">
            <div className="bg-canvas rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-xl flex flex-col h-[90vh] sm:h-auto animate-in slide-in-from-bottom sm:zoom-in-95 mt-auto sm:mt-0">
              <div className="px-10 py-8 border-b border-hairline flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-black text-ink">{editingSub ? '수정하기' : '새 구독 추가'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-3 bg-surface-soft rounded-2xl"><X size={24} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-8 pb-32 sm:pb-10">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2"><label className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Service Name</label><input required name="service_name" defaultValue={editingSub?.service_name} type="text" className="w-full border-2 border-hairline rounded-2xl px-6 py-4 text-lg font-black outline-none focus:border-primary bg-surface-soft/30 transition-all" /></div>
                  <div><label className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Amount</label><input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full border-2 border-hairline rounded-2xl px-6 py-4 text-lg font-black outline-none focus:border-primary bg-surface-soft/30 transition-all" /></div>
                  <div><label className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Currency</label><select name="currency" defaultValue={editingSub?.currency || 'USD'} className="w-full border-2 border-hairline rounded-2xl px-6 py-4 text-lg font-black outline-none bg-white"><option value="USD">USD ($)</option><option value="KRW">KRW (₩)</option></select></div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <button type="button" onClick={() => setModalBillingCycle('monthly')} className={cn("py-5 rounded-2xl font-black border-2 transition-all", modalBillingCycle === 'monthly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-muted")}>매월</button>
                    <button type="button" onClick={() => setModalBillingCycle('yearly')} className={cn("py-5 rounded-2xl font-black border-2 transition-all", modalBillingCycle === 'yearly' ? "border-primary bg-primary/5 text-primary" : "border-hairline text-muted")}>매년</button>
                    <input type="hidden" name="billing_cycle" value={modalBillingCycle} />
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    {modalBillingCycle === 'yearly' && (<div><label className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Month</label><select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full border-2 border-hairline rounded-2xl px-6 py-4 text-lg font-black outline-none bg-white">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div>)}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}><label className="block text-xs font-black text-muted uppercase tracking-widest mb-3">Day</label><select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full border-2 border-hairline rounded-2xl px-6 py-4 text-lg font-black outline-none bg-white">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select></div>
                  </div>
                </div>
                <div className="fixed sm:static bottom-0 left-0 right-0 p-8 sm:p-0 bg-canvas sm:bg-transparent border-t border-hairline sm:border-none flex flex-col sm:flex-row gap-4 mt-8">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="order-2 sm:order-1 flex-1 py-5 font-black text-muted hover:bg-surface-soft rounded-2xl transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] py-5 bg-primary text-white rounded-2xl font-black text-xl hover:bg-primary-active shadow-airbnb flex items-center justify-center gap-3">
                    {isSubmitting && <Loader2 className="w-7 h-7 animate-spin" />}
                    {editingSub ? '저장하기' : '구독 추가'}
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
