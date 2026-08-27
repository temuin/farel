/**
 * Structured data (JSON-LD).
 *
 * This is how the site tells Google *which company it is*, rather than leaving
 * it to infer that from prose. The search result for the company name is a
 * navigational query: Google is not judging the page, it is picking which
 * domain represents the entity "PT Amalia Utama". A page with no machine-
 * readable identity gives it nothing to work with, so the older domain keeps
 * the spot by default.
 *
 * Every page emits one `@graph` containing the Organization and WebSite nodes,
 * plus whatever describes that particular page. Nodes carry stable `@id`
 * values and reference each other by `@id`, so the same organisation is
 * recognised as one entity across the whole site instead of a fresh, unrelated
 * company on each page.
 *
 * Nothing here is invented: every value comes from `src/data/settings.json`,
 * the content collection, or the page's own props. A property with no real
 * value is left out rather than filled with a plausible guess — wrong
 * structured data is worse than none, because Google will act on it.
 */
import { contact, site, socialProfiles } from '../config/site';

/** A JSON-LD node. Loose by design; the shapes below are what constrain it. */
type Node = Record<string, unknown>;

/** Stable identifiers, so nodes on different pages resolve to one entity. */
export const ORGANIZATION_ID = `${site.url}/#organization`;
export const WEBSITE_ID = `${site.url}/#website`;

/**
 * A page URL, in exactly the form the page's own canonical tag uses.
 *
 * Astro builds every route as a directory — `/about/index.html` — so the live
 * URL, the canonical tag and the sitemap all carry a trailing slash. A path
 * written here without one would still resolve, via a redirect, but it would
 * be a *different* string to the canonical, and identifiers in structured data
 * are matched as strings. Normalising here means callers can keep passing the
 * tidy `/collections/foo` that the rest of the codebase uses.
 */
const pageUrl = (path: string) => {
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  return new URL(withSlash, site.url).href;
};

/** An asset URL — a file, so it must not be given a trailing slash. */
const assetUrl = (path: string) => new URL(path, site.url).href;

/**
 * The company itself.
 *
 * Typed as both Organization and LocalBusiness. It is genuinely both — a
 * registered company and a staffed address in Bekasi with opening hours — and
 * the two types carry different properties: `legalName` and `sameAs` come from
 * Organization, `openingHours` and `address` matter for the local listing.
 * Declaring one would have meant dropping half the detail.
 */
function organization(logoUrl: string): Node {
  return {
    '@type': ['Organization', 'LocalBusiness'],
    '@id': ORGANIZATION_ID,
    name: site.name,
    /*
     * The registered name, and the one people actually search for. Google
     * matches entities on exact strings, so "PT Amalia Utama" has to appear
     * as a value somewhere; the visible header shows the short form.
     */
    legalName: site.legalName,
    alternateName: site.alternateNames,
    url: site.url,
    logo: assetUrl(logoUrl),
    image: assetUrl('/og-default.png'),
    description: site.description,
    /* Year only. Schema.org accepts a bare year for a Date. */
    foundingDate: String(site.foundedYear),
    email: contact.email,
    /* Display format is for humans; E.164 is what machines expect. */
    telephone: `+${contact.whatsappNumber}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: [contact.address.street, contact.address.district]
        .filter(Boolean)
        .join(', '),
      addressLocality: contact.address.city,
      addressRegion: contact.address.province,
      postalCode: contact.address.postalCode,
      addressCountry: 'ID',
    },
    /*
     * Written out rather than parsed from the human-readable opening hours
     * string, which is free text in the CMS and would break the markup the
     * first time somebody rephrased it.
     */
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '17:00',
      },
    ],
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'sales',
        telephone: `+${contact.whatsappNumber}`,
        email: contact.email,
        areaServed: 'ID',
        availableLanguage: ['id', 'en'],
      },
    ],
    areaServed: { '@type': 'Country', name: 'Indonesia' },
    /*
     * The single most useful property here. Each URL is a profile Google has
     * already tied to this company; listing them from the site is what links
     * this domain to that existing entity. Omitted entirely when empty --
     * an empty array is a claim that the company has no other profiles.
     */
    ...(socialProfiles.length > 0 ? { sameAs: socialProfiles } : {}),
  };
}

function website(): Node {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    url: site.url,
    name: site.name,
    description: site.description,
    inLanguage: site.language,
    publisher: { '@id': ORGANIZATION_ID },
  };
}

export interface Crumb {
  name: string;
  /** Site-relative path. */
  path: string;
}

/**
 * The trail shown under the result in Google, and a second signal of how the
 * catalogue is organised. Built from the same list the page renders visually,
 * so the two cannot disagree.
 */
export function breadcrumbs(crumbs: readonly Crumb[]): Node {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: pageUrl(crumb.path),
    })),
  };
}

export interface ProductSchemaInput {
  name: string;
  description: string;
  brand: string;
  category: string;
  /** Absolute or site-relative image URLs; the first is the cover. */
  images: readonly string[];
  path: string;
}

/**
 * A catalogue item.
 *
 * Deliberately carries no `offers`. This is a catalogue, not a shop: there is
 * no published price and stock is quoted per enquiry, so any offer node would
 * be fabricated. Google reports that as a missing-field warning rather than an
 * error, which is the correct outcome — the page is not eligible for a price
 * rich result because the page genuinely has no price.
 */
export function product(input: ProductSchemaInput): Node {
  return {
    '@type': 'Product',
    '@id': `${pageUrl(input.path)}#product`,
    name: input.name,
    description: input.description,
    category: input.category,
    brand: { '@type': 'Brand', name: input.brand },
    image: input.images.map(assetUrl),
    url: pageUrl(input.path),
    /*
     * No `manufacturer`, deliberately. Adidas and Kelme make these; this
     * company distributes them, which is the distinction the whole site is
     * built on, and claiming otherwise in the markup would contradict the
     * page it sits on. The correct place to name a supplier is `offers.seller`
     * — and there are no offers here, for the reason above. `brand` above
     * already says whose product it is.
     */
  };
}

export interface ItemListInput {
  name: string;
  items: readonly { name: string; path: string }[];
}

/** The catalogue index, so the product pages are discoverable as a set. */
export function itemList(input: ItemListInput): Node {
  return {
    '@type': 'ItemList',
    name: input.name,
    numberOfItems: input.items.length,
    itemListElement: input.items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      url: pageUrl(item.path),
    })),
  };
}

/**
 * Wraps the per-page nodes with the two that belong on every page.
 *
 * Returns the string that goes inside the script tag. Kept as one `@graph`
 * rather than several separate script tags so the cross-references by `@id`
 * resolve within a single document.
 */
export function buildGraph(logoUrl: string, pageNodes: readonly Node[] = []): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [organization(logoUrl), website(), ...pageNodes],
  });
}
