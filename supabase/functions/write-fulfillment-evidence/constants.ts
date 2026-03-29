export const MAX_BODY_BYTES = 16_384;
export const MAX_NAME_LEN = 200;
export const MAX_NOTES_LEN = 1_000;
export const MAX_URL_LEN = 2_048;

export const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
]);