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

export const contact = {
  /** International format, digits only — this is what wa.me expects. */
  whatsappNumber: settings.contact.whatsappNumber,
  phoneDisplay: settings.contact.phoneDisplay,
  email: settings.contact.email,
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
