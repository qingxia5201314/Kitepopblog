import { useEffect, useRef, useState } from 'react';

const VISIBILITY_THRESHOLD = 400;

function isPastThreshold() {
  return window.scrollY > VISIBILITY_THRESHOLD;
}

export function BackToTop() {
  const [isVisible, setIsVisible] = useState(isPastThreshold);
  const visibilityRef = useRef(isVisible);

  useEffect(() => {
    const handleScroll = () => {
      const nextVisibility = isPastThreshold();
      if (nextVisibility === visibilityRef.current) return;
      visibilityRef.current = nextVisibility;
      setIsVisible(nextVisibility);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    const reduceMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  return (
    <button
      aria-hidden={!isVisible}
      aria-label="回到页面顶部"
      className={`back-to-top ${isVisible ? 'is-visible' : 'is-hidden'}`}
      onClick={scrollToTop}
      tabIndex={isVisible ? 0 : -1}
      type="button"
    >
      ↑
    </button>
  );
}
