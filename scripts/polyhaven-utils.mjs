/**
 * Poly Haven API response reader. No guessed external download URL is accepted:
 * the URL must be returned by the authoritative /files/{id} endpoint.
 */
export function chooseDiffuse(data) {
  const diffuse = data?.Diffuse || data?.diffuse || data?.diffuse_map;
  if (!diffuse || typeof diffuse !== 'object') return null;
  for (const resolution of ['1k', '2k']) {
    for (const format of ['jpg','webp','png']) {
      const record = diffuse?.[resolution]?.[format];
      const url = record?.url;
      if (typeof url !== 'string') continue;
      try {
        const u = new URL(url);
        if (u.protocol !== 'https:') continue;
        if (!['dl.polyhaven.org','cdn.polyhaven.com'].includes(u.hostname)) continue;
        if (Number(record.size || 0) > 2_600_000) continue;
        return {url:u.href, resolution, format};
      } catch { /* skip invalid URL */ }
    }
  }
  return null;
}
