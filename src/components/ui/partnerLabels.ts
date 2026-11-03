import type { PartnerType } from '../../types/api';

/** Short badge text for a partner mechanic. */
export const PARTNER_BADGE: Record<PartnerType, string> = {
  '': '',
  partner: 'Partner',
  partner_with: 'Partner with',
  partner_variant: 'Partner',
  choose_a_background: 'Background',
  background: 'BG',
  friends_forever: 'Friends',
  doctors_companion: 'Companion',
  doctor: 'Doctor',
};

/** Heading for the partner picker. */
export const PARTNER_HEADING: Record<PartnerType, string> = {
  '': 'Partner',
  partner: 'Partner',
  partner_with: 'Partner With',
  partner_variant: 'Partner',
  choose_a_background: 'Choose a Background',
  background: 'Background For',
  friends_forever: 'Friends Forever',
  doctors_companion: "Doctor's Companion For",
  doctor: 'Doctor For',
};
