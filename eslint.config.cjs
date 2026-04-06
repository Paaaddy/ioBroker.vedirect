module.exports = [
	{
		ignores: ['node_modules/**', 'admin/**'],
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			ecmaVersion: 2018,
			sourceType: 'commonjs',
			globals: {
				describe: 'readonly',
				it: 'readonly',
				before: 'readonly',
				after: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
			},
		},
		rules: {
			indent: ['error', 'tab', {SwitchCase: 1}],
			'no-console': 'off',
			'no-var': 'error',
			'prefer-const': 'error',
			quotes: ['error', 'single', {avoidEscape: true, allowTemplateLiterals: true}],
			semi: ['error', 'always'],
		},
	},
];
