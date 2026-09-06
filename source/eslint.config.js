import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // Leading underscore marks a binding that is deliberately unused
      // (Express `_req`/`_next`, destructuring-away a secret: `const { password: _, ...rest }`).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-require-imports': 'warn',
      'no-console': 'warn',
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
      'no-constant-binary-expression': 'warn',
      'prefer-const': 'warn',
      'preserve-caught-error': 'warn',
      // #310 class: hooks after an early return crash the page. exhaustive-deps
      // stays off — enabling it would flood the 0-warning gate without closing
      // the crash hole.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
    }
  }
);
