import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { BRANDS, CATEGORIES } from './config/catalog';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const products = defineCollection({
  loader: glob({ base: './src/content/products', pattern: '**/*.md' }),
  schema: ({ image }) =>
    z.object({
      name: z.string().min(1),
      brand: z.enum(BRANDS),
      category: z.enum(CATEGORIES),
      /** The first image doubles as the card thumbnail and the OG image. */
      images: z.array(image()).min(1),
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
