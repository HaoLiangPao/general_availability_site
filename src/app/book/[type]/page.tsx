"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import './book.css';

const EVENT_META: Record<string, { title: string; icon: string; duration: number; color: string }> = {
  interview:  { title: 'Job Interview',    icon: '💼', duration: 45, color: '#58a6ff' },
  coffee:     { title: 'Coffee Chat',      icon: '☕', duration: 30, color: '#a371f7' },
  in_person:  { title: 'In-Person Event',  icon: '🤝', duration: 60, color: '#3fb950' },
  ski_lesson: { title: 'Ski Lesson',       icon: '⛷️', duration: 60, color: '#00d2ff' },
};

interface Slot { time: string; available: boolean; }

function toLocalISO(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function BookPage() {
  const params = useParams();
  const router = useRouter();
  const type = params?.type as string ?? 'interview';
  const meta = EVENT_META[type] ?? EVENT_META.interview;

  const [toggledLayout, setToggledLayout] = useState(true);

  // Month navigation
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [selectedIsoDate, setSelectedIsoDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'etransfer' | 'stripe'>('etransfer');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState('');

  const todayIso = toLocalISO(new Date());

  const fetchSlots = useCallback(async (isoDate: string) => {
    setLoadingSlots(true);
    setSelectedTime(null);
    try {
      const res = await fetch(`/api/availability?date=${isoDate}&type=${type}`);
      const data = await res.json();
      setSlots(data.slots ?? []);
      setLastSynced(data.lastSynced ?? null);
    } catch {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [type]);

  const handleDayClick = (isoDate: string) => {
    setSelectedIsoDate(isoDate);
    fetchSlots(isoDate);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const generateMonthDays = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const date = new Date(year, month, 1);
    
    const firstDay = date.getDay();
    const days = [];
    for (let i = 0; i < firstDay; i++) {
       days.push(null);
    }
    
    while (date.getMonth() === month) {
       days.push(new Date(date));
       date.setDate(date.getDate() + 1);
    }
    return days;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIsoDate || !selectedTime) {
      setError('Please select a valid date and time first.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      let finalNotes = notes;
      if (type === 'ski_lesson') {
         finalNotes = `[Payment: ${paymentMethod === 'stripe' ? 'Stripe' : 'E-Transfer'}]\n${notes}`;
      }
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          date: selectedIsoDate,
          time: selectedTime,
          name, email, notes: finalNotes,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setBooked(true);
      } else {
        setError(data.error ?? 'Something went wrong.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) {
    return (
      <div className="container">
        <div className="confirmed-card card">
          <div className="confirmed-icon">🎉</div>
          <h1 className="confirmed-title">Meeting Confirmed!</h1>
          <p className="confirmed-sub">
            A calendar invite will be sent to <strong>{email}</strong> for
            your <strong>{meta.title}</strong> on{' '}
            <strong>{selectedIsoDate}</strong> at{' '}
            <strong>{selectedTime}</strong>.
          </p>
          <div className="confirmed-actions">
            <button className="btn btn-primary" onClick={() => router.push('/')}>← Book another</button>
          </div>
        </div>
      </div>
    );
  }

  const calendarDays = generateMonthDays();

  // Parts of the UI
  const calendarSection = (
    <div className="calendar-ui">
      <div className="calendar-header">
         <button onClick={handlePrevMonth} className="cal-nav-btn">‹</button>
         <div className="cal-month-label">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</div>
         <button onClick={handleNextMonth} className="cal-nav-btn">›</button>
      </div>
      <div className="calendar-grid-header">
         {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="calendar-grid">
         {calendarDays.map((d, i) => {
           if (!d) return <div key={i} className="cal-day empty" />;
           
           const iso = toLocalISO(d);
           const isPast = iso < todayIso;
           const isWeekend = d.getDay() === 0 || d.getDay() === 6;
           const isBlockedWeekend = type === 'interview' && isWeekend;
           const isDisabled = isPast || isBlockedWeekend;
           
           return (
             <button
               key={iso}
               className={`cal-day ${selectedIsoDate === iso ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`}
               onClick={() => !isDisabled && handleDayClick(iso)}
               disabled={isDisabled}
               style={{ '--accent': meta.color } as React.CSSProperties}
             >
               {d.getDate()}
             </button>
           );
         })}
      </div>
    </div>
  );

  const timesSection = (
    <div className="times-ui">
      <h2 className="col-title" style={{ marginTop: 0 }}>Select a Time</h2>
      {!selectedIsoDate ? (
        <p className="slots-placeholder">Please select a date first.</p>
      ) : loadingSlots ? (
        <div className="slots-loading">Loading availability…</div>
      ) : (
        <div className="slots-grid">
          {slots.map(slot => (
            <button
              key={slot.time}
              className={`slot-btn ${!slot.available ? 'unavailable' : ''} ${selectedTime === slot.time ? 'active' : ''}`}
              style={{ '--accent': meta.color } as React.CSSProperties}
              disabled={!slot.available}
              onClick={() => setSelectedTime(slot.time)}
            >
              {slot.time}
            </button>
          ))}
          {slots.length === 0 && (
            <p className="no-slots">No availability data for this day.</p>
          )}
        </div>
      )}
    </div>
  );

  const formSection = (
    <div className="form-ui">
      <h2 className="col-title">Your Details</h2>
      {!selectedTime ? (
        <div className="prompt-select">
          <span style={{ fontSize: '2.5rem' }}>👈</span>
          <p>Select a specific time to proceed.</p>
        </div>
      ) : (
        <form className="booking-form" onSubmit={handleSubmit}>
          <div className="selected-slot-badge" style={{ '--accent': meta.color } as React.CSSProperties}>
            📌 {selectedIsoDate} · {selectedTime}
          </div>

          <div className="form-group">
            <label htmlFor="book-name">Full Name *</label>
            <input id="book-name" type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
          </div>

          <div className="form-group">
            <label htmlFor="book-email">Email Address *</label>
            <input id="book-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" />
          </div>

          {type === 'ski_lesson' && (
            <div className="form-group">
               <label>Payment Method *</label>
               <div className="payment-options">
                 <label className="payment-radio">
                   <input type="radio" name="payment" value="etransfer" checked={paymentMethod === 'etransfer'} onChange={() => setPaymentMethod('etransfer')} />
                   E-Transfer
                 </label>
                 <label className="payment-radio">
                   <input type="radio" name="payment" value="stripe" checked={paymentMethod === 'stripe'} onChange={() => setPaymentMethod('stripe')} />
                   Credit Card (Stripe)
                 </label>
               </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="book-notes">Notes (optional)</label>
            <textarea id="book-notes" rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything that will help prepare for our meeting…" />
          </div>

          {error && <p className="form-error">❌ {error}</p>}

          <button type="submit" className="btn btn-primary submit-btn" disabled={submitting} id="confirm-booking-btn">
            {submitting ? '⏳ Booking…' : `✓ Confirm ${meta.title}`}
          </button>
        </form>
      )}
    </div>
  );

  return (
    <div className="container">
      <header className="site-header">
        <div>
          <button className="back-btn" onClick={() => router.push('/')}>← Back</button>
          <h1 className="site-title">{meta.icon} {meta.title}</h1>
          <p className="site-subtitle">{meta.duration} min · Choose a date and time</p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>

      {lastSynced && (
        <p className="last-synced">📅 Calendar synced at {new Date(lastSynced).toLocaleTimeString()}</p>
      )}

      <div className="toggle-view-container">
         <label className="toggle-switch-label">
           <input type="checkbox" checked={toggledLayout} onChange={(e) => setToggledLayout(e.target.checked)} className="toggle-switch" />
           Enable Side-by-Side Calendar View
         </label>
      </div>

      {toggledLayout ? (
         // New Toggled Layout: Calendar & Times Side-by-Side, Form Below
         <div className="toggled-layout">
            <div className="top-row">
               <div className="card cal-container">{calendarSection}</div>
               <div className="card times-container">{timesSection}</div>
            </div>
            <div className="bottom-row">
               <div className="card form-container">{formSection}</div>
            </div>
         </div>
      ) : (
         // Old Layout: Calendar & Times in one column, Form on right
         <div className="book-grid">
            <div className="card calendar-col">
               {calendarSection}
               <div className="divider" />
               {timesSection}
            </div>
            <div className="card form-col">
               {formSection}
            </div>
         </div>
      )}
    </div>
  );
}
