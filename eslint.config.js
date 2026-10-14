import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

// As regras "no-restricted-imports" abaixo protegem a arquitetura:
// regras de domínio e simulação não podem depender de Phaser nem de React,
// e a interface React não pode depender de Phaser.
const noPhaser = { name: 'phaser', message: 'Esta camada deve ser independente do Phaser.' };
const noReact = { name: 'react', message: 'Esta camada deve ser independente do React.' };

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'test-results', 'src/assets/generated'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**/*.tsx', 'src/ui/**/*.ts', 'src/app/**/*.ts', 'src/integration/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['src/domain/**/*.ts', 'src/data/**/*.ts'],
    rules: { 'no-restricted-imports': ['error', { paths: [noPhaser, noReact] }] },
  },
  {
    files: [
      'src/game/world/**/*.ts',
      'src/game/movement/**/*.ts',
      'src/game/combat/**/*.ts',
      'src/game/abilities/**/*.ts',
      'src/game/ai/**/*.ts',
      'src/game/simulation/**/*.ts',
      'src/game/persistence/**/*.ts',
      'src/game/entities/**/*.ts',
      'src/game/interaction/**/*.ts',
      'src/game/loot/**/*.ts',
      'src/game/economy/**/*.ts',
      'src/game/inventory/**/*.ts',
      'src/game/progression/**/*.ts',
    ],
    rules: { 'no-restricted-imports': ['error', { paths: [noPhaser, noReact] }] },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [noPhaser] }] },
  },
);
