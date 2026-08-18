/**
 * Real client and partner logos for the "trusted by" marquee, supplied
 * directly by PT Amalia Utama. Keep this list to organisations that have
 * agreed to have their logo shown.
 */

export interface Client {
  readonly name: string;
  readonly logo: string;
}

export const clients: readonly Client[] = [
  { name: 'Bank Tabungan Negara', logo: '/clients/btn.png' },
  { name: 'Bank Mandiri', logo: '/clients/mandiri.png' },
  { name: 'Bank Mega', logo: '/clients/bank-mega.png' },
  { name: 'Maybank', logo: '/clients/maybank.png' },
  { name: 'Adira Finance', logo: '/clients/adira-finance.png' },
  { name: 'Schneider Electric', logo: '/clients/schneider-electric.png' },
  { name: 'Komatsu', logo: '/clients/komatsu.png' },
  { name: 'Valvoline', logo: '/clients/valvoline.png' },
  { name: 'Pernod Ricard', logo: '/clients/pernod-ricard.png' },
  { name: 'HP', logo: '/clients/hp.png' },
  { name: 'Westin Hotels & Resorts', logo: '/clients/westin-hotels-resorts.png' },
  { name: 'Four Seasons', logo: '/clients/four-seasons.png' },
  { name: 'Peruri', logo: '/clients/peruri.png' },
  { name: 'Badan Intelijen Negara', logo: '/clients/bin.png' },
  { name: 'Kementerian Imigrasi dan Pemasyarakatan', logo: '/clients/kementerian-imigrasi-pemasyarakatan.png' },
  { name: 'Dinas Pemuda dan Olahraga', logo: '/clients/dispora.png' },
];
