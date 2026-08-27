import { contact } from '../config/site';

/**
 * wa.me needs a number in full international form, digits only: no plus, no
 * spaces, and crucially no leading zero.
 *
 * Indonesian numbers are almost always written locally as 0878..., and that is
 * what someone naturally types into the admin panel. Pasted straight into a
 * wa.me link it produces a URL WhatsApp cannot resolve, and because the button
 * still looks perfectly normal the breakage is invisible until a customer
 * taps it and nothing happens. So normalise here rather than trusting the
 * stored value: a local 0-prefixed number becomes 62..., and anything already
 * in international form is left alone.
 */
function toInternational(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(message: string): string {
  return `https://wa.me/${toInternational(contact.whatsappNumber)}?text=${encodeURIComponent(message)}`;
}

export function generalEnquiryUrl(): string {
  return whatsappUrl('Hello, I would like to know more about your Kelme and Adidas catalogue.');
}

export function productEnquiryUrl(productName: string): string {
  return whatsappUrl(`Hello, I would like to enquire about "${productName}".`);
}
