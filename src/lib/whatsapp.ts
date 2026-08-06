import { contact } from '../config/site';

export function whatsappUrl(message: string): string {
  return `https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(message)}`;
}

export function generalEnquiryUrl(): string {
  return whatsappUrl('Hello, I would like to know more about your Kelme and Adidas catalogue.');
}

export function productEnquiryUrl(productName: string): string {
  return whatsappUrl(`Hello, I would like to enquire about "${productName}".`);
}
