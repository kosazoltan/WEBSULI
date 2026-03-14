import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
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
