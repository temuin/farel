/**
 * Client testimonials, edited through the Decap CMS panel at /admin and stored
 * in `src/data/testimonials.json`.
 *
 * PLACEHOLDER CONTENT until the client supplies real quotes — only publish a
 * quote once that client has agreed to be named.
 */
import data from '../data/testimonials.json';

export interface Testimonial {
  readonly quote: string;
  readonly role: string;
  readonly organisation: string;
  /**
   * Optional embed URL (YouTube/Vimeo). Videos are linked rather than uploaded:
   * this is a git-backed CMS, and committing video files would bloat the repo
   * and slow every clone and build.
   */
  readonly videoUrl?: string;
}

/** Blank strings are how the CMS represents "not set", so treat them as absent. */
export const testimonials: readonly Testimonial[] = data.items.map((item) => ({
  quote: item.quote,
  role: item.role,
  organisation: item.organisation,
  videoUrl: item.videoUrl?.trim() ? item.videoUrl.trim() : undefined,
}));
