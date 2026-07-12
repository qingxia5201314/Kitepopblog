import { describe, expect, it } from 'vitest'

import { emptyAboutProfile, normalizeAboutProfile } from './aboutModel.mjs'

describe('about profile contract', () => {
  it('provides an empty profile with stable fields', () => {
    expect(emptyAboutProfile()).toEqual({
      avatarUrl: '',
      displayName: '',
      identityTags: [],
      intro: '',
      githubUrl: '',
      content: '',
      updatedAt: '',
    })
  })

  it('normalizes whitespace, tags, and a GitHub profile URL', () => {
    expect(normalizeAboutProfile({
      avatarUrl: '  https://example.test/avatar.png  ',
      displayName: '  Kite  ',
      identityTags: [' Developer ', 'developer', ' Blogger ', 'BLOGGER'],
      intro: '  Hello there.  ',
      githubUrl: '  https://github.com/KitePPP/  ',
      content: '  keep markdown whitespace  ',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })).toEqual({
      avatarUrl: 'https://example.test/avatar.png',
      displayName: 'Kite',
      identityTags: ['Developer', 'Blogger'],
      intro: 'Hello there.',
      githubUrl: 'https://github.com/KitePPP',
      content: '  keep markdown whitespace  ',
      updatedAt: '2026-07-12T10:00:00.000Z',
    })
  })

  it('requires a non-empty display name', () => {
    expect(() => normalizeAboutProfile({ displayName: '   ' })).toThrow()
  })

  it.each([
    'http://github.com/KitePPP',
    'https://www.github.com/KitePPP',
    'https://github.com',
    'https://user:pass@github.com/KitePPP',
    'https://example.com/KitePPP',
  ])('rejects non-profile GitHub URL %s', (githubUrl) => {
    expect(() => normalizeAboutProfile({ displayName: 'Kite', githubUrl }))
      .toThrow('请输入有效的 GitHub 个人主页链接')
  })

  it('accepts all field length and collection boundaries', () => {
    const identityTags = Array.from({ length: 8 }, (_, index) => `${index}`.repeat(30))
    const profile = normalizeAboutProfile({
      displayName: 'n'.repeat(80),
      identityTags,
      intro: 'i'.repeat(280),
      content: 'c'.repeat(100000),
    })

    expect(profile.displayName).toHaveLength(80)
    expect(profile.identityTags).toEqual(identityTags)
    expect(profile.intro).toHaveLength(280)
    expect(profile.content).toHaveLength(100000)
  })

  it.each([
    ['displayName', { displayName: 'n'.repeat(81) }],
    ['identityTags count', { displayName: 'Kite', identityTags: Array.from({ length: 9 }, (_, index) => String(index)) }],
    ['identity tag length', { displayName: 'Kite', identityTags: ['t'.repeat(31)] }],
    ['intro', { displayName: 'Kite', intro: 'i'.repeat(281) }],
    ['content', { displayName: 'Kite', content: 'c'.repeat(100001) }],
  ])('rejects values beyond the %s boundary', (_field, input) => {
    expect(() => normalizeAboutProfile(input)).toThrow()
  })
})
