import * as path from 'path';
import type { Language, Styling, StyleSyntax } from './project';

function getFontWeight(fileName: string): string | undefined {
	const orderedWeights: Array<[RegExp, string]> = [
		[/thin/, '100'],
		[/extralight|ultralight/, '200'],
		[/light/, '300'],
		[/medium/, '500'],
		[/semibold|demibold/, '600'],
		[/extrabold|ultrabold/, '800'],
		[/black|heavy/, '900'],
		[/bold/, '700'],
		[/regular|normal/, '400'],
	];

	for (const [pattern, weight] of orderedWeights) {
		if (pattern.test(fileName)) {
			return weight;
		}
	}

	return undefined;
}

function getFontFormat(fileName: string): string {
	switch (path.extname(fileName).toLowerCase()) {
		case '.otf':
			return 'opentype';
		case '.woff':
			return 'woff';
		case '.woff2':
			return 'woff2';
		default:
			return 'truetype';
	}
}

export default class StringGenerators {
	public static readonly indexJs = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
	<React.StrictMode>
	<App />
	</React.StrictMode>
);`;

	public static readonly appJs = `import './app.sass';

function App() {
	return <h1>Hello, world!</h1>
}

export default App;`;

	public static readonly buildComponent = (name: string) => `const ${name} = () => {
	return 
}

export default ${name};`;

	public static readonly colorVariablesTemplate = `// Edit these values to match your design.
$primary-color: #3b82f6
$primary-text: #0f172a
$secondary-color: #64748b
$secondary-text: #f8fafc
`;

	public static readonly getColorVariables = (syntax: StyleSyntax): string => {
		if (syntax === 'css') {
			return `:root {
  --primary-color: #3b82f6;
  --primary-text: #0f172a;
  --secondary-color: #64748b;
  --secondary-text: #f8fafc;
}
`;
		}

		const terminator = syntax === 'scss' ? ';' : '';

		return `// Edit these values to match your design.
$primary-color: #3b82f6${terminator}
$primary-text: #0f172a${terminator}
$secondary-color: #64748b${terminator}
$secondary-text: #f8fafc${terminator}
`;
	};

	public static readonly getFontStyling = (
		fontFileNames: string[],
		fontFamily: string,
		syntax: StyleSyntax = 'sass',
		fontUrlPrefix: string = './assets/fonts'
	): string => {
		const baseUrl = fontUrlPrefix.replace(/\/+$/, '') || '.';
		const fontFaces = [...fontFileNames]
			.sort((a, b) => a.localeCompare(b))
			.map(fileName => {
				const baseName = path.parse(fileName).name.toLowerCase();
				const isItalic = baseName.includes('italic');
				const isVariable = baseName.includes('variable') || (fontFamily === 'Inter' && baseName === 'inter');
				const weight = getFontWeight(baseName);

				return {
					family: fontFamily,
					style: isItalic ? 'italic' : 'normal',
					weight: isVariable ? '100 900' : weight ?? '400',
					fileName,
					format: getFontFormat(fileName),
				};
			});

		const renderedFaces = fontFaces.map(face => syntax === 'sass'
			? `@font-face
\tfont-family: "${face.family}"
\tfont-style: ${face.style}
\tfont-weight: ${face.weight}
\tfont-display: swap
\tsrc: url("${baseUrl}/${face.fileName}") format("${face.format}")`
			: `@font-face {
  font-family: "${face.family}";
  font-style: ${face.style};
  font-weight: ${face.weight};
  font-display: swap;
  src: url("${baseUrl}/${face.fileName}") format("${face.format}");
}`).join('\n\n');

		return `/* ${fontFamily} */\n${renderedFaces}\n`;
	};

	public static readonly getBaseStyles = (styling: Styling, syntax: StyleSyntax, tailwindMajor?: number): string => {
		if (styling === 'tailwind') {
			return tailwindMajor !== undefined && tailwindMajor < 4
				? '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
				: '@import "tailwindcss";\n';
		}

		if (syntax === 'sass') {
			return `:root
\tfont-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
\tcolor: #0f172a
\tbackground-color: #f8fafc

*
\tbox-sizing: border-box

body
\tmargin: 0
\tmin-height: 100vh
`;
		}

		return `:root {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #0f172a;
  background-color: #f8fafc;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
}
`;
	};

	public static readonly viteMain = (language: Language, styleImport: string): string => {
		const rootExpression = language === 'typescript'
			? "document.getElementById('root')!"
			: "document.getElementById('root')";

		return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import '${styleImport}';

ReactDOM.createRoot(${rootExpression}).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
`;
	};

	public static readonly viteApp = (): string => `function App() {
  return <h1>Hello, world!</h1>;
}

export default App;
`;

	public static readonly nextLayout = (language: Language, styleImport: string): string => {
		if (language === 'typescript') {
			return `import type { ReactNode } from 'react';
import '${styleImport}';

export const metadata = {
  title: 'React App',
  description: 'Created with React Speedrun Tools',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
		}

		return `import '${styleImport}';

export const metadata = {
  title: 'React App',
  description: 'Created with React Speedrun Tools',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
	};

	public static readonly nextPage = (): string => `export default function Home() {
  return <h1>Hello, world!</h1>;
}
`;

	public static readonly remixRoot = (language: Language, styleImport: string): string => {
		if (language === 'typescript') {
			return `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import type { ReactNode } from 'react';
import '${styleImport}';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
		}

		return `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from '@remix-run/react';
import '${styleImport}';

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
	};

	public static readonly reactRouterRoot = (language: Language, styleImport: string): string => {
		if (language === 'typescript') {
			return `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { ReactNode } from 'react';
import '${styleImport}';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
		}

		return `import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import '${styleImport}';

export function Layout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
`;
	};

	public static readonly homePage = (): string => `export default function Home() {
  return <h1>Hello, world!</h1>;
}
`;

	public static readonly reactRouterRoutes = (language: Language): string => language === 'typescript'
		? `import { type RouteConfig, index } from '@react-router/dev/routes';

export default [index('routes/home')] satisfies RouteConfig;
`
		: `import { index } from '@react-router/dev/routes';

export default [index('routes/home')];
`;

	public static readonly indexHtml = (entryPath: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="${entryPath}"></script>
  </body>
</html>
`;
}
