import * as vscode from 'vscode';
import * as path from 'path';
import StringGenerators from './stringGenerators';
import { Subscription } from './dataModels';
import { scaffoldReactApp } from './scaffold';
import {
	getProjectInfo,
	ProjectInfo,
	LanguageSetting,
	StylingSetting,
} from './project';
import {
	BackupResult,
	backupFiles,
	checkCancellation,
	copyDirectory,
	deletePath,
	ensureDirectory,
	ensureStyleImport,
	getErrorMessage,
	installSass,
	isOperationCancelled,
	listFileNames,
	log,
	pathExists,
	readTextFile,
	revealBackup,
	runWithProgress,
	setOutputChannel,
	setStorageRoot,
	writeTextFile,
} from './utils';

const BUNDLED_FONTS = ['Inter', 'Poppins', 'Plus Jakarta Sans', 'Roboto'];
const CRA_STARTER_FILES = [
	'App.css', 'App.js', 'App.jsx', 'App.test.js', 'App.test.jsx',
	'index.css', 'index.js', 'index.jsx', 'logo.svg',
	'reportWebVitals.js', 'setupTests.js',
];
const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['auto', 'javascript', 'typescript'];
const STYLING_SETTINGS: readonly StylingSetting[] = ['auto', 'css', 'scss', 'sass', 'tailwind'];
const warnedSettings = new Set<string>();

let extensionPath = '';

async function resolveWorkspaceRoot(): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders;
	if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('React Speedrun Tools: open a folder containing a React project first.');
		return undefined;
	}
	if (folders.length === 1) {
		log(`Using workspace folder: ${folders[0].uri.fsPath}`);
		return folders[0].uri.fsPath;
	}
	const selected = await vscode.window.showQuickPick(
		folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
		{ placeHolder: 'Select the workspace folder to use' }
	);
	if (selected) {
		log(`Using workspace folder: ${selected.folder.uri.fsPath}`);
	}
	return selected?.folder.uri.fsPath;
}

function readValidatedSetting<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
	const configuration = vscode.workspace.getConfiguration('reactSpeedrunTools');
	const value = configuration.get<string>(key, fallback);

	if ((allowed as readonly string[]).includes(value)) {
		return value as T;
	}

	if (!warnedSettings.has(key)) {
		warnedSettings.add(key);
		const message = `React Speedrun Tools: "${value}" is not a valid value for reactSpeedrunTools.${key}. Falling back to "${fallback}".`;
		log(message);
		vscode.window.showWarningMessage(message);
	}

	return fallback;
}

async function getProject(root: string): Promise<ProjectInfo> {
	return getProjectInfo(
		root,
		readValidatedSetting('language', LANGUAGE_SETTINGS, 'auto'),
		readValidatedSetting('styling', STYLING_SETTINGS, 'auto')
	);
}

function logProject(project: ProjectInfo): void {
	log([
		`Project: kind=${project.kind}, language=${project.language}, styling=${project.styling}, syntax=${project.syntax}`,
		`  root=${project.root}`,
		`  sourceRoot=${project.sourceRoot}`,
		`  componentsRoot=${project.componentsRoot}`,
		`  assetsRoot=${project.assetsRoot}`,
		`  stylesPath=${project.stylesPath}`,
		`  fontUrlPrefix=${project.fontUrlPrefix}`,
	].join('\n'));
}

function getLegacyCraPaths(root: string) {
	const source = path.join(root, 'src');
	return {
		source,
		components: path.join(source, 'components'),
		fonts: path.join(source, 'assets', 'fonts'),
		styles: path.join(source, 'app.sass'),
	};
}

function getStyleModulePath(project: ProjectInfo, moduleName: 'fonts' | 'colors'): string {
	const extension = project.syntax === 'scss' ? 'scss' : project.syntax === 'sass' ? 'sass' : 'css';
	const partial = project.syntax !== 'css';
	return path.join(path.dirname(project.stylesPath), `${partial ? '_' : ''}${moduleName}.${extension}`);
}

async function notify(message: string, backup?: BackupResult): Promise<void> {
	if (!backup) {
		vscode.window.showInformationMessage(message);
		return;
	}

	const action = await vscode.window.showInformationMessage(message, 'Reveal Backup');
	if (action === 'Reveal Backup') {
		await revealBackup(backup);
	}
}

async function scaffoldReactAppCommand() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = await getProject(root);
	logProject(project);

	try {
		await scaffoldReactApp(project);
	} catch (error) {
		if (isOperationCancelled(error)) {
			vscode.window.showInformationMessage('React Speedrun Tools: scaffolding cancelled.');
			return;
		}
		log(`Scaffolding failed: ${getErrorMessage(error)}`);
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to scaffold the app. ${getErrorMessage(error)}`);
	}
}

async function removeBoilerplate() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = await getProject(root);
	logProject(project);
	const projectPaths = getLegacyCraPaths(root);

	if (project.kind === 'vite') {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this looks like a Vite project. Use "Scaffold React App Files" instead; no files were changed.'
		);
		return;
	}
	if (project.kind === 'next') {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this looks like a Next.js project. The CRA cleanup command is for legacy CRA projects, so no files were changed.'
		);
		return;
	}
	if (
		await pathExists(path.join(projectPaths.source, 'App.tsx')) ||
		await pathExists(path.join(projectPaths.source, 'index.tsx'))
	) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: the legacy CRA cleanup command only supports JavaScript entry files. No files were changed.'
		);
		return;
	}

	const projectDescription = project.kind === 'unknown'
		? 'This folder does not look like a React project. Replace the CRA starter files in src anyway'
		: 'Replace the CRA starter files in src';
	const confirmation = await vscode.window.showWarningMessage(
		`${projectDescription}? This replaces the CRA starter files and the starter CSS with a minimal JavaScript setup, then installs Sass. Your other files are kept. A backup is created first.`,
		{ modal: true },
		'Replace starter files'
	);
	if (confirmation !== 'Replace starter files') {
		return;
	}

	const filesToReplace = [...new Set([
		...CRA_STARTER_FILES.map(fileName => path.join(projectPaths.source, fileName)),
		path.join(projectPaths.source, 'index.js'),
		path.join(projectPaths.source, 'App.js'),
	])];
	const backup = await backupFiles(root, filesToReplace, 'legacy-cra');

	try {
		await runWithProgress('React Speedrun Tools: cleaning legacy CRA boilerplate', async (progress, token) => {
			progress.report({ message: 'Preparing folders' });
			checkCancellation(token);
			await ensureDirectory(projectPaths.source);
			await ensureDirectory(projectPaths.components);
			await ensureDirectory(projectPaths.fonts);

			for (const fileName of CRA_STARTER_FILES) {
				checkCancellation(token);
				await deletePath(path.join(projectPaths.source, fileName));
			}

			progress.report({ message: 'Writing entry files' });
			checkCancellation(token);
			await writeTextFile(path.join(projectPaths.source, 'index.js'), StringGenerators.indexJs);
			await writeTextFile(path.join(projectPaths.source, 'App.js'), StringGenerators.appJs);

			if (!(await pathExists(projectPaths.styles))) {
				await writeTextFile(projectPaths.styles, '');
			}
		});
	} catch (error) {
		if (isOperationCancelled(error)) {
			log('Legacy CRA cleanup cancelled by the user.');
			await notify('React Speedrun Tools: cleanup cancelled. Some files may already have changed.', backup);
			return;
		}
		log(`Legacy CRA cleanup failed: ${getErrorMessage(error)}`);
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to replace the starter files. ${getErrorMessage(error)}`);
		return;
	}

	const sassInstalled = await installSass(root);
	await notify(
		sassInstalled
			? 'React Speedrun Tools: starter files replaced and Sass installed.'
			: 'React Speedrun Tools: starter files were replaced, but Sass could not be installed automatically.',
		backup
	);
}

async function createReactComponent() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = await getProject(root);
	logProject(project);
	const componentName = await vscode.window.showInputBox({
		prompt: 'Enter the name of the react component',
		placeHolder: 'Ex: Navbar',
		validateInput: value => /^[A-Z][A-Za-z0-9]*$/.test(value)
			? null
			: 'Please make sure that the component name starts with a capital letter and contains only letters and numbers.',
	});
	if (!componentName) {
		return;
	}

	const extension = project.language === 'typescript' ? 'tsx' : 'jsx';
	const newComponentPath = path.join(project.componentsRoot, `${componentName}.${extension}`);
	let backup: BackupResult | undefined;

	if (await pathExists(newComponentPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			`${componentName}.${extension} already exists. Overwrite it? A backup is created first.`,
			{ modal: true },
			'Overwrite'
		);
		if (overwrite !== 'Overwrite') {
			return;
		}
		backup = await backupFiles(root, [newComponentPath], 'component');
	}

	try {
		await writeTextFile(newComponentPath, StringGenerators.buildComponent(componentName));
		log(`Created component: ${newComponentPath}`);
		const document = await vscode.workspace.openTextDocument(newComponentPath);
		const editor = await vscode.window.showTextDocument(document);
		const lines = document.getText().split(/\r?\n/);
		const returnLineIndex = lines.findIndex(line => line.includes('return'));
		const position = returnLineIndex >= 0
			? new vscode.Position(returnLineIndex, lines[returnLineIndex].length)
			: new vscode.Position(0, 0);
		editor.selection = new vscode.Selection(position, position);

		if (backup) {
			await notify(`React Speedrun Tools: ${componentName}.${extension} replaced.`, backup);
		}
	} catch (error) {
		log(`Failed to create ${componentName}.${extension}: ${getErrorMessage(error)}`);
		vscode.window.showErrorMessage(
			`React Speedrun Tools: failed to create ${componentName}.${extension}. ${getErrorMessage(error)}`
		);
	}
}

function isFontFileForFamily(fileName: string, fontFamily: string): boolean {
	const normalizedFamily = fontFamily.replace(/\s+/g, '').toLowerCase();
	return /\.(ttf|otf|woff2?)$/i.test(fileName) && fileName.toLowerCase().startsWith(normalizedFamily);
}

async function addFont() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = await getProject(root);
	logProject(project);
	const selectedFont = await vscode.window.showQuickPick(BUNDLED_FONTS, { placeHolder: 'Select a font to add' });
	if (!selectedFont) {
		return;
	}
	const bundledFontPath = path.join(extensionPath, 'assets', 'fonts', selectedFont);
	if (!(await pathExists(bundledFontPath))) {
		log(`Bundled font folder is missing: ${bundledFontPath}`);
		vscode.window.showErrorMessage(`React Speedrun Tools: the bundled "${selectedFont}" font could not be found.`);
		return;
	}

	const fontDestination = path.join(project.assetsRoot, 'fonts');
	const fontStylesPath = getStyleModulePath(project, 'fonts');

	try {
		await runWithProgress(`React Speedrun Tools: adding ${selectedFont}`, async (progress, token) => {
			progress.report({ message: 'Copying font files' });
			checkCancellation(token);
			await copyDirectory(bundledFontPath, fontDestination);
			checkCancellation(token);

			const fontFileNames = (await listFileNames(fontDestination))
				.filter(fileName => isFontFileForFamily(fileName, selectedFont))
				.sort((a, b) => a.localeCompare(b));
			if (fontFileNames.length === 0) {
				throw new Error(`no font files were found for "${selectedFont}"`);
			}

			progress.report({ message: 'Writing font styles' });
			const existingFontStyles = await readTextFile(fontStylesPath);
			const fontMarker = `/* ${selectedFont} */`;
			if (!existingFontStyles.includes(fontMarker)) {
				const separator = existingFontStyles.length > 0 && !existingFontStyles.endsWith('\n') ? '\n\n' : '';
				await writeTextFile(
					fontStylesPath,
					existingFontStyles + separator + StringGenerators.getFontStyling(fontFileNames, selectedFont, project.syntax, project.fontUrlPrefix)
				);
			}

			checkCancellation(token);
			await ensureStyleImport(project.stylesPath, project.syntax, 'fonts');
		});

		log(`Added ${selectedFont} to ${project.assetsRoot}`);
		vscode.window.showInformationMessage(`React Speedrun Tools: ${selectedFont} added.`);
	} catch (error) {
		if (isOperationCancelled(error)) {
			vscode.window.showInformationMessage('React Speedrun Tools: adding the font was cancelled.');
			return;
		}
		log(`Failed to add ${selectedFont}: ${getErrorMessage(error)}`);
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to add ${selectedFont}. ${getErrorMessage(error)}`);
	}
}

async function generateColorVariables() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = await getProject(root);
	logProject(project);
	const colorsPath = getStyleModulePath(project, 'colors');
	let backup: BackupResult | undefined;

	if (await pathExists(colorsPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			`${path.basename(colorsPath)} already exists. Replace it with the color variable template? A backup is created first.`,
			{ modal: true },
			'Replace'
		);
		if (overwrite !== 'Replace') {
			return;
		}
		backup = await backupFiles(root, [colorsPath], 'colors');
	}

	try {
		await writeTextFile(colorsPath, StringGenerators.getColorVariables(project.syntax));
		await ensureStyleImport(project.stylesPath, project.syntax, 'colors');
		log(`Generated color variables at ${colorsPath}`);
		await notify('React Speedrun Tools: color variables generated.', backup);
	} catch (error) {
		log(`Failed to generate color variables: ${getErrorMessage(error)}`);
		vscode.window.showErrorMessage(
			`React Speedrun Tools: failed to generate color variables. ${getErrorMessage(error)}`
		);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const subscriptionPrefix = 'react-speedrun-tools.';
	extensionPath = context.extensionPath;

	const channel = vscode.window.createOutputChannel('React Speedrun Tools');
	setOutputChannel(channel);
	setStorageRoot(context.storageUri?.fsPath ?? context.globalStorageUri.fsPath);
	context.subscriptions.push(channel);

	log('React Speedrun Tools activated.');

	const createSubscriptions = (subscriptions: Subscription[]) => subscriptions.map(subscription => vscode.commands.registerCommand(subscriptionPrefix + subscription.commandId, subscription.action));

	context.subscriptions.push(...createSubscriptions([
		new Subscription('scaffoldReactApp', scaffoldReactAppCommand),
		new Subscription('removeBoilerplate', removeBoilerplate),
		new Subscription('createReactComponent', createReactComponent),
		new Subscription('addFont', addFont),
		new Subscription('generateColorVariables', generateColorVariables),
	]));
}

export function deactivate() {}
