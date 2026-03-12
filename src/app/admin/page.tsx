"use client";

import React, { useEffect, useState, useCallback } from 'react';
import ThemeToggle from '@/components/ThemeToggle';
import { CANDIDATE_TIMES } from '@/lib/booking';
import './admin.css';

type Booking = {
  id: number;
  type: string;
  date: string;
  time: string;
  name: string;
  email: string;
  notes: string | null;
  created_at: string;
  status?: string;
};

type Stats = {
  total: number;
  byType: Record<string, number>;
  byDate: Record<string, number>;
  recentCount: number;
  bookings: Booking[];
};

const TYPE_ICONS: Record<string, string> = {
  interview: '💼',
  coffee: '☕',
  in_person: '🤝',
  ski_lesson: '⛷️',
};
const TYPE_LABELS: Record<string, string> = {
  interview: 'Interview',
  coffee: 'Coffee Chat',
  in_person: 'In-Person',
  ski_lesson: 'Ski Lesson',
};
const TYPE_COLORS: Record<string, string> = {
  interview: '#58a6ff',
  coffee: '#a371f7',
  in_person: '#3fb950',
  ski_lesson: '#00b4d8',
};

export default function AdminPage() {
  // Auth state
  const [authed, setAuthed] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [logging, setLogging] = useState(false);

  // Data state
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [deleteMsg, setDeleteMsg] = useState('');

  // Cancel modal state
  const [cancelModal, setCancelModal] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // Schedule override state
  type OverrideAction = 'block' | 'force_open';
  type OverrideMap = Record<string, OverrideAction>; // time -> action
  const [overrideDate, setOverrideDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // tomorrow in local time
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [loadingOverrides, setLoadingOverrides] = useState(false);
  const [overrideMsg, setOverrideMsg] = useState('');

  // Try fetching stats immediately — if the cookie exists, we're already logged in
  useEffect(() => {
    tryFetchStats();
  }, []);

  // Fetch overrides when date changes
  const fetchOverrides = useCallback(async (date: string) => {
    setLoadingOverrides(true);
    try {
      const res = await fetch(`/api/admin/overrides?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        const map: OverrideMap = {};
        for (const o of data.overrides ?? []) {
          map[o.time] = o.action;
        }
        setOverrides(map);
      }
    } finally {
      setLoadingOverrides(false);
    }
  }, []);

  useEffect(() => {
    if (authed && overrideDate) fetchOverrides(overrideDate);
  }, [authed, overrideDate, fetchOverrides]);

  async function tryFetchStats() {
    setLoadingStats(true);
    try {
      const res = await fetch('/api/admin/stats');
      if (res.ok) {
        const data = await res.json();
        // API returns { bookings: [...], stats: { total, recentCount, byType } }
        // Flatten into the Stats shape the component expects
        setStats({ ...data.stats, bookings: data.bookings });
        setAuthed(true);
      }
    } finally {
      setLoadingStats(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true);
    setLoginError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        await tryFetchStats();
      } else {
        const data = await res.json();
        setLoginError(data.error ?? 'Invalid credentials');
      }
    } catch {
      setLoginError('Network error');
    } finally {
      setLogging(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    setAuthed(false);
    setStats(null);
  }

  async function toggleOverride(time: string) {
    const current = overrides[time]; // undefined | 'block' | 'force_open'
    // Cycle: default → block → force_open → default
    try {
      if (!current) {
        // Set to block
        const res = await fetch('/api/admin/overrides', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: overrideDate, time, action: 'block' }),
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        setOverrides(prev => ({ ...prev, [time]: 'block' }));
      } else if (current === 'block') {
        // Switch to force_open
        const res = await fetch('/api/admin/overrides', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: overrideDate, time, action: 'force_open' }),
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        setOverrides(prev => ({ ...prev, [time]: 'force_open' }));
      } else {
        // Remove override (back to default)
        const res = await fetch('/api/admin/overrides', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: overrideDate, time }),
        });
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        setOverrides(prev => {
          const next = { ...prev };
          delete next[time];
          return next;
        });
      }
      setOverrideMsg('');
    } catch (err) {
      setOverrideMsg(`⚠️ Failed to update override for ${time}: ${err instanceof Error ? err.message : 'unknown error'}`);
      // Re-fetch to ensure UI matches server state
      fetchOverrides(overrideDate);
    }
  }

  function openCancelModal(booking: Booking) {
    setCancelModal(booking);
    setCancelReason('');
    setCancelling(false);
  }

  function closeCancelModal() {
    if (cancelling) return; // prevent closing while processing
    setCancelModal(null);
    setCancelReason('');
  }

  async function handleConfirmCancel() {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      await fetch('/api/admin/stats', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: cancelModal.id, reason: cancelReason }),
      });
      setDeleteMsg(`Booking #${cancelModal.id} cancelled and guest notified.`);
      setCancelModal(null);
      setCancelReason('');
      await tryFetchStats();
      setTimeout(() => setDeleteMsg(''), 4000);
    } catch {
      setDeleteMsg('Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  }

  /* ──────────── LOGIN SCREEN ──────────── */
  if (!authed) {
    return (
      <div className="container">
        <header className="site-header">
          <div>
            <h1 className="site-title">🔐 Admin</h1>
            <p className="site-subtitle">Enter your credentials to continue.</p>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <a href="/" className="btn btn-ghost">← Back to site</a>
          </div>
        </header>

        <div className="login-card card">
          <form className="login-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label htmlFor="admin-user">Username</label>
              <input
                id="admin-user"
                type="text"
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div className="form-group">
              <label htmlFor="admin-pass">Password</label>
              <input
                id="admin-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {loginError && <p className="form-error">❌ {loginError}</p>}
            <button type="submit" className="btn btn-primary submit-btn" disabled={logging} id="admin-login-btn">
              {logging ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ──────────── DASHBOARD ──────────── */
  const filtered = (stats?.bookings ?? []).filter(
    b => filterType === 'all' || b.type === filterType
  );

  return (
    <div className="container">
      <header className="site-header">
        <div>
          <h1 className="site-title">📊 Admin Dashboard</h1>
          <p className="site-subtitle">All scheduled meetings at a glance.</p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <a href="/" className="btn btn-ghost">← Site</a>
          <button className="btn btn-ghost" onClick={handleLogout} id="logout-btn">Log out</button>
        </div>
      </header>

      {deleteMsg && <div className="sync-toast" style={{ marginBottom: 20 }}>🗑 {deleteMsg}</div>}

      {loadingStats && <p className="text-muted">Loading…</p>}

      {stats && (
        <>
          {/* Stat cards */}
          <div className="stat-grid">
            <div className="stat-card card hoverable" onClick={() => setFilterType('all')} style={{ cursor: 'pointer' }}>
              <div className="stat-label">Total Bookings</div>
              <div className="stat-value">{stats.total}</div>
            </div>
            <div className="stat-card card hoverable" onClick={() => setFilterType('all')} style={{ cursor: 'pointer' }}>
              <div className="stat-label">Last 7 Days</div>
              <div className="stat-value">{stats.recentCount}</div>
            </div>
            {Object.entries(stats.byType).map(([type, count]) => (
              <div
                className="stat-card card hoverable"
                key={type}
                style={{ '--accent': TYPE_COLORS[type], cursor: 'pointer' } as React.CSSProperties}
                onClick={() => setFilterType(type)}
              >
                <div className="stat-label">{TYPE_ICONS[type]} {TYPE_LABELS[type] ?? type}</div>
                <div className="stat-value stat-accent">{count}</div>
              </div>
            ))}
          </div>

          {/* Bookings table */}
          <div className="card" style={{ marginTop: 28 }}>
            <div className="table-header">
              <h2 className="col-title" style={{ marginBottom: 0 }}>Bookings</h2>
              <div className="filter-tabs">
                {['all', 'interview', 'coffee', 'in_person', 'ski_lesson'].map(t => (
                  <button
                    key={t}
                    className={`filter-tab ${filterType === t ? 'active' : ''}`}
                    onClick={() => setFilterType(t)}
                  >
                    {t === 'all' ? 'All' : (TYPE_ICONS[t] + ' ' + TYPE_LABELS[t])}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <p className="text-muted" style={{ padding: '20px 0' }}>No bookings found.</p>
            ) : (
              <div className="table-wrap">
                <table className="bookings-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Notes</th>
                      <th>Booked At</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(b => (
                      <tr key={b.id}>
                        <td className="td-id">{b.id}</td>
                        <td>
                          <span
                            className="type-badge"
                            style={{ '--accent': TYPE_COLORS[b.type] } as React.CSSProperties}
                          >
                            {TYPE_ICONS[b.type]} {TYPE_LABELS[b.type] ?? b.type}
                          </span>
                        </td>
                        <td>{b.date}</td>
                        <td>{b.time}</td>
                        <td><strong>{b.name}</strong></td>
                        <td><a href={`mailto:${b.email}`}>{b.email}</a></td>
                        <td>
                          <span className={`status-badge status-${b.status ?? 'confirmed'}`}>
                            {b.status ?? 'confirmed'}
                          </span>
                        </td>
                        <td className="td-notes">{b.notes ?? '—'}</td>
                        <td className="td-date">{new Date(b.created_at).toLocaleString()}</td>
                        <td>
                          <button
                            className="delete-btn"
                            onClick={() => openCancelModal(b)}
                            title="Cancel booking"
                          >
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* ──────────── SCHEDULE MANAGEMENT ──────────── */}
          <div className="card" style={{ marginTop: 28 }}>
            <div className="table-header">
              <h2 className="col-title" style={{ marginBottom: 0 }}>🗓 Schedule Overrides</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="date"
                  value={overrideDate}
                  onChange={e => setOverrideDate(e.target.value)}
                  className="override-date-input"
                  id="override-date-picker"
                />
              </div>
            </div>

            <p className="text-muted" style={{ fontSize: '0.83rem', marginBottom: 16 }}>
              Click a slot to cycle: <span className="override-legend-default">Default</span> →{' '}
              <span className="override-legend-block">🚫 Blocked</span> →{' '}
              <span className="override-legend-open">✅ Force Open</span> → Default
            </p>

            {loadingOverrides ? (
              <p className="text-muted">Loading…</p>
            ) : (
              <div className="override-grid">
                {(CANDIDATE_TIMES as readonly string[]).map(time => {
                  const action = overrides[time];
                  let cls = 'override-slot';
                  let label = time;
                  let icon = '';
                  if (action === 'block') {
                    cls += ' override-blocked';
                    icon = '🚫 ';
                  } else if (action === 'force_open') {
                    cls += ' override-open';
                    icon = '✅ ';
                  }
                  return (
                    <button
                      key={time}
                      className={cls}
                      onClick={() => toggleOverride(time)}
                      title={
                        action === 'block'
                          ? 'Blocked by host — click to force open'
                          : action === 'force_open'
                            ? 'Force opened — click to reset to default'
                            : 'Default (calendar) — click to block'
                      }
                    >
                      <span className="override-slot-icon">{icon}</span>
                      <span className="override-slot-time">{label}</span>
                      <span className="override-slot-status">
                        {action === 'block' ? 'Blocked' : action === 'force_open' ? 'Open' : 'Default'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {overrideMsg && <div className="sync-toast" style={{ marginTop: 14 }}>{overrideMsg}</div>}
          </div>
        </>
      )}

      {/* ──────────── CANCEL MODAL ──────────── */}
      {cancelModal && (
        <div className="modal-overlay" onClick={closeCancelModal} id="cancel-modal-overlay">
          <div className="modal-card" onClick={e => e.stopPropagation()} id="cancel-modal">
            <div className="modal-header">
              <h2>Cancel Booking</h2>
              <button className="modal-close" onClick={closeCancelModal} aria-label="Close">✕</button>
            </div>

            <div className="modal-body">
              <div className="modal-booking-info">
                <div className="modal-info-row">
                  <span className="modal-label">Guest</span>
                  <span><strong>{cancelModal.name}</strong> ({cancelModal.email})</span>
                </div>
                <div className="modal-info-row">
                  <span className="modal-label">Event</span>
                  <span>{TYPE_ICONS[cancelModal.type]} {TYPE_LABELS[cancelModal.type] ?? cancelModal.type}</span>
                </div>
                <div className="modal-info-row">
                  <span className="modal-label">When</span>
                  <span>{cancelModal.date} at {cancelModal.time}</span>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: 20 }}>
                <label htmlFor="cancel-reason">Cancellation Reason (optional)</label>
                <textarea
                  id="cancel-reason"
                  rows={3}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  placeholder="Leave blank to use default: &quot;Due to personal health reasons…&quot;"
                  style={{
                    background: 'var(--bg3)',
                    border: '1.5px solid var(--border)',
                    color: 'var(--text)',
                    padding: '11px 13px',
                    borderRadius: '9px',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                  }}
                />
              </div>

              <p className="modal-note">
                This will delete the booking, remove the calendar event, and send a cancellation email to the guest.
              </p>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={closeCancelModal} disabled={cancelling}>
                Keep Booking
              </button>
              <button
                className="btn btn-danger"
                onClick={handleConfirmCancel}
                disabled={cancelling}
                id="confirm-cancel-btn"
              >
                {cancelling ? '⏳ Cancelling…' : '🗑 Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

