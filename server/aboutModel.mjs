const GITHUB_URL_ERROR = '请输入有效的 GitHub 个人主页链接'

export function emptyAboutProfile() {
  return {
    avatarUrl: '',
    displayName: '',
    identityTags: [],
    intro: '',
    githubUrl: '',
    content: '',
    updatedAt: '',
  }
}

export function normalizeAboutProfile(input = {}) {
  const displayName = stringValue(input.displayName).trim()
  const avatarUrl = stringValue(input.avatarUrl).trim()
  const intro = stringValue(input.intro).trim()
  const content = stringValue(input.content)
  const identityTags = normalizeIdentityTags(input.identityTags)

  if (!displayName) throw new Error('名称不能为空')
  if (displayName.length > 80) throw new Error('名称不能超过 80 个字符')
  if (identityTags.length > 8) throw new Error('身份标签不能超过 8 个')
  if (identityTags.some((tag) => tag.length > 30)) throw new Error('身份标签不能超过 30 个字符')
  if (intro.length > 280) throw new Error('简介不能超过 280 个字符')
  if (content.length > 100000) throw new Error('内容不能超过 100000 个字符')

  return {
    avatarUrl,
    displayName,
    identityTags,
    intro,
    githubUrl: normalizeGithubUrl(input.githubUrl),
    content,
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : '',
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value : ''
}

function normalizeIdentityTags(value) {
  if (!Array.isArray(value)) return []

  const tags = []
  const seen = new Set()
  for (const valueItem of value) {
    const tag = stringValue(valueItem).trim()
    const key = tag.toLocaleLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}

function normalizeGithubUrl(value) {
  const githubUrl = stringValue(value).trim()
  if (!githubUrl) return ''

  try {
    const url = new URL(githubUrl)
    if (
      url.protocol !== 'https:'
      || url.hostname !== 'github.com'
      || url.username
      || url.password
      || url.pathname === '/'
    ) {
      throw new Error(GITHUB_URL_ERROR)
    }
    const normalizedPathname = url.pathname.replace(/\/+$/, '')
    if (!normalizedPathname) throw new Error(GITHUB_URL_ERROR)
    url.pathname = normalizedPathname
    return url.toString()
  } catch {
    throw new Error(GITHUB_URL_ERROR)
  }
}
