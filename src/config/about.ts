/**
 * Everything on the About page, stored in `src/data/about.json` and managed
 * through the Decap panel at /admin under Site content -> About page.
 *
 * The whole page is content rather than code: every heading, paragraph, figure
 * and image can be changed by the client without a release. What stays in code
 * is the layout -- how many columns, where things sit, what a card looks like --
 * because that is design, not copy, and handing it over is how a page gets
 * broken by accident.
 *
 * Images are absolute URLs in the media bucket, uploaded through the same
 * picker as product photography. Optional ones are blank strings when unset,
 * which is how Decap represents an empty field, so every read goes through
 * `clean()` and the page skips the block rather than rendering an empty frame.
 */
import data from '../data/about.json';
import type { CropFocus } from '../components/RemoteImage.astro';

/** Falls back to the middle, which is what `cover` would have done anyway. */
const focus = (value: string | undefined): CropFocus => (value as CropFocus) || 'Centre';

/** Blank and whitespace-only both mean "not set" coming out of the CMS. */
const clean = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export interface AboutStat {
  readonly value: string;
  readonly label: string;
  readonly body: string;
}

export interface HowWeWorkItem {
  readonly title: string;
  /** Optional: the steps read as a sequence and often need no elaboration. */
  readonly body?: string;
}

export const hero = {
  eyebrow: data.hero.eyebrow,
  title: data.hero.title,
  description: data.hero.description,
  image: clean(data.hero.image),
  imageAlt: data.hero.imageAlt,
  imageFocus: focus(data.hero.imageFocus),
};

export const statsTitle: string = data.statsTitle;

export const aboutStats: readonly AboutStat[] = data.stats;

export const ceo = clean(data.ceo?.quote)
  ? {
      heading: data.ceo.heading,
      quote: data.ceo.quote.trim(),
      name: clean(data.ceo.name),
      role: data.ceo.role,
      photo: clean(data.ceo.photo),
      photoFocus: focus(data.ceo.photoFocus),
    }
  : undefined;

/**
 * Prose is stored as markdown so the client can write however many paragraphs
 * they want. Only paragraph breaks are honoured — the text is rendered as
 * separate <p> elements rather than run through a markdown parser, which keeps
 * the typography consistent and means a stray character cannot inject markup.
 */
export const paragraphsOf = (body: string): string[] =>
  body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

export const story = {
  heading: data.story.heading,
  paragraphs: paragraphsOf(data.story.body),
  image: clean(data.story.image),
  imageAlt: data.story.imageAlt,
  imageFocus: focus(data.story.imageFocus),
};

export const statement = {
  heading: data.statement.heading,
  paragraphs: paragraphsOf(data.statement.body),
  buttonLabel: clean(data.statement.buttonLabel),
  buttonHref: data.statement.buttonHref,
};

export const operation = {
  eyebrow: data.operation.eyebrow,
  title: data.operation.title,
  description: data.operation.description,
  imageOne: clean(data.operation.imageOne),
  imageOneAlt: data.operation.imageOneAlt,
  imageOneFocus: focus(data.operation.imageOneFocus),
  imageTwo: clean(data.operation.imageTwo),
  imageTwoAlt: data.operation.imageTwoAlt,
  imageTwoFocus: focus(data.operation.imageTwoFocus),
  /** Absolute URL in the bucket, chosen through the panel's video picker. */
  video: clean(data.operation.video),
  videoAlt: data.operation.videoAlt,
};

export const howWeWork = {
  heading: data.howWeWork.heading,
  intro: clean(data.howWeWork.intro),
  items: (data.howWeWork.items as HowWeWorkItem[]).map((item) => ({
    title: item.title,
    body: clean(item.body),
  })),
};

export const brands = {
  eyebrow: data.brands.eyebrow,
  title: data.brands.title,
  description: data.brands.description,
};
