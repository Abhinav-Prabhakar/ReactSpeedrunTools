import * as fs from 'fs';
import * as path from 'path';

export type ProjectKind = 'vite' | 'next' | 'cra' | 'remix' | 'react-router' | 'react' | 'unknown';
export type Language = 'javascript' | 'typescript';
export type Styling = 'css' | 'scss' | 'sass' | 'tailwind';
export type LanguageSetting = 'auto' | Language;
export type StylingSetting = 'auto' | Styling;
export type StyleSyntax = 'css' | 'scss' | 'sass';

export interface PackageJson {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
}

export interface ProjectInfo {
	root: string;
	kind: ProjectKind;
	language: Language;
	styling: Styling;
	syntax: StyleSyntax;
	sourceRoot: string;
	componentsRoot: string;
	assetsRoot: string;
	stylesPath: string;
	appRoot?: string;
}

export function getPackageJson(root: string): PackageJson | undefined {
	const packageJsonPath = path.join(root, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })) as PackageJson;
	} catch {
		return undefined;
	}
}

export function hasDependency(root: string, dependency: string): boolean {
	const packageJson = getPackageJson(root);

	return Boolean(packageJson?.dependencies?.[dependency] || packageJson?.devDependencies?.[dependency]);
}

export function getDependencyVersion(root: string, dependency: string): string | undefined {
	const packageJson = getPackageJson(root);

	return packageJson?.dependencies?.[dependency] ?? packageJson?.devDependencies?.[dependency];
}

export function getProjectInfo(
	root: string,
	languageSetting: LanguageSetting = 'auto',
	stylingSetting: StylingSetting = 'auto'
): ProjectInfo {
	const kind = detectProjectKind(root);
	const language = detectLanguage(root, languageSetting);
	const styling = detectStyling(root, stylingSetting);
	const initialSyntax = getSyntax(styling);
	const appRoot = kind === 'next' ? getNextAppRoot(root) : undefined;
	const sourceRoot = appRoot ?? path.join(root, 'src');
	const componentsRoot = getComponentsRoot(root, kind);
	const assetsRoot = kind === 'next' ? path.join(sourceRoot, 'assets') : path.join(root, 'src', 'assets');
	const stylesPath = getStylesPath(root, kind, initialSyntax, appRoot);
	const syntax = getSyntaxFromPath(stylesPath) ?? initialSyntax;

	return { root, kind, language, styling, syntax, sourceRoot, componentsRoot, assetsRoot, stylesPath, appRoot };
}

function detectProjectKind(root: string): ProjectKind {
	if (hasDependency(root, 'next')) {
		return 'next';
	}

	if (hasDependency(root, 'vite')) {
		return 'vite';
	}

	if (hasDependency(root, 'react-scripts')) {
		return 'cra';
	}

	if (hasDependency(root, '@remix-run/react')) {
		return 'remix';
	}

	if (hasDependency(root, '@react-router/dev')) {
		return 'react-router';
	}

	if (hasDependency(root, 'react')) {
		return 'react';
	}

	return 'unknown';
}

function detectLanguage(root: string, setting: LanguageSetting): Language {
	if (setting !== 'auto') {
		return setting;
	}

	if (fs.existsSync(path.join(root, 'tsconfig.json')) || hasDependency(root, 'typescript')) {
		return 'typescript';
	}

	const typescriptFiles = [
		'src/main.tsx',
		'src/main.ts',
		'src/index.tsx',
		'src/index.ts',
		'src/App.tsx',
		'app/layout.tsx',
		'app/page.tsx',
		'src/app/layout.tsx',
		'src/app/page.tsx',
	];

	return typescriptFiles.some(file => fs.existsSync(path.join(root, file))) ? 'typescript' : 'javascript';
}

function detectStyling(root: string, setting: StylingSetting): Styling {
	if (setting !== 'auto') {
		return setting;
	}

	if (hasDependency(root, 'tailwindcss')) {
		return 'tailwind';
	}

	if (
		fs.existsSync(path.join(root, 'src/index.sass')) ||
		fs.existsSync(path.join(root, 'app/globals.sass')) ||
		fs.existsSync(path.join(root, 'src/app/globals.sass'))
	) {
		return 'sass';
	}

	if (
		fs.existsSync(path.join(root, 'src/index.scss')) ||
		fs.existsSync(path.join(root, 'app/globals.scss')) ||
		fs.existsSync(path.join(root, 'src/app/globals.scss'))
	) {
		return 'scss';
	}

	if (hasDependency(root, 'sass') || hasDependency(root, 'sass-embedded')) {
		return 'scss';
	}

	return 'css';
}

function getSyntax(styling: Styling): StyleSyntax {
	return styling === 'scss' ? 'scss' : styling === 'sass' ? 'sass' : 'css';
}

function getSyntaxFromPath(stylesPath: string): StyleSyntax | undefined {
	switch (path.extname(stylesPath).toLowerCase()) {
		case '.scss':
			return 'scss';
		case '.sass':
			return 'sass';
		case '.css':
			return 'css';
		default:
			return undefined;
	}
}

function getNextAppRoot(root: string): string {
	const srcApp = path.join(root, 'src', 'app');

	return fs.existsSync(srcApp) ? srcApp : path.join(root, 'app');
}

function getComponentsRoot(root: string, kind: ProjectKind): string {
	if (kind === 'next') {
		return fs.existsSync(path.join(root, 'src')) ? path.join(root, 'src', 'components') : path.join(root, 'components');
	}

	if (kind === 'remix' || kind === 'react-router') {
		return path.join(root, 'app', 'components');
	}

	return path.join(root, 'src', 'components');
}

function getStylesPath(root: string, kind: ProjectKind, syntax: StyleSyntax, appRoot?: string): string {
	const extension = syntax === 'scss' ? 'scss' : syntax === 'sass' ? 'sass' : 'css';
	const indexCandidates = [
		path.join(root, 'src', 'index.scss'),
		path.join(root, 'src', 'index.sass'),
		path.join(root, 'src', 'index.css'),
		path.join(root, 'src', 'app.scss'),
		path.join(root, 'src', 'app.sass'),
		path.join(root, 'src', 'app.css'),
	];
	const nextCandidates = appRoot
		? [
			path.join(appRoot, 'globals.scss'),
			path.join(appRoot, 'globals.sass'),
			path.join(appRoot, 'globals.css'),
		]
		: [];
	const candidates = kind === 'next'
		? nextCandidates
		: kind === 'cra'
			? [...indexCandidates.slice(3), ...indexCandidates.slice(0, 3)]
			: indexCandidates;
	const existing = candidates.find(candidate => fs.existsSync(candidate));

	if (existing) {
		return existing;
	}

	if (kind === 'next' && appRoot) {
		return path.join(appRoot, `globals.${extension}`);
	}

	if (kind === 'cra') {
		return path.join(root, 'src', 'app.sass');
	}

	return path.join(root, 'src', `index.${extension}`);
}
