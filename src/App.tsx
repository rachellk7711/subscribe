// Deployment Trigger: Airbnb Style + Calendar Support
import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  CreditCard, 
  PieChart as PieChartIcon, 
  Bell, 
  Plus, 
  Search,
  X,
  Loader2,
  Trash2,
  Edit2,
  Calendar
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
  const [loadingData, setLoadingData] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalBillingCycle, setModalBillingCycle] = useState<'monthly'|'yearly'>('monthly');
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [exchangeRate, setExchangeRate] = useState(1350);
  const [searchTerm, setSearchTerm] = useState('');

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
    setLoadingData(true);
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching subscriptions:', error);
    else setSubscriptions(data as Subscription[]);
    setLoadingData(false);
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

  return (
    <div className="flex h-screen bg-canvas text-ink">
      {/* Sidebar */}
      <aside className="w-64 bg-canvas border-r border-hairline flex flex-col">
        <div className="p-8">
          <h1 className="text-2xl font-bold text-primary tracking-tight">구독 관리</h1>
          <p className="text-[11px] text-muted font-medium uppercase tracking-widest mt-1">Subscription Manager</p>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <a href="#" className="flex items-center gap-3 px-4 py-3 bg-surface-soft text-ink rounded-lg font-medium text-[15px]">
            <LayoutDashboard size={20} className="text-primary" /> 대시보드
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-muted hover:bg-surface-soft hover:text-ink rounded-lg font-medium text-[15px] transition-all group">
            <CreditCard size={20} className="group-hover:text-primary transition-colors" /> 구독 관리
          </a>
          <a href="#" className="flex items-center gap-3 px-4 py-3 text-muted hover:bg-surface-soft hover:text-ink rounded-lg font-medium text-[15px] transition-all group">
            <PieChartIcon size={20} className="group-hover:text-primary transition-colors" /> 소비 분석
          </a>
        </nav>
        <div className="p-6 border-t border-hairline">
          <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-surface-soft cursor-pointer transition-all">
            <div className="w-10 h-10 rounded-full bg-surface-strong flex items-center justify-center text-ink font-bold">A</div>
            <div className="overflow-hidden">
              <p className="text-sm font-semibold truncate">안티그래비티</p>
              <p className="text-xs text-muted truncate">Premium Plan</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-20 border-b border-hairline bg-canvas flex items-center justify-between px-10 shrink-0">
          <div className="relative w-96 group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white shadow-airbnb">
              <Search size={16} />
            </div>
            <input 
              type="text" 
              placeholder="구독 서비스 검색..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-14 pr-6 py-3 bg-canvas border border-hairline rounded-full text-[15px] shadow-airbnb transition-all outline-none"
            />
          </div>
          <div className="flex items-center gap-6">
            <button className="p-2.5 text-muted hover:bg-surface-soft rounded-full transition-all relative">
              <Bell size={22} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full border-2 border-canvas"></span>
            </button>
            <div className="w-10 h-10 rounded-full border border-hairline bg-surface-soft overflow-hidden">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" />
            </div>
          </div>
        </header>

        {/* Dashboard Content */}
        <div className="flex-1 overflow-auto p-10">
          <div className="flex justify-between items-center mb-10">
            <div>
              <h2 className="text-3xl font-bold text-ink tracking-tight">안녕하세요, 반가워요! 👋</h2>
              <p className="text-muted text-[16px] mt-1">총 {subscriptions.length}개의 구독을 관리 중입니다.</p>
            </div>
            <button 
              onClick={() => { setEditingSub(null); setModalBillingCycle('monthly'); setIsModalOpen(true); }}
              className="px-8 py-3.5 bg-primary text-white rounded-lg font-bold hover:bg-primary-active transition-all shadow-airbnb active:scale-95"
            >
              + 새 구독 추가
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
            <div className="lg:col-span-2 bg-canvas rounded-[20px] border border-hairline p-10 shadow-airbnb">
              <p className="text-[14px] font-bold text-muted uppercase tracking-wider mb-4">예상 월 지출액</p>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-bold text-ink tabular-nums tracking-tighter">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-xl text-muted font-medium">/ month</span>
              </div>
              <div className="mt-8 flex items-center gap-2">
                <div className="bg-surface-soft border border-hairline px-4 py-2 rounded-full flex items-center gap-2">
                  <span className="text-primary text-sm">💡</span>
                  <span className="text-[13px] font-medium text-ink">적용 환율: 1 USD = {Math.round(exchangeRate).toLocaleString()} KRW</span>
                </div>
              </div>
              <div className="mt-8 flex gap-8">
                <div className="flex flex-col"><span className="text-[13px] text-muted mb-1">Family</span><span className="text-lg font-bold">₩{Math.round(totalFamilyKRW).toLocaleString()}</span></div>
                <div className="flex flex-col"><span className="text-[13px] text-muted mb-1">Personal</span><span className="text-lg font-bold">₩{Math.round(totalPersonalKRW).toLocaleString()}</span></div>
              </div>
            </div>
            <div className="bg-canvas rounded-[20px] border border-hairline p-8 shadow-airbnb flex flex-col items-center justify-center">
              <div className="w-48 h-48 relative">
                <Pie data={chartData} options={{ cutout: '70%', plugins: { legend: { display: false } } }} />
              </div>
              <p className="text-[14px] text-ink mt-6 font-bold">카테고리별 지출 비중</p>
            </div>
          </div>

          <div className="bg-canvas border border-hairline rounded-[20px] shadow-airbnb overflow-hidden mb-12">
            <div className="px-10 py-8 border-b border-hairline flex justify-between items-center">
              <h3 className="font-bold text-ink text-2xl tracking-tight">구독 갱신 일정</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-surface-soft text-muted font-bold border-b border-hairline">
                  <tr>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">서비스</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">금액</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">주기</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">결제일</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">상태</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px]">메모</th>
                    <th className="px-10 py-5 uppercase tracking-widest text-[11px] text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {subscriptions
                    .filter(sub => 
                      sub.service_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      sub.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      (sub.memo && sub.memo.toLowerCase().includes(searchTerm.toLowerCase()))
                    )
                    .map((sub) => {
                      const daysRemaining = getDaysRemaining(sub.billing_date);
                      const isUrgent = daysRemaining <= 3;
                      return (
                        <tr key={sub.id} className="hover:bg-surface-soft transition-all group">
                          <td className="px-10 py-6 font-bold text-ink text-[16px]">{sub.service_name}</td>
                          <td className="px-10 py-6">
                            <div className="flex flex-col">
                              <span className="font-bold text-ink">{sub.currency === 'USD' ? '$' : '₩'}{sub.amount.toLocaleString()}</span>
                              {sub.currency === 'USD' && <span className="text-[12px] text-muted">≈ ₩{Math.round(sub.amount * exchangeRate).toLocaleString()}</span>}
                            </div>
                          </td>
                          <td className="px-10 py-6">
                            <span className={cn("px-3 py-1 rounded-full text-[12px] font-bold", sub.billing_cycle === 'yearly' ? 'bg-indigo-100 text-indigo-700' : 'bg-rose-100 text-rose-700')}>
                              {sub.billing_cycle}
                            </span>
                          </td>
                          <td className="px-10 py-6 font-medium">
                            {sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `${sub.billing_date}일`}
                          </td>
                          <td className="px-10 py-6">
                            <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full w-fit font-bold text-[12px]", isUrgent ? "bg-primary/10 text-primary" : "bg-surface-strong text-ink")}>
                              <div className={cn("w-1.5 h-1.5 rounded-full", isUrgent ? "bg-primary animate-pulse" : "bg-ink")}></div>
                              {daysRemaining === 0 ? '오늘' : `${daysRemaining}일 전`}
                            </div>
                          </td>
                          <td className="px-10 py-6 text-muted text-[14px] truncate max-w-[150px]" title={sub.memo || ''}>{sub.memo || '-'}</td>
                          <td className="px-10 py-6 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => downloadICS(sub)}
                                className="p-2 hover:bg-white rounded-full shadow-airbnb border border-hairline transition-all hover:text-primary"
                                title="캘린더에 알림 추가"
                              >
                                <Calendar size={16} />
                              </button>
                              <button onClick={() => handleEditSubscription(sub)} className="p-2 hover:bg-white rounded-full shadow-airbnb border border-hairline transition-all"><Edit2 size={16} /></button>
                              <button onClick={() => handleDeleteSubscription(sub.id)} className="p-2 hover:bg-white rounded-full shadow-airbnb border border-hairline transition-all hover:text-primary"><Trash2 size={16} /></button>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-canvas rounded-[24px] shadow-2xl w-full max-w-xl overflow-hidden flex flex-col max-h-[95vh] animate-in zoom-in-95 duration-300">
              <div className="px-8 py-6 border-b border-hairline flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-bold text-ink">{editingSub ? '구독 정보 수정' : '새 구독 추가'}</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-soft rounded-full transition-all">
                  <X size={24} />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">서비스 명</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">금액</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'USD'} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                      <option value="USD">USD ($)</option>
                      <option value="KRW">KRW (₩)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">결제 주기</label>
                    <select name="billing_cycle" defaultValue={editingSub?.billing_cycle || 'monthly'} onChange={(e) => setModalBillingCycle(e.target.value as 'monthly'|'yearly')} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                      <option value="monthly">매월 결제</option>
                      <option value="yearly">매년 결제</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {modalBillingCycle === 'yearly' && (
                      <div>
                        <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">결제 월</label>
                        <select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                          {Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}
                        </select>
                      </div>
                    )}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}>
                      <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">결제 일</label>
                      <select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                        {Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">결제 수단</label>
                    <input name="payment_method" defaultValue={editingSub?.payment_method} type="text" className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">이용 주체</label>
                    <select name="user_type" defaultValue={editingSub?.user_type || 'personal'} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                      <option value="personal">개인용</option>
                      <option value="family">가족용</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">카테고리</label>
                    <select name="category" defaultValue={editingSub?.category || 'Entertainment'} className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none appearance-none">
                      <option value="Entertainment">엔터테인먼트</option>
                      <option value="Productivity">생산성</option>
                      <option value="Finance">금융</option>
                      <option value="Education">교육</option>
                      <option value="Other">기타</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold text-muted uppercase tracking-widest mb-2">메모</label>
                    <input name="memo" defaultValue={editingSub?.memo || ''} type="text" className="w-full border border-hairline rounded-xl px-4 py-3.5 text-[16px] outline-none shadow-sm" />
                  </div>
                </div>
                <div className="pt-8 border-t border-hairline flex justify-end gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 font-bold hover:bg-surface-soft rounded-lg transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="px-10 py-3 bg-primary text-white rounded-lg font-bold hover:bg-primary-active transition-all shadow-airbnb flex items-center gap-2">
                    {isSubmitting && <Loader2 className="w-5 h-5 animate-spin" />}
                    {editingSub ? '수정 완료' : '추가하기'}
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
