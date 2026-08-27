import { getCollection, type CollectionEntry } from 'astro:content';
import { BRANDS, CATEGORIES, type Brand, type Category } from '../config/catalog';

export type Product = CollectionEntry<'products'>;

const PREVIEW_LIMIT = 8;

const byName = (a: Product, b: Product) => a.data.name.localeCompare(b.data.name);

const featuredFirst = (products: Product[]): Product[] => [
  ...products.filter((product) => product.data.featured),
  ...products.filter((product) => !product.data.featured),
];

/** The single entry point to the collection — pages never call getCollection. */
export async function getProducts(): Promise<Product[]> {
  const products = await getCollection('products');
  return products.sort(byName);
}

export interface BrandPreview {
  brand: Brand;
  products: Product[];
}

/** Brands with no products are left out, so a toggle only offers real options. */
export async function getBrandPreviews(limit = PREVIEW_LIMIT): Promise<BrandPreview[]> {
  const products = await getProducts();
  return getUsedBrands(products).map((brand) => ({
    brand,
    products: featuredFirst(products.filter((product) => product.data.brand === brand)).slice(
      0,
      limit,
    ),
  }));
}

/** Ordered as declared in the config, not as encountered in the content. */
export function getUsedBrands(products: Product[]): Brand[] {
  const used = new Set(products.map((product) => product.data.brand));
  return BRANDS.filter((brand) => used.has(brand));
}

/** Ordered as declared in the config, not as encountered in the content. */
export function getUsedCategories(products: Product[]): Category[] {
  const used = new Set(products.map((product) => product.data.category));
  return CATEGORIES.filter((category) => used.has(category));
}

/**
 * Derived rather than authored, so frontmatter stays a plain list of paths.
 *
 * Naming the brand and category rather than saying "product photo" is what
 * makes the text worth having: it describes the image to a screen reader, and
 * it is the only text Google Images has to go on for a catalogue that never
 * writes out "Kelme football jersey" in prose. The index is dropped from the
 * first image so the main photo does not read as one of a numbered set.
 */
export function imageAlt(product: Product, index: number): string {
  const { name, brand, category } = product.data;
  const base = `${name} — ${brand} ${category.toLowerCase()}`;
  return index === 0 ? base : `${base}, view ${index + 1}`;
}

/**
 * The URL segment is the file name, which Decap derives from the product name.
 *
 * It used to be a separate field somebody had to fill in by hand, which meant
 * a required box with no obvious answer -- and a chance to type something that
 * did not match the file and quietly break the page.
 */
export function productUrl(product: Product): string {
  return `/collections/${product.id}`;
}
