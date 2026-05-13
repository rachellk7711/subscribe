import type { Subscription } from '../lib/supabase';

export const generateICS = (sub: Subscription) => {
  const today = new Date();
  const year = today.getFullYear();
  
  const billingDay = sub.billing_date;
  const billingMonth = sub.billing_month ? sub.billing_month - 1 : today.getMonth();
  
  // Create date in local time first: 10:00 AM of the day before (D-1)
  const localEventDate = new Date(year, billingMonth, billingDay - 1, 10, 0, 0);
  
  // ICS needs UTC time for maximum compatibility: YYYYMMDDTHHMMSSZ
  const formatUTC = (date: Date) => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const startTime = formatUTC(localEventDate);
  const endTime = formatUTC(new Date(localEventDate.getTime() + 30 * 60 * 1000)); // 30 min duration

  const summary = `[결제알림] ${sub.service_name}`;
  const description = `결제 금액: ${sub.amount.toLocaleString()}${sub.currency === 'USD' ? '$' : '원'} / 해지 골든타임을 놓치지 마세요!`;
  
  const rrule = sub.billing_cycle === 'yearly' 
    ? 'RRULE:FREQ=YEARLY' 
    : 'RRULE:FREQ=MONTHLY';

  // Strict ICS format without BOM or leading spaces
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Antigravity//SubManager//KR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${sub.id}@antigravity.io`,
    `DTSTAMP:${formatUTC(new Date())}`,
    `DTSTART:${startTime}`,
    `DTEND:${endTime}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    rrule,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
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
  // Remove BOM (\ufeff) which might cause parsing errors on some mobile devices
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${sub.service_name}.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

// Also provide a direct Google Calendar Link for 100% mobile compatibility
export const getGoogleCalendarLink = (sub: Subscription) => {
  const today = new Date();
  const year = today.getFullYear();
  const billingMonth = sub.billing_month ? sub.billing_month - 1 : today.getMonth();
  const eventDate = new Date(year, billingMonth, sub.billing_date - 1, 10, 0, 0);
  
  const formatUTC = (date: Date) => date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const start = formatUTC(eventDate);
  const end = formatUTC(new Date(eventDate.getTime() + 30 * 60 * 1000));
  
  const title = encodeURIComponent(`[결제알림] ${sub.service_name}`);
  const details = encodeURIComponent(`결제 금액: ${sub.amount.toLocaleString()}${sub.currency === 'USD' ? '$' : '원'}\n해지 골든타임을 놓치지 마세요!`);
  
  return `https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${start}/${end}&details=${details}&recur=RRULE:${sub.billing_cycle === 'yearly' ? 'FREQ=YEARLY' : 'FREQ=MONTHLY'}`;
};
