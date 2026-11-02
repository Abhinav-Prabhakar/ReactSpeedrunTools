import * as vscode from 'vscode';
import * as path from 'path';
import StringGenerators from './stringGenerators';
import { getDependencyVersion, hasDependency, ProjectInfo } from './project';
import {
	BackupResult,
	backupFiles,
	checkCancellation,
	ensureDirectory,
	getErrorMessage,
	installSass,
	isOperationCancelled,
	pathExists,
	readTextFile,
	revealBackup,
	runWithProgress,
	writeTextFile,
} from './utils';

async function showScaffoldResult(message: string, backup?: BackupResult): Promise<void> {
	if (!backup) {
		vscode.window.showInformationMessage(message);
		return;
	}

	const action = await vscode.window.showInformationMessage(message, 'Reveal Backup');
	if (action === 'Reveal Backup') {
		await revealBackup(backup);
	}
}

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

async function getExistingFiles(files: string[]): Promise<string[]> {
	const matches = await Promise.all(files.map(file => pathExists(file)));

	return files.filter((_, index) => matches[index]);
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
	const existingFiles = await getExistingFiles([mainPath, appPath, stylePath]);
	const indexNeedsUpdate = await pathExists(indexPath) && !(await indexReferencesEntry(indexPath, entryPath));

	if (indexNeedsUpdate) {
		existingFiles.push(indexPath);
	}

	if (existingFiles.length > 0) {
		const relativeFiles = existingFiles.map(file => path.relative(project.root, file)).join('\n');
		const confirmation = await vscode.window.showWarningMessage(
			`These files already exist and will be replaced:\n${relativeFiles}\n\nA backup is created first. Continue?`,
			{ modal: true },
			'Replace files'
		);
		if (confirmation !== 'Replace files') {
			return;
		}
	}

	const backup = await backupFiles(project.root, existingFiles, 'vite-scaffold');

	try {
		await runWithProgress('React Speedrun Tools: scaffolding Vite app files', async (progress, token) => {
			progress.report({ message: 'Writing src files' });
			checkCancellation(token);
			await ensureDirectory(project.sourceRoot);
			await writeTextFile(mainPath, StringGenerators.viteMain(project.language, styleImport));
			checkCancellation(token);
			await writeTextFile(appPath, StringGenerators.viteApp());
			await writeTextFile(
				stylePath,
				StringGenerators.getBaseStyles(project.styling, project.syntax, await getTailwindMajor(project.root))
			);
			checkCancellation(token);

			progress.report({ message: 'Updating index.html' });
			if (!(await pathExists(indexPath))) {
				await writeTextFile(indexPath, StringGenerators.indexHtml(entryPath));
			} else if (indexNeedsUpdate) {
				await writeTextFile(indexPath, updateViteIndexHtml(await readTextFile(indexPath), entryPath));
			}
		});
	} catch (error) {
		if (isOperationCancelled(error)) {
			await showScaffoldResult('React Speedrun Tools: scaffolding cancelled. Some files may already have changed.', backup);
			return;
		}
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to scaffold the Vite app. ${getErrorMessage(error)}`);
		return;
	}

	await installSassIfNeeded(project);
	await warnIfTypeScriptIsMissing(project);
	await warnIfTailwindIsMissing(project);

	if (!(await hasDependency(project.root, 'vite'))) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: Vite is not installed in this project. Install vite and @vitejs/plugin-react to run these files.'
		);
	}

	await showScaffoldResult('React Speedrun Tools: Vite app files scaffolded.', backup);
}

async function scaffoldNextApp(project: ProjectInfo): Promise<void> {
	const appRoot = project.appRoot ?? path.join(project.root, 'app');
	const entryExtension = project.language === 'typescript' ? 'tsx' : 'jsx';
	const styleExtension = project.syntax === 'scss' ? 'scss' : project.syntax === 'sass' ? 'sass' : 'css';
	const layoutPath = path.join(appRoot, `layout.${entryExtension}`);
	const pagePath = path.join(appRoot, `page.${entryExtension}`);
	const stylePath = path.join(appRoot, `globals.${styleExtension}`);
	const styleImport = `./globals.${styleExtension}`;
	const existingFiles = await getExistingFiles([layoutPath, pagePath, stylePath]);

	if (existingFiles.length > 0) {
		vscode.window.showInformationMessage(
			'React Speedrun Tools: Next.js App Router files already exist. Nothing was changed.'
		);
		return;
	}

	const pagesDirectory = path.join(project.root, 'pages');
	if (await pathExists(pagesDirectory) && !(await pathExists(appRoot))) {
		vscode.window.showInformationMessage(
			'React Speedrun Tools: this looks like a Next.js Pages Router project. App Router scaffolding is not supported yet.'
		);
		return;
	}

	try {
		await runWithProgress('React Speedrun Tools: scaffolding Next.js app files', async (progress, token) => {
			progress.report({ message: 'Writing app files' });
			checkCancellation(token);
			await ensureDirectory(appRoot);
			await writeTextFile(layoutPath, StringGenerators.nextLayout(project.language, styleImport));
			checkCancellation(token);
			await writeTextFile(pagePath, StringGenerators.nextPage());
			await writeTextFile(
				stylePath,
				StringGenerators.getBaseStyles(project.styling, project.syntax, await getTailwindMajor(project.root))
			);
		});
	} catch (error) {
		if (isOperationCancelled(error)) {
			vscode.window.showInformationMessage('React Speedrun Tools: scaffolding cancelled.');
			return;
		}
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to scaffold the Next.js app. ${getErrorMessage(error)}`);
		return;
	}

	await installSassIfNeeded(project);
	await warnIfTypeScriptIsMissing(project);
	await warnIfTailwindIsMissing(project);
	vscode.window.showInformationMessage('React Speedrun Tools: Next.js App Router files scaffolded.');
}

async function indexReferencesEntry(indexPath: string, entryPath: string): Promise<boolean> {
	const content = await readTextFile(indexPath);
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

async function getTailwindMajor(root: string): Promise<number | undefined> {
	const version = await getDependencyVersion(root, 'tailwindcss');
	if (!version) {
		return undefined;
	}
	const major = Number.parseInt(version.replace(/^[^\d]*/, ''), 10);
	return Number.isNaN(major) ? undefined : major;
}

async function installSassIfNeeded(project: ProjectInfo): Promise<void> {
	const needsSass = project.syntax === 'scss' || project.syntax === 'sass';
	const hasSass = await hasDependency(project.root, 'sass') || await hasDependency(project.root, 'sass-embedded');

	if (needsSass && !hasSass) {
		await installSass(project.root);
	}
}

async function warnIfTailwindIsMissing(project: ProjectInfo): Promise<void> {
	if (project.styling === 'tailwind' && !(await hasDependency(project.root, 'tailwindcss'))) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: Tailwind CSS is selected, but tailwindcss is not installed in this project.'
		);
	}
}

async function warnIfTypeScriptIsMissing(project: ProjectInfo): Promise<void> {
	if (project.language === 'typescript' && !(await hasDependency(project.root, 'typescript'))) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: TypeScript files were created, but TypeScript is not installed in this project.'
		);
	}
}
