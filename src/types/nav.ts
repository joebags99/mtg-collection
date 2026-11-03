/** The screens the app can show. Still tab-driven; a router arrives in a later step. */
export type Tab =
  | 'upload' | 'recommend' | 'search' | 'favorites' | 'mydecks' | 'stats'
  | 'detail' | 'deckbuilder' | 'compare' | 'about' | 'guides';
