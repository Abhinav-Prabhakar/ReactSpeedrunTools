import * as path from 'path';

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

	public static readonly getFontStyling = (fontFileNames: string[], fontFamily: string): string => {
		const isSingleFile = fontFileNames.length === 1;

		const fontFaces = [...fontFileNames]
			.sort((a, b) => a.localeCompare(b))
			.map(fileName => {
				const baseName = path.parse(fileName).name.toLowerCase();
				const isItalic = baseName.includes('italic');
				const isVariable = baseName.includes('variable');
				const weight = getFontWeight(baseName);
				const fontWeight = isVariable || (isSingleFile && !weight) ? '100 900' : weight ?? '400';

				return `@font-face
	font-family: "${fontFamily}"
	font-style: ${isItalic ? 'italic' : 'normal'}
	font-weight: ${fontWeight}
	font-display: swap
	src: url("./assets/fonts/${fileName}") format("${getFontFormat(fileName)}")`;
			})
			.join('\n\n');

		return `/* ${fontFamily} */\n${fontFaces}\n`;
	};
}
