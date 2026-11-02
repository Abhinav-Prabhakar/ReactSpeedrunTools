import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import StringGenerators from './stringGenerators';
import { getDependencyVersion, hasDependency, ProjectInfo } from './project';
import { ensureDirectory, installSass, readFileIfExists, writeFileEnsuringDirectory } from './utils';

export async function scaffoldReactApp(project: ProjectInfo): Promise<void> {
	switch (project.kind) {
		case 'next':
			await scaffoldNextApp(project);
			return;
		case 'vite':
			await scaffoldViteApp(project);
			return;
		case 'react': {
			const proceed = await vscode.window.showWarningMessage(
				'React Speedrun Tools: this project does not appear to use Vite or Next.js. Scaffold Vite-style files anyway?',
				{ modal: true },
				'Scaffold Vite files'
			);
			if (proceed === 'Scaffold Vite files') {
				await scaffoldViteApp(project);
			}
			return;
		}
		case 'cra':
			vscode.window.showInformationMessage(
				'React Speedrun Tools: this is a legacy CRA project. Use "Clean Legacy CRA Boilerplate And Install Sass" instead.'
			);
			return;
		case 'remix':
		case 'react-router':
			vscode.window.showInformationMessage(
				'React Speedrun Tools: scaffolding for Remix and React Router is not supported yet.'
			);
			return;
		default:
			vscode.window.showWarningMessage(
				'React Speedrun Tools: no React project detected. Create one with `npm create vite@latest` first.'
			);
	}
}

async function scaffoldViteApp(project: ProjectInfo): Promise<void> {
	const entryExtension = project.language === 'typescript' ? 'tsx' : 'jsx';
	const styleExtension = project.syntax === 'scss' ? 'scss' : project.syntax === 'sass' ? 'sass' : 'css';
	const mainPath = path.join(project.sourceRoot, `main.${entryExtension}`);
	const appPath = path.join(project.sourceRoot, `App.${entryExtension}`);
	const stylePath = path.join(project.sourceRoot, `index.${styleExtension}`);
	const styleImport = `./index.${styleExtension}`;
	const indexPath = path.join(project.root, 'index.html');
	const entryPath = `/src/main.${entryExtension}`;
	const existingFiles = [mainPath, appPath, stylePath].filter(file => fs.existsSync(file));
	const indexNeedsUpdate = fs.existsSync(indexPath) && !indexReferencesEntry(indexPath, entryPath);

	if (indexNeedsUpdate) {
		existingFiles.push(indexPath);
	}

	if (existingFiles.length > 0) {
		const relativeFiles = existingFiles.map(file => path.relative(project.root, file)).join('\n');
		const confirmation = await vscode.window.showWarningMessage(
			`These files already exist and will be replaced:\n${relativeFiles}\n\nContinue?`,
			{ modal: true },
			'Replace files'
		);
		if (confirmation !== 'Replace files') {
			return;
		}
	}

	try {
		ensureDirectory(project.sourceRoot);
		writeFileEnsuringDirectory(mainPath, StringGenerators.viteMain(project.language, styleImport));
		writeFileEnsuringDirectory(appPath, StringGenerators.viteApp());
		writeFileEnsuringDirectory(
			stylePath,
			StringGenerators.getBaseStyles(project.styling, project.syntax, getTailwindMajor(project.root))
		);

		if (!fs.existsSync(indexPath)) {
			writeFileEnsuringDirectory(indexPath, StringGenerators.indexHtml(entryPath));
		} else if (indexNeedsUpdate) {
			writeFileEnsuringDirectory(indexPath, updateViteIndexHtml(readFileIfExists(indexPath), entryPath));
		}
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to scaffold the Vite app. ${error}`);
		return;
	}

	if (project.syntax === 'scss' || project.syntax === 'sass') {
		await installSass(project.root);
	}

	warnIfTypeScriptIsMissing(project);
	vscode.window.showInformationMessage('React Speedrun Tools: Vite app files scaffolded.');
}

async function scaffoldNextApp(project: ProjectInfo): Promise<void> {
	const appRoot = project.appRoot ?? path.join(project.root, 'app');
	const entryExtension = project.language === 'typescript' ? 'tsx' : 'jsx';
	const styleExtension = project.syntax === 'scss' ? 'scss' : project.syntax === 'sass' ? 'sass' : 'css';
	const layoutPath = path.join(appRoot, `layout.${entryExtension}`);
	const pagePath = path.join(appRoot, `page.${entryExtension}`);
	const stylePath = path.join(appRoot, `globals.${styleExtension}`);
	const styleImport = `./globals.${styleExtension}`;
	const existingFiles = [layoutPath, pagePath, stylePath].filter(file => fs.existsSync(file));

	if (existingFiles.length > 0) {
		vscode.window.showInformationMessage(
			'React Speedrun Tools: Next.js App Router files already exist. Nothing was changed.'
		);
		return;
	}

	const pagesDirectory = path.join(project.root, 'pages');
	if (fs.existsSync(pagesDirectory) && !fs.existsSync(appRoot)) {
		vscode.window.showInformationMessage(
			'React Speedrun Tools: this looks like a Next.js Pages Router project. App Router scaffolding is not supported yet.'
		);
		return;
	}

	try {
		ensureDirectory(appRoot);
		writeFileEnsuringDirectory(layoutPath, StringGenerators.nextLayout(project.language, styleImport));
		writeFileEnsuringDirectory(pagePath, StringGenerators.nextPage());
		writeFileEnsuringDirectory(
			stylePath,
			StringGenerators.getBaseStyles(project.styling, project.syntax, getTailwindMajor(project.root))
		);
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to scaffold the Next.js app. ${error}`);
		return;
	}

	if (project.syntax === 'scss' || project.syntax === 'sass') {
		await installSass(project.root);
	}

	warnIfTypeScriptIsMissing(project);
	vscode.window.showInformationMessage('React Speedrun Tools: Next.js App Router files scaffolded.');
}

function indexReferencesEntry(indexPath: string, entryPath: string): boolean {
	const content = readFileIfExists(indexPath);
	const scriptTag = content.match(/<script\b[^>]*\btype=["']module["'][^>]*>/i)?.[0];
	const source = scriptTag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];

	return source === entryPath;
}

function updateViteIndexHtml(content: string, entryPath: string): string {
	let updated = content;

	if (!/\bid=["']root["']/i.test(updated)) {
		updated = updated.replace(/<body[^>]*>/i, match => `${match}\n    <div id="root"></div>`);
	}

	const scriptTag = `<script type="module" src="${entryPath}"></script>`;
	if (/<script\b[^>]*\btype=["']module["'][^>]*><\/script>/i.test(updated)) {
		return updated.replace(/<script\b[^>]*\btype=["']module["'][^>]*><\/script>/i, scriptTag);
	}

	if (/<\/body>/i.test(updated)) {
		return updated.replace(/<\/body>/i, `  ${scriptTag}\n  </body>`);
	}

	return `${updated}\n${scriptTag}\n`;
}

function getTailwindMajor(root: string): number | undefined {
	const version = getDependencyVersion(root, 'tailwindcss');
	if (!version) {
		return undefined;
	}
	const major = Number.parseInt(version.replace(/^[^\d]*/, ''), 10);
	return Number.isNaN(major) ? undefined : major;
}

function warnIfTypeScriptIsMissing(project: ProjectInfo): void {
	if (project.language === 'typescript' && !hasDependency(project.root, 'typescript')) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: TypeScript files were created, but TypeScript is not installed in this project.'
		);
	}
}
