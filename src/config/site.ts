/**
 * Company details.
 *
 * PLACEHOLDER CONTENT — nothing else in the codebase hardcodes these details,
 * so editing this file updates the header, footer, contact page, WhatsApp
 * links, map embed and SEO metadata at once.
 */

export const site = {
  /** TODO: confirm the registered entity name (e.g. whether it carries "PT"). */
  legalName: 'Amalia Utama',
  name: 'Amalia Utama',
  /** TODO: confirm the exact distributor wording each brand permits. The
   * company logo reads "Indonesia official adidas B2B distributor". */
  tagline: 'Indonesia official Kelme & Adidas B2B distributor',
  description:
    'Authorised Indonesian distributor of Kelme and Adidas team sportswear. Browse the catalogue of jerseys, footwear and accessories for clubs, schools and retailers.',
  /** Absolute origin, no trailing slash. */
  url: 'https://example.com',
  foundedYear: 2010,
} as const;

export const contact = {
  /** International format, digits only — this is what wa.me expects. */
  whatsappNumber: '6281234567890',
  phoneDisplay: '+62 812-3456-7890',
  /** TODO: guessed from the company domain — confirm before launch. */
  email: 'info@amaliautama.com',
  address: {
    street: 'Jl. Contoh Raya No. 123, Blok B',
    district: 'Kebayoran Baru',
    city: 'Jakarta Selatan',
    province: 'DKI Jakarta',
    postalCode: '12190',
    country: 'Indonesia',
  },
  openingHours: 'Monday – Friday, 09.00 – 17.00 WIB',
} as const;

export const addressLine = [
  contact.address.street,
  contact.address.district,
  `${contact.address.city} ${contact.address.postalCode}`,
  contact.address.country,
].join(', ');

/** Keyless embed. Swap the query for a `place_id:` once the address is real. */
export const mapEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(addressLine)}&output=embed`;

/** Replace with the key from https://web3forms.com. */
export const WEB3FORMS_ACCESS_KEY = 'REPLACE_WITH_YOUR_WEB3FORMS_ACCESS_KEY';

export const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/collections', label: 'Collections' },
  { href: '/contact', label: 'Contact' },
] as const;
