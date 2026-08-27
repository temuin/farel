/**
 * Editable content for the home page, stored in `src/data/home.json` and
 * managed through the Decap panel at /admin under Site content -> Home page.
 *
 * Same split as the About page: wording and media are content, layout is not.
 * What stays in code here is everything structural — the brand toggle, the
 * collection previews, the client marquee and the testimonial list all render
 * themselves from the catalogue and their own data, so they are not repeated
 * as fields.
 */
import data from '../data/home.json';

const clean = (value: string | undefined): string | undefined =>
  value?.trim() ? value.trim() : undefined;

export interface Highlight {
  readonly value: string;
  readonly label: string;
}

/**
 * A tile in the "Photos from the field" grid.
 *
 * One list rather than separate photo and video lists, because the grid
 * interleaves them and the order is the point. A tile shows whichever of the
 * two is filled in, video first — so swapping a photo for a clip is a matter
 * of setting one field, not moving the tile between two lists.
 */
export type TileShape = 'Square' | 'Portrait' | 'Tall';

/**
 * How a clip behaves. Worth being a per-tile choice rather than a rule: the
 * short atmosphere clips should loop on their own, but the client testimonial
 * is 29 MB and autoplaying it would start that download for every visitor who
 * merely reached the home page.
 */
export type Playback = 'Loop silently' | 'Play on click';

export interface GalleryTile {
  readonly shape: TileShape;
  readonly image?: string;
  readonly video?: string;
  readonly alt: string;
  readonly playback?: Playback;
}

/** Tailwind cannot see class names built at runtime, so they are spelled out. */
export const TILE_ASPECT: Record<TileShape, string> = {
  Square: 'aspect-square',
  Portrait: 'aspect-[4/5]',
  Tall: 'aspect-[9/16]',
};

export const hero = {
  title: data.hero.title,
  body: data.hero.body,
  primaryLabel: clean(data.hero.primaryLabel),
  primaryHref: data.hero.primaryHref,
  secondaryLabel: clean(data.hero.secondaryLabel),
  secondaryHref: data.hero.secondaryHref,
};

export const highlights: readonly Highlight[] = data.highlights;

export const collections = {
  eyebrow: data.collections.eyebrow,
  title: data.collections.title,
  description: data.collections.description,
  buttonLabel: clean(data.collections.buttonLabel),
  buttonHref: data.collections.buttonHref,
};

export const trusted = data.trusted;
export const stories = data.stories;

export const gallery = {
  heading: data.gallery.heading,
  /** Tiles with neither a photo nor a video are dropped rather than left blank. */
  tiles: (data.gallery.tiles as GalleryTile[])
    .map((tile) => ({
      shape: (TILE_ASPECT[tile.shape] ? tile.shape : 'Portrait') as TileShape,
      image: clean(tile.image),
      video: clean(tile.video),
      alt: tile.alt,
      // Anything unset stays a quiet looping clip, which is the common case.
      loops: tile.playback !== 'Play on click',
    }))
    .filter((tile) => tile.image || tile.video),
};

export const closing = {
  title: data.closing.title,
  body: data.closing.body,
  buttonLabel: clean(data.closing.buttonLabel),
  buttonHref: data.closing.buttonHref,
};
