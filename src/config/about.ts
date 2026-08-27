/**
 * Editable content for the About page, stored in `src/data/about.json` and
 * managed through the Decap panel at /admin under Site content -> About page.
 *
 * These figures are the client's own marketing claims rather than anything the
 * site can derive, which is exactly why they live in a data file: they change
 * on the client's schedule, not on a release, and changing them should never
 * need a developer.
 */
import data from '../data/about.json';

export interface AboutStat {
  /** The headline figure, e.g. "500+". Shown large. */
  readonly value: string;
  /** Short name for the figure, e.g. "Klien Korporasi". */
  readonly label: string;
  /** Sentence or two of supporting detail. */
  readonly body: string;
}

export interface CeoWord {
  readonly heading: string;
  readonly quote: string;
  /** Optional: the panel renders the role alone when no name is given. */
  readonly name?: string;
  readonly role: string;
  /** Absolute URL in the media bucket. Blank hides the portrait. */
  readonly photo?: string;
}

/** Blank strings are how the CMS represents "not set", so treat them as absent. */
const clean = (value: string | undefined) => (value?.trim() ? value.trim() : undefined);

export const statsTitle: string = data.statsTitle;

export const aboutStats: readonly AboutStat[] = data.stats.map((stat) => ({
  value: stat.value,
  label: stat.label,
  body: stat.body,
}));

/**
 * The quote panel is skipped entirely when there is no quote, so the section
 * never renders as an empty frame while the client is still deciding on copy.
 */
export const ceo: CeoWord | undefined = clean(data.ceo?.quote)
  ? {
      heading: data.ceo.heading,
      quote: data.ceo.quote.trim(),
      name: clean(data.ceo.name),
      role: data.ceo.role,
      photo: clean(data.ceo.photo),
    }
  : undefined;
