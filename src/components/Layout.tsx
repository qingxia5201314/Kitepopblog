import React, { useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notification, clearNotification } = useApp();
  const trailRef = useRef(0);
  const isNavActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const spawnParticle = (x: number, y: number, burst = false) => {
    const count = burst ? 10 : 1;
    for (let index = 0; index < count; index += 1) {
      const particle = document.createElement('span');
      particle.className = burst ? 'pointer-particle burst' : 'pointer-particle';
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty('--dx', `${(Math.random() - 0.5) * (burst ? 90 : 26)}px`);
      particle.style.setProperty('--dy', `${(Math.random() - 0.7) * (burst ? 90 : 30)}px`);
      document.body.appendChild(particle);
      window.setTimeout(() => particle.remove(), burst ? 780 : 520);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - trailRef.current < 45) return;
    trailRef.current = now;
    spawnParticle(event.clientX, event.clientY);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLElement>) => {
    spawnParticle(event.clientX, event.clientY, true);
  };

  return (
    <main className="app-shell" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}>
      <header className="topbar">
        <button className="brand-button" onClick={() => navigate('/')} type="button">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>Kitepop SOS</strong>
            <small>Haruhi style / life / src / study / notes</small>
          </span>
          <span className="brand-status" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>
        <nav>
          <button
            aria-current={isNavActive('/') ? 'page' : undefined}
            className={isNavActive('/') ? 'active' : ''}
            onClick={() => navigate('/')}
            type="button"
          >
            阅读
          </button>
          <button
            aria-current={isNavActive('/accounting') ? 'page' : undefined}
            className={isNavActive('/accounting') ? 'active' : ''}
            onClick={() => navigate('/accounting')}
            type="button"
          >
            记账
          </button>
          <button
            aria-current={isNavActive('/files') ? 'page' : undefined}
            className={isNavActive('/files') ? 'active' : ''}
            onClick={() => navigate('/files')}
            type="button"
          >
            文件
          </button>
          <button
            aria-current={isNavActive('/images') ? 'page' : undefined}
            className={isNavActive('/images') ? 'active' : ''}
            onClick={() => navigate('/images')}
            type="button"
          >
            图床
          </button>
          <button
            aria-current={isNavActive('/admin') ? 'page' : undefined}
            className={isNavActive('/admin') ? 'active' : ''}
            onClick={() => navigate('/admin')}
            type="button"
          >
            后台
          </button>
        </nav>
      </header>

      {notification ? (
        <div
          className={`toast toast-${notification.type}`}
          key={notification.id}
          role="alert"
          style={{ '--toast-duration': `${notification.durationMs}ms` } as React.CSSProperties}
        >
          <span>{notification.message}</span>
          <button aria-label="关闭提示" onClick={clearNotification} type="button">×</button>
        </div>
      ) : null}

      <Outlet />
    </main>
  );
}
