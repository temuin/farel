/**
 * Company details.
 *
 * The client-editable values live in `src/data/settings.json` so the Decap CMS
 * panel at /admin can write them; this module types them and derives the
 * values the site actually renders. Everything below stays a plain synchronous
 * import, so no page needed changing when the data moved out.
 *
 * Technical values (production origin, nav, form key) deliberately stay here —
 * they are not things client staff should be editing.
 */
import settings from '../data/settings.json';

export const site = {
  legalName: settings.legalName,
  name: settings.name,
  tagline: settings.tagline,
  description: settings.description,
  foundedYear: settings.foundedYear,
  /** Absolute origin, no trailing slash. Overridden at build time by SITE_URL. */
  url: 'https://example.com',
};

export interface PhoneContact {
  /** Who this number reaches, e.g. "Sales" or "Corporate orders". */
  readonly label?: string;
  /** International format, digits only — this is what wa.me expects. */
  readonly whatsappNumber: string;
  /** How the number should read on the page, e.g. +62 852-8781-9415. */
  readonly phoneDisplay: string;
}

/**
 * Extra numbers beyond the main one.
 *
 * The primary stays a single value rather than becoming the first item in a
 * list, because plenty of things need exactly one: the WhatsApp button in the
 * header, the enquiry link on every product, the number in the footer. Those
 * should not have to pick a favourite from a list that might be empty.
 *
 * Entries with no number are dropped rather than rendered blank — a half-
 * filled row in the CMS should not become a dead link on the contact page.
 */
interface RawPhone {
  label?: string;
  whatsappNumber?: string;
  phoneDisplay?: string;
}

export const additionalPhones: readonly PhoneContact[] = (
  /* Typed explicitly: an empty list in the JSON infers as never[]. */
  (settings.contact.additionalPhones ?? []) as RawPhone[]
)
  .map((entry) => ({
    label: entry.label?.trim() || undefined,
    whatsappNumber: entry.whatsappNumber?.trim() ?? '',
    phoneDisplay: entry.phoneDisplay?.trim() || entry.whatsappNumber?.trim() || '',
  }))
  .filter((entry) => entry.whatsappNumber);

export const contact = {
  /** International format, digits only — this is what wa.me expects. */
  whatsappNumber: settings.contact.whatsappNumber,
  phoneDisplay: settings.contact.phoneDisplay,
  email: settings.contact.email,
  /** Optional second contact address, shown alongside the primary one on the Contact page. */
  adminEmail: settings.contact.adminEmail?.trim() || undefined,
  address: settings.contact.address,
  openingHours: settings.contact.openingHours,
};

export const addressLine = [
  contact.address.street,
  contact.address.district,
  `${contact.address.city} ${contact.address.postalCode}`,
  contact.address.country,
].join(', ');

/** Keyless embed. Swap the query for a `place_id:` once the address is real. */
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(addressLine)}&output=embed`;

/**
 * Access key from https://web3forms.com, set through /admin. Web3Forms keys are
 * public by design — they ship inside the form markup — so this is safe to
 * store in the repo and to let client staff paste in themselves.
 *
 * Empty means "not configured": the contact page then points people at
 * WhatsApp and email instead of showing a form that silently posts nowhere.
 */
export const WEB3FORMS_ACCESS_KEY = settings.web3formsAccessKey?.trim() ?? '';
export const isContactFormEnabled = WEB3FORMS_ACCESS_KEY.length > 0;

export const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/collections', label: 'Collections' },
  { href: '/contact', label: 'Contact' },
] as const;

/**
 * Where the video files are served from.
 *
 * Videos are the one asset class that does not belong in the repository: they
 * are tens of megabytes each, Astro cannot optimise them the way it does
 * images, and Cloudflare Pages rejects any single file over 25 MB. They live
 * in an R2 bucket instead.
 *
 * Set MEDIA_BASE_URL at build time to the bucket's public host, with no
 * trailing slash. Left unset, paths stay site-relative, so a checkout that
 * still has files in public/videos/ keeps working locally.
 *
 * Poster images deliberately stay in the repository -- they are a few hundred
 * kilobytes, and they are what renders before a video loads.
 */
const mediaBase = (process.env.MEDIA_BASE_URL ?? '').replace(/\/+$/, '');

/** Builds the URL for a video file, e.g. videoUrl('running-post.mp4'). */
export const videoUrl = (file: string) => `${mediaBase}/videos/${file}`;
