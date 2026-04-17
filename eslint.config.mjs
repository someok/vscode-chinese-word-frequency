import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    typescript: true,
  },
  {
    ignores: [
      '**/tasks.md',
      'example/**',
    ],
    rules: {
      'no-console': 'off',
      'jsonc/sort-array-values': 'off',
      'jsonc/sort-keys': 'off',
    },
  },
)
