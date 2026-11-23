import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '**/.vite/',
      'out/',
      'node_modules/',
      'dev-app/dist/',
      'rust-sampler/',
    ],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  prettier
);
