import * as path from 'path';
import { pathExists, readTextFile } from './utils';

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

export async function getPackageJson(root: string): Promise<PackageJson | undefined> {
	const contents = await readTextFile(path.join(root, 'package.json'));

	if (!contents) {
		return undefined;
	}

	try {
		return JSON.parse(contents) as PackageJson;
	} catch {
		return undefined;
	}
}

export async function hasDependency(root: string, dependency: string): Promise<boolean> {
	return hasDependencyIn(await getPackageJson(root), dependency);
}

export async function getDependencyVersion(root: string, dependency: string): Promise<string | undefined> {
	const packageJson = await getPackageJson(root);

	return packageJson?.dependencies?.[dependency] ?? packageJson?.devDependencies?.[dependency];
}

function hasDependencyIn(packageJson: PackageJson | undefined, dependency: string): boolean {
	return Boolean(packageJson?.dependencies?.[dependency] || packageJson?.devDependencies?.[dependency]);
}

export async function getProjectInfo(
	root: string,
	languageSetting: LanguageSetting = 'auto',
	stylingSetting: StylingSetting = 'auto'
): Promise<ProjectInfo> {
	const packageJson = await getPackageJson(root);
	const kind = detectProjectKind(packageJson);
	const [language, styling] = await Promise.all([
		detectLanguage(root, packageJson, languageSetting),
		detectStyling(root, packageJson, stylingSetting),
	]);
	const initialSyntax = getSyntax(styling);
	const appRoot = kind === 'next' ? await getNextAppRoot(root) : undefined;
	const sourceRoot = appRoot ?? path.join(root, 'src');
	const componentsRoot = await getComponentsRoot(root, kind);
	const assetsRoot = kind === 'next' ? path.join(sourceRoot, 'assets') : path.join(root, 'src', 'assets');
	const stylesPath = await getStylesPath(root, kind, initialSyntax, appRoot);
	const syntax = getSyntaxFromPath(stylesPath) ?? initialSyntax;

	return { root, kind, language, styling, syntax, sourceRoot, componentsRoot, assetsRoot, stylesPath, appRoot };
}

function detectProjectKind(packageJson: PackageJson | undefined): ProjectKind {
	if (hasDependencyIn(packageJson, 'next')) {
		return 'next';
	}

	if (hasDependencyIn(packageJson, 'vite')) {
		return 'vite';
	}

	if (hasDependencyIn(packageJson, 'react-scripts')) {
		return 'cra';
	}

	if (hasDependencyIn(packageJson, '@remix-run/react')) {
		return 'remix';
	}

	if (hasDependencyIn(packageJson, '@react-router/dev')) {
		return 'react-router';
	}

	if (hasDependencyIn(packageJson, 'react')) {
		return 'react';
	}

	return 'unknown';
}

async function detectLanguage(
	root: string,
	packageJson: PackageJson | undefined,
	setting: LanguageSetting
): Promise<Language> {
	if (setting !== 'auto') {
		return setting;
	}

	if (hasDependencyIn(packageJson, 'typescript') || await pathExists(path.join(root, 'tsconfig.json'))) {
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
	const matches = await Promise.all(typescriptFiles.map(file => pathExists(path.join(root, file))));

	return matches.some(Boolean) ? 'typescript' : 'javascript';
}

async function detectStyling(
	root: string,
	packageJson: PackageJson | undefined,
	setting: StylingSetting
): Promise<Styling> {
	if (setting !== 'auto') {
		return setting;
	}

	if (hasDependencyIn(packageJson, 'tailwindcss')) {
		return 'tailwind';
	}

	const sassFiles = [
		'src/index.sass',
		'app/globals.sass',
		'src/app/globals.sass',
		'styles/globals.sass',
	];
	const scssFiles = [
		'src/index.scss',
		'app/globals.scss',
		'src/app/globals.scss',
		'styles/globals.scss',
	];
	const [hasSassFile, hasScssFile] = await Promise.all([
		anyPathExists(root, sassFiles),
		anyPathExists(root, scssFiles),
	]);

	if (hasSassFile) {
		return 'sass';
	}

	if (hasScssFile || hasDependencyIn(packageJson, 'sass') || hasDependencyIn(packageJson, 'sass-embedded')) {
		return 'scss';
	}

	return 'css';
}

async function anyPathExists(root: string, files: string[]): Promise<boolean> {
	const matches = await Promise.all(files.map(file => pathExists(path.join(root, file))));

	return matches.some(Boolean);
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

async function getNextAppRoot(root: string): Promise<string> {
	const srcApp = path.join(root, 'src', 'app');

	return await pathExists(srcApp) ? srcApp : path.join(root, 'app');
}

async function getComponentsRoot(root: string, kind: ProjectKind): Promise<string> {
	if (kind === 'next') {
		return await pathExists(path.join(root, 'src'))
			? path.join(root, 'src', 'components')
			: path.join(root, 'components');
	}

	if (kind === 'remix' || kind === 'react-router') {
		return path.join(root, 'app', 'components');
	}

	return path.join(root, 'src', 'components');
}

async function getStylesPath(
	root: string,
	kind: ProjectKind,
	syntax: StyleSyntax,
	appRoot?: string
): Promise<string> {
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
			path.join(root, 'styles', 'globals.scss'),
			path.join(root, 'styles', 'globals.sass'),
			path.join(root, 'styles', 'globals.css'),
		]
		: [];
	const candidates = kind === 'next'
		? nextCandidates
		: kind === 'cra'
			? [...indexCandidates.slice(3), ...indexCandidates.slice(0, 3)]
			: indexCandidates;
	const matches = await Promise.all(candidates.map(candidate => pathExists(candidate)));
	const existingIndex = matches.findIndex(Boolean);

	if (existingIndex >= 0) {
		return candidates[existingIndex];
	}

	if (kind === 'next' && appRoot) {
		return path.join(appRoot, `globals.${extension}`);
	}

	if (kind === 'cra') {
		return path.join(root, 'src', 'app.sass');
	}

	return path.join(root, 'src', `index.${extension}`);
}
