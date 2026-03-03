"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import './book.css';

const EVENT_META: Record<string, { title: string; icon: string; duration: number; color: string }> = {
  interview: { title: 'Job Interview',    icon: '💼', duration: 45, color: '#58a6ff' },
  coffee:    { title: 'Coffee Chat',      icon: '☕', duration: 30, color: '#a371f7' },
  in_person: { title: 'In-Person Event',  icon: '🤝', duration: 60, color: '#3fb950' },
};

interface Slot { time: string; available: boolean; }

function getNextDays(n: number) {
  const today = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i + 1);
    return {
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      num: d.getDate(),
      monthLabel: d.toLocaleDateString('en-US', { month: 'short' }),
      iso: d.toISOString().slice(0, 10),
    };
  });
}

export default function BookPage() {
  const params = useParams();
  const router = useRouter();
  const type = params?.type as string ?? 'interview';
  const meta = EVENT_META[type] ?? EVENT_META.interview;

  const days = getNextDays(14);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState('');

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

  useEffect(() => {
    fetchSlots(days[0].iso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDayClick = (idx: number) => {
    setSelectedDayIdx(idx);
    fetchSlots(days[idx].iso);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          date: days[selectedDayIdx].iso,
          time: selectedTime,
          name, email, notes,
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
            <strong>{days[selectedDayIdx].label} {days[selectedDayIdx].monthLabel} {days[selectedDayIdx].num}</strong> at{' '}
            <strong>{selectedTime}</strong>.
          </p>
          <div className="confirmed-actions">
            <button className="btn btn-primary" onClick={() => router.push('/')}>← Book another</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Header */}
      <header className="site-header">
        <div>
          <button className="back-btn" onClick={() => router.push('/')}>← Back</button>
          <h1 className="site-title">
            {meta.icon} {meta.title}
          </h1>
          <p className="site-subtitle">{meta.duration} min · Choose a date and time</p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </header>

      {lastSynced && (
        <p className="last-synced">
          📅 Calendar synced at {new Date(lastSynced).toLocaleTimeString()}
        </p>
      )}

      <div className="book-grid">
        {/* Left: Calendar picker */}
        <div className="card calendar-col">
          <h2 className="col-title">Select a Date</h2>

          <div className="day-strip">
            {days.map((d, i) => (
              <button
                key={d.iso}
                className={`day-btn ${selectedDayIdx === i ? 'active' : ''}`}
                style={{ '--accent': meta.color } as React.CSSProperties}
                onClick={() => handleDayClick(i)}
              >
                <span className="day-label">{d.label}</span>
                <span className="day-num">{d.num}</span>
                <span className="day-month">{d.monthLabel}</span>
              </button>
            ))}
          </div>

          <h2 className="col-title" style={{ marginTop: '24px' }}>Select a Time</h2>

          {loadingSlots ? (
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
                <p className="no-slots">No availability data. Try syncing calendars.</p>
              )}
            </div>
          )}
        </div>

        {/* Right: Booking form */}
        <div className="card form-col">
          <h2 className="col-title">Your Details</h2>
          {!selectedTime ? (
            <div className="prompt-select">
              <span style={{ fontSize: '2.5rem' }}>👈</span>
              <p>Select a date and time to proceed.</p>
            </div>
          ) : (
            <form className="booking-form" onSubmit={handleSubmit}>
              <div className="selected-slot-badge" style={{ '--accent': meta.color } as React.CSSProperties}>
                📌 {days[selectedDayIdx].label} {days[selectedDayIdx].monthLabel} {days[selectedDayIdx].num} · {selectedTime}
              </div>

              <div className="form-group">
                <label htmlFor="book-name">Full Name *</label>
                <input
                  id="book-name"
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>

              <div className="form-group">
                <label htmlFor="book-email">Email Address *</label>
                <input
                  id="book-email"
                  type="email"
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                />
              </div>

              <div className="form-group">
                <label htmlFor="book-notes">Notes (optional)</label>
                <textarea
                  id="book-notes"
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Anything that will help prepare for our meeting…"
                />
              </div>

              {error && <p className="form-error">❌ {error}</p>}

              <button
                type="submit"
                className="btn btn-primary submit-btn"
                disabled={submitting}
                id="confirm-booking-btn"
              >
                {submitting ? '⏳ Booking…' : `✓ Confirm ${meta.title}`}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
