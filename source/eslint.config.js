import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
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
    }
  }
);
