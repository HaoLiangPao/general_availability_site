"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
import './home.css';

const EVENTS = [
  {
    id: 'interview',
    title: 'Job Interview',
    duration: '45 min',
    description: "For recruiters and hiring managers. We'll discuss the role and your open positions.",
    icon: '💼',
    color: '#58a6ff',
  },
  {
    id: 'coffee',
    title: 'Coffee Chat',
    duration: '30 min',
    description: 'A casual conversation — share ideas, network, or just say hello over (virtual) coffee.',
    icon: '☕',
    color: '#a371f7',
  },
  {
    id: 'in_person',
    title: 'In-Person Event',
    duration: '60 min',
    description: 'Face-to-face meeting for deeper collaboration, workshops, or special occasions.',
    icon: '🤝',
    color: '#3fb950',
  },
  {
    id: 'ski_lesson',
    title: 'Ski Lesson',
    duration: '60 min',
    description: 'Book a 60-minute ski class. Get ready to hit the slopes!',
    icon: '⛷️',
    color: '#00d2ff',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json();
      setSyncMsg(data.message ?? 'Synced!');
    } catch {
      setSyncMsg('Sync failed. Check console.');
    } finally {
      setIsRefreshing(false);
      setTimeout(() => setSyncMsg(''), 4000);
    }
  };

  return (
    <div className="container">
      <header className="site-header">
        <div>
          <h1 className="site-title">Book Time With Me</h1>
          <p className="site-subtitle">Choose the type of meeting you'd like to schedule.</p>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <button className="btn btn-ghost" onClick={handleRefresh} disabled={isRefreshing} id="sync-btn">
            {isRefreshing ? '⏳ Syncing…' : '🔄 Sync Calendars'}
          </button>
          <a href="/admin" className="btn btn-ghost" id="admin-btn">
            🔐 Admin
          </a>
        </div>
      </header>

      {syncMsg && (
        <div className="sync-toast" id="sync-msg">
          ✅ {syncMsg}
        </div>
      )}

      <div className="events-grid">
        {EVENTS.map(ev => (
          <button
            key={ev.id}
            id={`event-card-${ev.id}`}
            className="event-card"
            style={{ '--accent': ev.color } as React.CSSProperties}
            onClick={() => router.push(`/book/${ev.id}`)}
          >
            <div className="event-icon">{ev.icon}</div>
            <div className="event-info">
              <div className="event-header">
                <h2 className="event-title">{ev.title}</h2>
                <span className="event-duration">{ev.duration}</span>
              </div>
              <p className="event-desc">{ev.description}</p>
            </div>
            <span className="event-arrow">→</span>
          </button>
        ))}
      </div>

      <footer className="home-footer">
        <p>All times shown in your local timezone.</p>
      </footer>
    </div>
  );
}
