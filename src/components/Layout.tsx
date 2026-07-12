import React, { useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { BackToTop } from './BackToTop';

export function Layout() {
  const location = useLocation();
  const { notification, clearNotification, adminUnlocked, userSession } = useApp();
  const trailRef = useRef(0);
  const toolsUnlocked = Boolean(adminUnlocked || userSession);
  const isNavActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const spawnParticle = (x: number, y: number, burst = false) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
      <a className="skip-link" href="#main-content">
        跳到正文
      </a>
      <header className="topbar">
        <Link className="brand-button" to="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            <strong>Kitepop SOS</strong>
            <small>Haruhi style / life / src / study / notes</small>
          </span>
        </Link>
        <nav>
          <Link aria-current={isNavActive('/') ? 'page' : undefined} className={isNavActive('/') ? 'active' : ''} to="/">
            首页
          </Link>
          <Link
            aria-current={isNavActive('/about') ? 'page' : undefined}
            className={isNavActive('/about') ? 'active' : ''}
            to="/about"
          >
            关于我
          </Link>
          {toolsUnlocked ? (
            <details className="tool-menu">
              <summary>工具</summary>
              <div>
                <Link
                  aria-current={isNavActive('/accounting') ? 'page' : undefined}
                  className={isNavActive('/accounting') ? 'active' : ''}
                  to="/accounting"
                >
                  记账
                </Link>
                <Link
                  aria-current={isNavActive('/files') ? 'page' : undefined}
                  className={isNavActive('/files') ? 'active' : ''}
                  to="/files"
                >
                  文件
                </Link>
                <Link
                  aria-current={isNavActive('/images') ? 'page' : undefined}
                  className={isNavActive('/images') ? 'active' : ''}
                  to="/images"
                >
                  图床
                </Link>
                <Link
                  aria-current={isNavActive('/admin') ? 'page' : undefined}
                  className={isNavActive('/admin') ? 'active' : ''}
                  to="/admin"
                >
                  后台
                </Link>
              </div>
            </details>
          ) : (
            <Link
              aria-current={isNavActive('/admin') ? 'page' : undefined}
              className={isNavActive('/admin') ? 'active' : ''}
              to="/admin"
            >
              登录
            </Link>
          )}
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
          <button aria-label="关闭提示" onClick={clearNotification} type="button">
            ×
          </button>
        </div>
      ) : null}

      <div id="main-content" tabIndex={-1}>
        <Outlet />
      </div>
      <BackToTop />
    </main>
  );
}
