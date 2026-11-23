import type { MagnifierAPI } from '../src/types';

declare global {
  interface Window {
    magnifierAPI: MagnifierAPI;
  }
}
