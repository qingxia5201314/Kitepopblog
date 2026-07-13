import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homeCss = readFileSync(resolve(process.cwd(), 'src/styles/pages/home.css'), 'utf8');

function ruleBodies(selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...homeCss.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

function expectRule(selector, declarations) {
  const bodies = ruleBodies(selector);
  expect(bodies, `${selector} must have a CSS rule`).not.toHaveLength(0);
  expect(
    bodies.some((body) => declarations.every((declaration) => declaration.test(body))),
    `${selector} must contain ${declarations.map((declaration) => declaration.source).join(' and ')}`
  ).toBe(true);
}

describe('home filter stacking CSS', () => {
  it('documents the stacking-only fix', () => {
    expect(homeCss).toContain('Home filter stacking fix');
  });

  it('keeps the filter panel above the article results panel', () => {
    expectRule('.home-filter-panel', [/position:\s*relative/, /z-index:\s*3/]);
    expectRule('.home-post-panel', [/position:\s*relative/, /z-index:\s*1/]);
  });

  it('raises the open filter and its floating menu', () => {
    expectRule('.index-filters .filter-menu[open]', [/z-index:\s*40/]);
    expectRule('.index-filters .filter-menu > div', [/z-index:\s*41/]);
  });
});
