export function normalizeImageUrl(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    const isLocalHttp =
      url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
    if (url.protocol === 'https:' || isLocalHttp) return url.toString();
  } catch {
    return undefined;
  }

  return undefined;
}
