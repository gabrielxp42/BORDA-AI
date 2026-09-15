import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {ignores: ['dist/**', 'node_modules/**', '.tmp/**', 'design/**', 'test-results/**', 'playwright-report/**']},
  {files: ['src/utils/embroidery/**/*.ts', 'src/utils/embroideryParser.ts', 'src/components/ui/Embroidery*.tsx', 'tests/**/*.mjs', 'scripts/*embroidery*.mjs'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {globals: {console: 'readonly', process: 'readonly', Buffer: 'readonly', URL: 'readonly', File: 'readonly', Blob: 'readonly', TextDecoder: 'readonly', Uint8Array: 'readonly', DataView: 'readonly'}},
    rules: {'no-undef': 'off', '@typescript-eslint/no-unused-vars': ['error', {argsIgnorePattern: '^_'}]},
  },
  // Legacy screens contain existing any types. Keep those outside this parser
  // lint gate; TypeScript checks the entire application with npm run typecheck.
  {files: ['src/pages/Matrizes.tsx', 'src/components/orders/SmartCalculatorWorkflow.tsx'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {'no-undef': 'off', '@typescript-eslint/no-unused-vars': 'off', '@typescript-eslint/no-explicit-any': 'off', 'prefer-const': 'off', '@typescript-eslint/no-empty-object-type': 'off'},
  },
);
