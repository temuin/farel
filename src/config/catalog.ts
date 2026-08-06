/**
 * The single source of truth for brands and categories: the content schema
 * validates markdown against these lists, the collections filter renders its
 * controls from them, and the `Brand` / `Category` types derive from them.
 * Adding a brand or category is a one-line change here.
 */

export const BRANDS = ['Kelme', 'Adidas'] as const;
export type Brand = (typeof BRANDS)[number];

export const CATEGORIES = ['Jerseys', 'Footwear', 'Accessories'] as const;
export type Category = (typeof CATEGORIES)[number];

interface BrandProfile {
  /** Replace these files with the official brand assets. */
  readonly logo: string;
  readonly summary: string;
  readonly statement: string;
}

export const BRAND_PROFILES: Readonly<Record<Brand, BrandProfile>> = {
  Kelme: {
    logo: '/brands/kelme.svg',
    summary:
      'Spanish football heritage since 1977. Match kits, training wear and indoor footwear built for club and academy programmes.',
    statement: 'Not a side line. Our Kelme catalogue is built for football, end to end.',
  },
  Adidas: {
    logo: '/brands/adidas.svg',
    summary:
      'Global performance sportswear. Team apparel, boots and team travel gear supplied through authorised distribution channels.',
    statement: 'Adidas, sourced right. Authorised stock, not a grey-market shortcut.',
  },
};
