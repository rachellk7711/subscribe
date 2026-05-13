// Final Fix: Resolve build errors (chartData & unused imports)
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [calendarMenuId, setCalendarMenuId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('전체');

  useEffect(() => {
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(res => res.json())
      .then(data => { if (data?.rates?.KRW) setExchangeRate(data.rates.KRW); })
      .catch(err => console.error('Exchange rate error:', err));
    fetchSubscriptions();
  }, []);

  const fetchSubscriptions = async () => {
    const { data, error } = await supabase.from('subscriptions').select('*').order('created_at', { ascending: false });
    if (error) return console.error('Fetch error:', error);
    
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
    const { error } = await supabase.from('subscriptions').update({ is_paid: newStatus, last_paid_month: newStatus ? currentMonth : null }).eq('id', sub.id);
    if (!error) fetchSubscriptions();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('삭제하시겠습니까?')) return;
    const { error } = await supabase.from('subscriptions').delete().eq('id', id);
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
    };

    const { error } = editingSub 
      ? await supabase.from('subscriptions').update(subData).eq('id', editingSub.id)
      : await supabase.from('subscriptions').insert([subData]);

    setIsSubmitting(false);
    if (!error) { setIsModalOpen(false); setEditingSub(null); fetchSubscriptions(); }
  };

  const totalMonthlyKRW = useMemo(() => {
    const currentMonthNum = new Date().getMonth() + 1;
    return subscriptions.reduce((acc, sub) => {
      let amountKRW = sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount;
      if (sub.billing_cycle === 'yearly') {
        return sub.annual_type === 'split' ? acc + (amountKRW / 12) : (sub.billing_month === currentMonthNum ? acc + amountKRW : acc);
      }
      return acc + amountKRW;
    }, 0);
  }, [subscriptions, exchangeRate]);

  const filteredSubs = subscriptions.filter(sub => 
    (activeTab === '전체' || sub.category === activeTab) && 
    sub.service_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const chartData = useMemo(() => ({
    labels: CATEGORIES,
    datasets: [{
      data: CATEGORIES.map(cat => subscriptions.filter(s => s.category === cat).reduce((sum, s) => sum + (s.currency === 'USD' ? s.amount * exchangeRate : s.amount), 0)),
      backgroundColor: ['#ff385c', '#222222', '#717171', '#ffb6c1', '#f8f9fa', '#dddddd'],
      borderWidth: 0
    }]
  }), [subscriptions, exchangeRate]);

  return (
    <div className="flex h-screen bg-[#f7f7f7] text-[#222222] font-sans overflow-hidden">
      <aside className="hidden lg:flex w-72 bg-white border-r border-gray-200 flex-col shrink-0">
        <div className="p-8">
          <h1 className="text-2xl font-black text-[#ff385c] tracking-tighter flex items-center gap-2">
            <LayoutDashboard size={28} /> 관리자
          </h1>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">통합 고정비 관리 시스템</p>
        </div>
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {['전체', ...CATEGORIES].map(cat => (
            <button key={cat} onClick={() => setActiveTab(cat)} className={cn("w-full flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-bold transition-all", activeTab === cat ? "bg-[#ff385c] text-white shadow-md" : "text-gray-500 hover:bg-gray-100")}>
              <span className="flex items-center gap-3">{cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}{cat}</span>
              {activeTab === cat && <ChevronRight size={16} />}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-gray-100">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-[#ff385c] text-white flex items-center justify-center font-black">A</div>
            <div><p className="text-xs font-black">MASTER</p><p className="text-[10px] text-gray-400">Pro Edition</p></div>
          </div>
        </div>
      </aside>

      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-8 flex justify-between items-center">
              <h1 className="text-xl font-black text-[#ff385c]">메뉴</h1>
              <button onClick={() => setIsMobileMenuOpen(false)}><X size={24} /></button>
            </div>
            <div className="flex-1 px-4 space-y-1">
              {['전체', ...CATEGORIES].map(cat => (
                <button key={cat} onClick={() => { setActiveTab(cat); setIsMobileMenuOpen(false); }} className={cn("w-full flex items-center gap-3 px-5 py-4 rounded-xl font-bold", activeTab === cat ? "bg-[#ff385c] text-white" : "text-gray-500")}>
                  {cat === '전체' ? <Filter size={18} /> : <div className="w-1.5 h-1.5 rounded-full bg-current" />}{cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 flex flex-col min-w-0 bg-[#f7f7f7] overflow-hidden relative">
        <header className="h-20 bg-white border-b border-gray-200 flex items-center justify-between px-6 lg:px-10 shrink-0 z-30">
          <div className="flex items-center gap-4 flex-1">
            <button className="lg:hidden p-2.5 bg-gray-50 border border-gray-200 rounded-xl" onClick={() => setIsMobileMenuOpen(true)}><Menu size={24} /></button>
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input type="text" placeholder="항목 검색..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-12 pr-6 py-3 bg-gray-50 border border-gray-200 rounded-full text-sm focus:bg-white focus:border-[#ff385c] outline-none transition-all" />
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 space-y-10 pb-32">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div>
              <h2 className="text-3xl lg:text-4xl font-black tracking-tight text-gray-900">지출 관리 대시보드</h2>
              <p className="text-gray-500 font-medium mt-1">총 {filteredSubs.length}개의 항목이 필터링되었습니다.</p>
            </div>
            <button onClick={() => { setEditingSub(null); setIsModalOpen(true); }} className="w-full sm:w-auto bg-[#ff385c] text-white px-8 py-4 rounded-2xl font-black text-lg shadow-lg shadow-[#ff385c]/20 hover:bg-[#e31c5f] transition-all active:scale-95">+ 지출 항목 추가</button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-[32px] p-8 lg:p-12 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#ff385c]/5 rounded-full -mr-20 -mt-20 blur-3xl" />
              <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">Total Monthly Expenditure</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl lg:text-7xl font-black tabular-nums tracking-tighter text-gray-900">₩{Math.round(totalMonthlyKRW).toLocaleString()}</span>
                <span className="text-xl text-gray-400 font-bold">/ MO</span>
              </div>
              <div className="mt-10 flex flex-wrap gap-3">
                <div className="px-4 py-2 rounded-full bg-gray-50 border border-gray-200 text-xs font-bold text-gray-500 italic">Rate: ₩{Math.round(exchangeRate)}</div>
                <div className="px-4 py-2 rounded-full bg-[#ff385c]/10 border border-[#ff385c]/20 text-xs font-black text-[#ff385c]">Progress: {Math.round((subscriptions.filter(s => s.is_paid).length / (subscriptions.length || 1)) * 100)}%</div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-[32px] p-8 flex flex-col items-center justify-center min-h-[250px] shadow-sm">
              <div className="w-36 h-36 relative">
                <Pie data={chartData} options={{ cutout: '80%', plugins: { legend: { display: false } } }} />
              </div>
              <p className="text-sm font-black mt-6">카테고리별 지출 비율</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-[32px] shadow-sm overflow-hidden mb-10">
            <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50">
              <h3 className="font-black text-xl text-gray-800">지출 상세 내역</h3>
            </div>
            <div className="lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead className="bg-gray-50 text-gray-400 font-black text-[10px] uppercase tracking-widest border-b border-gray-100">
                  <tr>
                    <th className="px-8 py-5">납부</th>
                    <th className="px-8 py-5">항목</th>
                    <th className="px-8 py-5">금액</th>
                    <th className="px-8 py-5">결제예정일</th>
                    <th className="px-8 py-5">결제방식</th>
                    <th className="px-8 py-5 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredSubs.map((sub) => {
                    const isManualUnpaid = sub.payment_type === 'manual' && !sub.is_paid;
                    const days = Math.max(0, sub.billing_date - new Date().getDate());
                    return (
                      <tr key={sub.id} className={cn("group transition-colors", isManualUnpaid ? "bg-red-50/30" : "hover:bg-gray-50")}>
                        <td className="px-8 py-7">
                          <button onClick={() => togglePaidStatus(sub)} className={cn("transition-all active:scale-90", sub.is_paid ? "text-green-600 scale-110" : "text-gray-200 hover:text-gray-400")}>
                            {sub.is_paid ? <CheckCircle2 size={26} /> : <Circle size={26} />}
                          </button>
                        </td>
                        <td className="px-8 py-7">
                          <div className="flex flex-col">
                            <span className="font-black text-lg text-gray-900 flex items-center gap-2">
                              {sub.service_name}
                              {sub.is_variable && <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-black uppercase">VAR</span>}
                            </span>
                            <span className="text-xs text-gray-400 font-bold mt-0.5">{sub.category}</span>
                          </div>
                        </td>
                        <td className="px-8 py-7 font-black text-lg text-gray-900">₩{Math.round(sub.currency === 'USD' ? sub.amount * exchangeRate : sub.amount).toLocaleString()}</td>
                        <td className="px-8 py-7 font-black">
                          <div className="text-gray-900">{sub.billing_cycle === 'yearly' ? `${sub.billing_month}월 ${sub.billing_date}일` : `매월 ${sub.billing_date}일`}</div>
                          <div className={cn("text-[11px] font-bold mt-1", days <= 3 ? "text-[#ff385c]" : "text-gray-400")}>D-{days === 0 ? 'Day' : days}</div>
                        </td>
                        <td className="px-8 py-7">
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-bold text-gray-600">{sub.payment_method}</span>
                            <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded w-fit shadow-sm", sub.payment_type === 'auto' ? "bg-gray-100 text-gray-500" : "bg-red-500 text-white")}>
                              {sub.payment_type === 'auto' ? '자동이체' : '직접납부'}
                            </span>
                          </div>
                        </td>
                        <td className="px-8 py-7 text-right">
                          <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                            <div className="relative">
                              <button onClick={() => setCalendarMenuId(calendarMenuId === sub.id ? null : sub.id)} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-[#ff385c] hover:text-white transition-all shadow-sm"><Calendar size={18} /></button>
                              {calendarMenuId === sub.id && (
                                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-2xl shadow-2xl z-50 overflow-hidden text-left animate-in fade-in zoom-in-95">
                                  <a href={getNaverCalendarLink(sub)} target="_blank" className="block px-5 py-3.5 text-xs font-black text-green-600 hover:bg-green-50 border-b border-gray-100">네이버 등록</a>
                                  <a href={getGoogleCalendarLink(sub)} target="_blank" className="block px-5 py-3.5 text-xs font-black text-blue-600 hover:bg-blue-50 border-b border-gray-100">구글 등록</a>
                                  <button onClick={() => downloadICS(sub)} className="w-full text-left px-5 py-3.5 text-xs font-black text-gray-700 hover:bg-gray-50">ICS 파일 저장</button>
                                </div>
                              )}
                            </div>
                            <button onClick={() => { setEditingSub(sub); setIsModalOpen(true); }} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all"><Edit2 size={18} /></button>
                            <button onClick={() => handleDelete(sub.id)} className="p-2.5 bg-white border border-gray-200 rounded-xl hover:bg-red-50 text-red-600 transition-all"><Trash2 size={18} /></button>
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

        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-md p-0 sm:p-6 animate-in fade-in">
            <div className="bg-white border border-gray-200 rounded-t-[40px] sm:rounded-[40px] shadow-2xl w-full max-w-xl flex flex-col h-[90vh] sm:h-auto mt-auto sm:mt-0 animate-in slide-in-from-bottom sm:zoom-in-95">
              <div className="px-10 py-8 border-b border-gray-100 flex justify-between items-center shrink-0">
                <h3 className="text-2xl font-black tracking-tight text-gray-900">{editingSub ? '정보 수정' : '새 지출 등록'}</h3>
                <button onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="p-3 bg-gray-50 rounded-2xl hover:rotate-90 transition-all"><X size={24} /></button>
              </div>
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-10 space-y-8 pb-32 sm:pb-10">
                <div className="grid grid-cols-2 gap-6">
                  <div className="col-span-2">
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">지출 명칭</label>
                    <input required name="service_name" defaultValue={editingSub?.service_name} type="text" placeholder="예: 아파트 관리비" className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-lg font-black outline-none focus:bg-white focus:border-[#ff385c] transition-all" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">금액</label>
                    <input required name="amount" defaultValue={editingSub?.amount} type="number" step="0.01" className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 text-lg font-black outline-none focus:bg-white focus:border-[#ff385c]" />
                    <label className="flex items-center gap-2 mt-3 cursor-pointer group">
                      <input type="checkbox" name="is_variable" defaultChecked={editingSub?.is_variable} className="w-4 h-4 rounded text-[#ff385c]" />
                      <span className="text-xs font-bold text-gray-500 group-hover:text-[#ff385c]">매달 금액 변동됨</span>
                    </label>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">통화</label>
                    <select name="currency" defaultValue={editingSub?.currency || 'KRW'} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-4 font-black outline-none"><option value="KRW">KRW (₩)</option><option value="USD">USD ($)</option></select>
                  </div>
                  <div className="col-span-2 border-t border-gray-50 pt-4">
                    <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-4">납부 방식</label>
                    <div className="grid grid-cols-2 gap-4">
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", (editingSub?.payment_type === 'auto' || !editingSub) ? "border-[#ff385c] bg-[#ff385c]/5" : "border-gray-100 hover:border-gray-200")}>
                        <div className="flex items-center gap-2 font-black text-sm"><input type="radio" name="payment_type" value="auto" defaultChecked={editingSub?.payment_type === 'auto' || !editingSub} className="text-[#ff385c]" /> 자동 납부</div>
                        <span className="text-[10px] text-gray-400 mt-1 font-bold">자동이체/카드승인</span>
                      </label>
                      <label className={cn("flex flex-col p-4 rounded-2xl border-2 transition-all cursor-pointer", editingSub?.payment_type === 'manual' ? "border-red-500 bg-red-50" : "border-gray-100 hover:border-gray-200")}>
                        <div className="flex items-center gap-2 font-black text-sm"><input type="radio" name="payment_type" value="manual" defaultChecked={editingSub?.payment_type === 'manual'} className="text-red-500" /> 직접 납부</div>
                        <span className="text-[10px] text-gray-400 mt-1 font-bold">지로/이체 직접 수행</span>
                      </label>
                    </div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">결제 주기</label>
                      <select name="billing_cycle" defaultValue={editingSub?.billing_cycle || 'monthly'} onChange={(e) => setModalBillingCycle(e.target.value as 'monthly'|'yearly')} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black outline-none"><option value="monthly">매월</option><option value="yearly">매년</option></select>
                    </div>
                    {modalBillingCycle === 'yearly' && (
                      <div>
                        <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">연간 처리</label>
                        <select name="annual_type" defaultValue={editingSub?.annual_type || 'split'} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black outline-none"><option value="split">12개월 분할</option><option value="single">일시불 (당월)</option></select>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    {modalBillingCycle === 'yearly' && (<div><label className="block text-xs font-black text-gray-400 mb-2">결제 월</label><select name="billing_month" defaultValue={editingSub?.billing_month || 1} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black">{Array.from({length: 12}, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</select></div>)}
                    <div className={modalBillingCycle === 'monthly' ? 'col-span-2' : ''}><label className="block text-xs font-black text-gray-400 mb-2">결제 일</label><select name="billing_date" defaultValue={editingSub?.billing_date || 1} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black">{Array.from({length: 31}, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}일</option>)}</select></div>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">카테고리</label>
                      <select name="category" defaultValue={editingSub?.category || '디지털 구독'} className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black">{CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-2.5">결제 수단</label>
                      <input name="payment_method" defaultValue={editingSub?.payment_method} type="text" placeholder="예: 신한카드 1234" className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-5 py-3.5 font-black" />
                    </div>
                  </div>
                </div>
                <div className="fixed sm:static bottom-0 left-0 right-0 p-8 sm:p-0 bg-white sm:bg-transparent border-t border-gray-100 sm:border-none flex flex-col sm:flex-row gap-4 mt-8">
                  <button type="button" onClick={() => { setIsModalOpen(false); setEditingSub(null); }} className="order-2 sm:order-1 flex-1 py-5 font-black text-gray-400 hover:bg-gray-50 rounded-2xl transition-all">취소</button>
                  <button type="submit" disabled={isSubmitting} className="order-1 sm:order-2 flex-[2] bg-[#ff385c] text-white py-5 rounded-2xl font-black text-xl hover:bg-[#e31c5f] shadow-lg shadow-[#ff385c]/20 flex items-center justify-center gap-3">
                    {isSubmitting && <Loader2 className="animate-spin" />}
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
