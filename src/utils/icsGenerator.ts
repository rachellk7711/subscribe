import type { Subscription } from '../lib/supabase';

export const generateICS = (sub: Subscription) => {
  const today = new Date();
  const year = today.getFullYear();
  
  // Set the start date: 10 AM on the day before (D-1)
  const billingDay = sub.billing_date;
  const billingMonth = sub.billing_month ? sub.billing_month - 1 : today.getMonth();
  
  // Use local time instead of UTC to avoid time zone shifts
  const eventDate = new Date(year, billingMonth, billingDay - 1, 10, 0, 0);
  
  // Format: YYYYMMDDTHHMMSS (No 'Z' at the end makes it "Local Time")
  const formatLocalDate = (date: Date) => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      'T',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds())
    ].join('');
  };

  const startTime = formatLocalDate(eventDate);
  const endTime = formatLocalDate(new Date(eventDate.getTime() + 60 * 60 * 1000)); // 1 hour duration

  const summary = `[결제알림] ${sub.service_name} 구독 결제일`;
  const description = `결제 금액: ${sub.amount.toLocaleString()}${sub.currency === 'USD' ? '$' : '원'}\\n해지 골든타임을 놓치지 마세요!`;
  
  // Recurrence rule
  const rrule = sub.billing_cycle === 'yearly' 
    ? 'RRULE:FREQ=YEARLY' 
    : 'RRULE:FREQ=MONTHLY';

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'PRODID:-//Antigravity//Subscription Manager//EN',
    'BEGIN:VEVENT',
    `UID:${sub.id}-${Date.now()}@antigravity.io`,
    `DTSTAMP:${formatLocalDate(new Date())}`,
    `DTSTART:${startTime}`,
    `DTEND:${endTime}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    rrule,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'TRIGGER:-PT0M', // Trigger exactly at the start time (10 AM)
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  return icsContent;
};

export const downloadICS = (sub: Subscription) => {
  const content = generateICS(sub);
  // Add Byte Order Mark (BOM) for better UTF-8 support in Excel/Outlook
  const blob = new Blob(['\ufeff' + content], { type: 'text/calendar;charset=utf-8' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${sub.service_name}_알림.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};
