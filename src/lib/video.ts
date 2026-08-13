/**
 * Turns a video link pasted into the CMS into an embeddable URL.
 *
 * Client staff paste whatever the browser address bar shows, and a normal
 * YouTube watch link will not load in an iframe. Anything that is not a
 * recognised YouTube or Vimeo URL returns null rather than being embedded, so
 * a typo or an arbitrary third-party page never ends up framed in the page.
 */
export function toEmbedUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;

  const host = url.hostname.replace(/^www\./, '');

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1);
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com') {
    // Already an embed link.
    if (url.pathname.startsWith('/embed/')) return `https://www.youtube.com${url.pathname}`;
    // Standard watch?v=<id> link.
    const id = url.searchParams.get('v');
    return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}` : null;
  }

  if (host === 'vimeo.com') {
    const id = url.pathname.split('/').filter(Boolean)[0];
    return /^\d+$/.test(id ?? '') ? `https://player.vimeo.com/video/${id}` : null;
  }

  if (host === 'player.vimeo.com') return url.toString();

  return null;
}
