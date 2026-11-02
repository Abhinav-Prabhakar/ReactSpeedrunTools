import * as assert from 'assert';
import StringGenerators from '../../stringGenerators';

suite('StringGenerators', () => {
	test('CSS color variables use custom properties', () => {
		const output = StringGenerators.getColorVariables('css');

		assert.match(output, /:root\s*\{/);
		assert.match(output, /--primary-color:\s*#3b82f6;/);
		assert.match(output, /--secondary-text:\s*#f8fafc;/);
	});

	test('SCSS color variables use Sass variables with semicolons', () => {
		const output = StringGenerators.getColorVariables('scss');

		assert.match(output, /\$primary-color: #3b82f6;/);
		assert.doesNotMatch(output, /:root/);
	});

	test('Sass color variables omit semicolons', () => {
		const output = StringGenerators.getColorVariables('sass');

		assert.match(output, /\$primary-color: #3b82f6\n/);
		assert.doesNotMatch(output, /#3b82f6;/);
	});

	test('font faces include weights, italics, formats and correct URLs', () => {
		const output = StringGenerators.getFontStyling(
			['Poppins-BoldItalic.ttf', 'Poppins-Regular.ttf'],
			'Poppins',
			'css'
		);

		assert.match(output, /font-family: "Poppins";/);
		assert.match(output, /font-weight: 400;/);
		assert.match(output, /font-weight: 700;/);
		assert.match(output, /font-style: italic;/);
		assert.match(output, /font-display: swap;/);
		assert.match(output, /url\("\.\/assets\/fonts\/Poppins-BoldItalic\.ttf"\) format\("truetype"\)/);
		assert.doesNotMatch(output, /\.ttf\.ttf/);
	});

	test('variable fonts use a weight range', () => {
		const output = StringGenerators.getFontStyling(['Inter.ttf'], 'Inter', 'scss');

		assert.match(output, /font-weight: 100 900;/);
	});

	test('Sass font faces use indented syntax', () => {
		const output = StringGenerators.getFontStyling(['Poppins-Regular.ttf'], 'Poppins', 'sass');

		assert.match(output, /@font-face\n\tfont-family: "Poppins"/);
		assert.match(output, /\n\tfont-weight: 400\n/);
		assert.doesNotMatch(output, /\{/);
	});

	test('base styles match the requested syntax', () => {
		const css = StringGenerators.getBaseStyles('css', 'css');
		const sass = StringGenerators.getBaseStyles('css', 'sass');

		assert.match(css, /:root \{/);
		assert.match(sass, /:root\n\tfont-family:/);
		assert.doesNotMatch(sass, /\{/);
	});

	test('Tailwind base styles depend on the installed major version', () => {
		const v3 = StringGenerators.getBaseStyles('tailwind', 'css', 3);
		const v4 = StringGenerators.getBaseStyles('tailwind', 'css', 4);

		assert.match(v3, /@tailwind base;/);
		assert.match(v4, /@import "tailwindcss";/);
	});

	test('Vite TypeScript entry asserts the root element exists', () => {
		const typescript = StringGenerators.viteMain('typescript', './index.css');
		const javascript = StringGenerators.viteMain('javascript', './index.css');

		assert.match(typescript, /getElementById\('root'\)!/);
		assert.doesNotMatch(javascript, /getElementById\('root'\)!/);
	});
});
