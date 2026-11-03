/** URL builders, so no component hand-assembles a path. */
export const paths = {
  collection: '/collection',
  stats: '/collection/stats',
  discover: '/discover',
  search: '/discover/search',
  favorites: '/discover/favorites',
  decks: '/decks',
  guides: '/guides',
  about: '/about',
};

export const commanderPath = (name: string) => `/commander/${encodeURIComponent(name)}`;
export const buildPath = (name: string) => `/commander/${encodeURIComponent(name)}/build`;
