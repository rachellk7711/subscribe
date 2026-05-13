import type { Subscription } from '../lib/supabase';

export const generateICS = (sub: Subscription) => {
  const today = new Date();
  const year = today.getFullYear();
  
  const billingDay = sub.billing_date;
  const billingMonth = sub.billing_month ? sub.billing_month - 1 : today.getMonth();
  const localEventDate = new Date(year, billingMonth, billingDay - 1, 10, 0, 0);
  
  const formatUTC = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startTime = formatUTC(localEventDate);
  const endTime = formatUTC(new Date(localEventDate.getTime() + 30 * 60 * 1000));

  const summary = `[결제알림] ${sub.service_name}`;
  
  // 상세 메모 구성
  const descriptionLines = [
    `💰 결제 금액: ${sub.amount.toLocaleString()}${sub.currency === 'USD' ? '$' : '원'}`,
    `📅 결제 주기: ${sub.billing_cycle === 'yearly' ? '매년' : '매월'}`,
    `📝 메모: ${sub.memo || '없음'}`,
    `--------------------------`,
    `내일 결제가 진행될 예정입니다. 해지 여부를 확인해 주세요!`
  ];
  const description = descriptionLines.join('\\n');
  
  const rrule = sub.billing_cycle === 'yearly' 
    ? 'RRULE:FREQ=YEARLY' 
    : 'RRULE:FREQ=MONTHLY';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//SubTracker//KR',
    'BEGIN:VEVENT',
    `UID:${sub.id}@antigravity.io`,
    `DTSTAMP:${formatUTC(new Date())}`,
    `DTSTART:${startTime}`,
    `DTEND:${endTime}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    rrule,
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
};

export const downloadICS = (sub: Subscription) => {
  const content = generateICS(sub);
  // 안드로이드에서 캘린더 앱들이 더 잘 인식하도록 MIME 타입을 보강합니다.
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // 파일명을 영어로 하면 호환성이 더 올라가는 경우가 있어 형식을 고정합니다.
  link.setAttribute('download', `sub_${sub.id.substring(0,8)}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const getGoogleCalendarLink = (sub: Subscription) => {
  const today = new Date();
  const year = today.getFullYear();
  const billingMonth = sub.billing_month ? sub.billing_month - 1 : today.getMonth();
  const eventDate = new Date(year, billingMonth, sub.billing_date - 1, 10, 0, 0);
  
  const formatUTC = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = formatUTC(eventDate);
  const end = formatUTC(new Date(eventDate.getTime() + 30 * 60 * 1000));
  
  const title = encodeURIComponent(`[결제알림] ${sub.service_name}`);
  
  // 구글 캘린더용 상세 메모
  const detailsText = [
    `💰 결제 금액: ${sub.amount.toLocaleString()}${sub.currency === 'USD' ? '$' : '원'}`,
    `📅 결제 주기: ${sub.billing_cycle === 'yearly' ? '매년' : '매월'}`,
    `📝 메모: ${sub.memo || '없음'}`,
    `--------------------------`,
    `내일 결제 예정입니다.`
  ].join('\n');
  
  const details = encodeURIComponent(detailsText);
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&recur=RRULE:${sub.billing_cycle === 'yearly' ? 'FREQ=YEARLY' : 'FREQ=MONTHLY'}`;
};
