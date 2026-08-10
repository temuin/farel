/**
 * PLACEHOLDER CONTENT — invented quotes attributed to the same placeholder
 * organisations used in clients.ts. Replace with real client testimonials,
 * and only publish a quote once that client has agreed to be named.
 */

export interface Testimonial {
  readonly quote: string;
  readonly role: string;
  readonly organisation: string;
}

export const testimonials: readonly Testimonial[] = [
  {
    quote:
      'Full kit for three age groups arrived before pre-season training started. Sizing was accurate across the board and the order process was simple.',
    role: 'Team Manager',
    organisation: 'Nusantara Air',
  },
  {
    quote:
      'We switched suppliers after one bad season with grey-market stock. Everything since has been genuine product, delivered on time.',
    role: 'Procurement Lead',
    organisation: 'Garuda Karya',
  },
  {
    quote:
      'Reordering for a new cohort every year is painless — they already have our sizing and crest details on file.',
    role: 'Athletics Coordinator',
    organisation: 'Samudra Niaga',
  },
];
