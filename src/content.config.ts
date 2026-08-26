import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { BRANDS, CATEGORIES, SPORTS } from './config/catalog';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const products = defineCollection({
  loader: glob({ base: './src/content/products', pattern: '**/*.md' }),
  schema: () =>
    z.object({
      name: z.string().min(1),
      brand: z.enum(BRANDS),
      category: z.enum(CATEGORIES),
      /** Second-level Collections filter, revealed once a category is picked.
       * Omitted for items that aren't tied to one sport (caps, socks, lifestyle sneakers). */
      sport: z.enum(SPORTS).optional(),
      /**
       * Absolute URLs of the originals in the R2 bucket. These are full
       * resolution: Astro downloads them at build time and generates the
       * sized WebP variants the site actually serves, so nothing this large
       * ever reaches a visitor.
       *
       * Stored as whole URLs rather than bare object keys because Decap uses
       * the stored value directly as the <img> src when it previews a photo
       * in the admin panel; a bare key would render as a broken image there.
       *
       * The first one doubles as the card thumbnail and the OG image.
       */
      images: z.array(z.url()).min(1),
      /** Also used as the meta description on detail pages. */
      description: z.string().min(1).max(200),
      /** URL segment under /collections/. Keep it matching the filename. */
      slug: z
        .string()
        .regex(SLUG_PATTERN, 'Slug must be lowercase words separated by single hyphens'),
      /** Sorts the product first within its brand's landing page preview. */
      featured: z.boolean().default(false),
    }),
});

export const collections = { products };
