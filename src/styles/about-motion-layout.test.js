import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const aboutCss = readFileSync(resolve(process.cwd(), 'src/styles/pages/about.css'), 'utf8');
const backToTopCss = readFileSync(resolve(process.cwd(), 'src/styles/features/back-to-top.css'), 'utf8');

function keyframes(name) {
  const start = aboutCss.indexOf(`@keyframes ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = aboutCss.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < aboutCss.length; index += 1) {
    if (aboutCss[index] === '{') depth += 1;
    if (aboutCss[index] === '}') depth -= 1;
    if (depth === 0) return aboutCss.slice(start, index + 1);
  }
  throw new Error(`Unclosed keyframes: ${name}`);
}

describe('about motion and mobile floating controls CSS', () => {
  it('keeps avatar pulse keyframes on compositor-friendly opacity and transform properties', () => {
    const pulse = keyframes('about-avatar-pulse');
    expect(pulse).not.toMatch(/box-shadow\s*:/);
    expect(pulse).toMatch(/(?:opacity|transform)\s*:/);
  });

  it('raises back-to-top only when a mobile article TOC exists and preserves the safe area', () => {
    expect(backToTopCss).toMatch(/@media \(max-width: 900px\)[\s\S]*\.app-shell:has\(\.mobile-article-toc\) \.back-to-top\s*{[\s\S]*bottom:\s*calc\([^;}]*env\(safe-area-inset-bottom/);
    expect(backToTopCss).not.toMatch(/@media \(max-width: 620px\)\s*{[\s\S]*?\.back-to-top\s*{[^}]*bottom:\s*(?:8[4-9]|9\d|\d{3,})px/);
  });

  it('separates avatar parallax transforms from ring entrance animation', () => {
    const parallaxRule = aboutCss.match(/\.about-avatar-parallax\s*{([^}]*)}/)?.[1] ?? '';
    const ringRule = aboutCss.match(/\.about-avatar-ring\s*{([^}]*)}/)?.[1] ?? '';
    expect(parallaxRule).toMatch(/transform:\s*translate/);
    expect(parallaxRule).not.toMatch(/animation\s*:/);
    expect(ringRule).toMatch(/animation:\s*about-stagger-in/);
    expect(ringRule).not.toMatch(/--about-parallax/);
  });
});
