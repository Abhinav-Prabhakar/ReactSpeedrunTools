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

	test('woff2 font faces use the woff2 format', () => {
		const output = StringGenerators.getFontStyling(['Poppins-Regular.woff2'], 'Poppins', 'css');

		assert.match(output, /format\("woff2"\)/);
		assert.match(output, /Poppins-Regular\.woff2/);
	});

	test('font URLs honor a custom relative prefix', () => {
		const output = StringGenerators.getFontStyling(
			['Inter.woff2'],
			'Inter',
			'css',
			'../app/assets/fonts'
		);

		assert.match(output, /url\("\.\.\/app\/assets\/fonts\/Inter\.woff2"\)/);
	});

	test('Remix root imports Remix routing primitives and the stylesheet', () => {
		const typescript = StringGenerators.remixRoot('typescript', './app.css');
		const javascript = StringGenerators.remixRoot('javascript', './app.css');

		assert.match(typescript, /from '@remix-run\/react'/);
		assert.match(typescript, /import '\.\/app\.css';/);
		assert.match(typescript, /ReactNode/);
		assert.match(typescript, /<Outlet \/>/);
		assert.doesNotMatch(javascript, /ReactNode/);
		assert.match(javascript, /<ScrollRestoration \/>/);
	});

	test('React Router root imports routing primitives from react-router', () => {
		const output = StringGenerators.reactRouterRoot('typescript', './app.css');

		assert.match(output, /from 'react-router'/);
		assert.match(output, /import '\.\/app\.css';/);
		assert.match(output, /<ScrollRestoration \/>/);
	});

	test('React Router route config registers the home route', () => {
		const typescript = StringGenerators.reactRouterRoutes('typescript');
		const javascript = StringGenerators.reactRouterRoutes('javascript');

		assert.match(typescript, /index\('routes\/home'\)/);
		assert.match(typescript, /satisfies RouteConfig/);
		assert.doesNotMatch(javascript, /satisfies RouteConfig/);
		assert.match(javascript, /index\('routes\/home'\)/);
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
