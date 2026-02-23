/**
 * Shared media utilities used by both QuestionRenderer and ClueModal.
 */

/**
 * Parse a YouTube URL into an embeddable URL.
 * Returns null if the URL is not a valid YouTube link or is a /clip/ URL.
 * Supports youtu.be, youtube.com/watch, youtube.com/shorts, youtube.com/embed.
 * Preserves start/end parameters when found.
 */
export function parseYouTubeEmbed(
  url: string,
  overrideStart?: number,
  overrideEnd?: number,
): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.pathname.startsWith('/clip/')) return null;

    let id = '';
    let start = '';
    let end = '';

    if (parsed.hostname.includes('youtu.be')) {
      id = parsed.pathname.replace('/', '').split('?')[0];
      start = parsed.searchParams.get('t') || parsed.searchParams.get('start') || '';
      end = parsed.searchParams.get('end') || '';
    } else if (parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        id = parsed.pathname.replace('/shorts/', '').split('/')[0];
      } else if (parsed.pathname.startsWith('/embed/')) {
        id = parsed.pathname.replace('/embed/', '').split('/')[0];
        start = parsed.searchParams.get('start') || '';
        end = parsed.searchParams.get('end') || '';
      } else {
        id = parsed.searchParams.get('v') || '';
        start = parsed.searchParams.get('t') || parsed.searchParams.get('start') || '';
        end = parsed.searchParams.get('end') || '';
      }
    }

    if (!id) return null;

    // Strip trailing 's' from time values (e.g. "30s" → "30")
    start = start.replace(/s$/, '');

    // Allow caller to override start/end (e.g. from clue media fields)
    const finalStart = overrideStart != null && overrideStart > 0 ? String(overrideStart) : start;
    const finalEnd = overrideEnd != null && overrideEnd > 0 ? String(overrideEnd) : end;

    let embedUrl = `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
    if (finalStart) embedUrl += `&start=${encodeURIComponent(finalStart)}`;
    if (finalEnd) embedUrl += `&end=${encodeURIComponent(finalEnd)}`;
    return embedUrl;
  } catch {
    return null;
  }
}

/**
 * Detect media type from a URL if not explicitly set.
 */
export function detectMediaType(url: string): 'image' | 'video' | 'audio' {
  if (/\.(png|jpg|jpeg|gif|webp|svg)(\?|$)/i.test(url)) return 'image';
  if (/\.(mp3|wav|ogg|flac|aac|m4a)(\?|$)/i.test(url)) return 'audio';
  if (/youtube\.com|youtu\.be|\.mp4|\.webm|\.ogg/i.test(url)) return 'video';
  return 'image';
}

/**
 * Check if a URL is a YouTube clip (which can't be embedded).
 */
export function isYouTubeClipUrl(url: string): boolean {
  return /youtube\.com\/clip\//i.test(url);
}

/**
 * Check if a URL is a direct video file (mp4, webm, ogg).
 */
export function isDirectVideoFile(url: string): boolean {
  return /\.(mp4|webm|ogg)(\?|$)/i.test(url);
}
