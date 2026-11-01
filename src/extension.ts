import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import StringGenerators from './stringGenerators';
import { Subscription } from './dataModels';

interface ProjectPaths {
	root: string;
	source: string;
	components: string;
	assets: string;
	fonts: string;
	styles: string;
}

interface PackageManager {
	command: string;
	args: string[];
}

const BUNDLED_FONTS = ['Inter', 'Poppins', 'Plus Jakarta Sans', 'Roboto'];
const CRA_STARTER_FILES = [
	'App.css',
	'App.js',
	'App.jsx',
	'App.test.js',
	'App.test.jsx',
	'index.css',
	'index.js',
	'index.jsx',
	'logo.svg',
	'reportWebVitals.js',
	'setupTests.js',
];

let extensionPath = '';
let outputChannel: vscode.OutputChannel | undefined;

function getProjectPaths(root: string): ProjectPaths {
	const source = path.join(root, 'src');
	const assets = path.join(source, 'assets');

	return {
		root,
		source,
		components: path.join(source, 'components'),
		assets,
		fonts: path.join(assets, 'fonts'),
		styles: path.join(source, 'app.sass'),
	};
}

async function resolveWorkspaceRoot(): Promise<string | undefined> {
	const folders = vscode.workspace.workspaceFolders;

	if (!folders || folders.length === 0) {
		vscode.window.showErrorMessage('React Speedrun Tools: open a folder containing a React project first.');
		return undefined;
	}

	if (folders.length === 1) {
		return folders[0].uri.fsPath;
	}

	const selected = await vscode.window.showQuickPick(
		folders.map(folder => ({
			label: folder.name,
			description: folder.uri.fsPath,
			folder,
		})),
		{ placeHolder: 'Select the workspace folder to use' }
	);

	return selected?.folder.uri.fsPath;
}

function ensureDirectory(directory: string): void {
	fs.mkdirSync(directory, { recursive: true });
}

function readFileIfExists(filePath: string): string {
	return fs.existsSync(filePath) ? fs.readFileSync(filePath, { encoding: 'utf-8' }) : '';
}

function writeFileEnsuringDirectory(filePath: string, contents: string): void {
	ensureDirectory(path.dirname(filePath));
	fs.writeFileSync(filePath, contents);
}

function copyDirectory(source: string, destination: string): void {
	ensureDirectory(destination);

	for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
		const sourceEntry = path.join(source, entry.name);
		const destinationEntry = path.join(destination, entry.name);

		if (entry.isDirectory()) {
			copyDirectory(sourceEntry, destinationEntry);
		} else {
			fs.copyFileSync(sourceEntry, destinationEntry);
		}
	}
}

function ensureSassImport(stylesPath: string, moduleName: string): void {
	const existingStyles = readFileIfExists(stylesPath);
	const importPattern = new RegExp(`@(use|import)\\s+["']?${moduleName}["']?`);

	if (importPattern.test(existingStyles)) {
		return;
	}

	writeFileEnsuringDirectory(stylesPath, `@use "${moduleName}" as *\n${existingStyles}`);
}

function getPackageJson(root: string): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | undefined {
	const packageJsonPath = path.join(root, 'package.json');

	if (!fs.existsSync(packageJsonPath)) {
		return undefined;
	}

	try {
		return JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf-8' }));
	} catch {
		return undefined;
	}
}

function hasDependency(root: string, dependency: string): boolean {
	const packageJson = getPackageJson(root);

	return Boolean(packageJson?.dependencies?.[dependency] || packageJson?.devDependencies?.[dependency]);
}

function isReactProject(root: string): boolean {
	return hasDependency(root, 'react');
}

function detectPackageManager(root: string): PackageManager {
	if (fs.existsSync(path.join(root, 'bun.lockb')) || fs.existsSync(path.join(root, 'bun.lock'))) {
		return { command: 'bun', args: ['add', '-d', 'sass'] };
	}

	if (fs.existsSync(path.join(root, 'pnpm-lock.yaml'))) {
		return { command: 'pnpm', args: ['add', '-D', 'sass'] };
	}

	if (fs.existsSync(path.join(root, 'yarn.lock'))) {
		return { command: 'yarn', args: ['add', '--dev', 'sass'] };
	}

	return { command: 'npm', args: ['install', '--save-dev', 'sass'] };
}

async function installSass(root: string): Promise<boolean> {
	const packageManager = detectPackageManager(root);

	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `React Speedrun Tools: installing Sass with ${packageManager.command}…`,
		cancellable: false,
	}, () => new Promise<boolean>((resolve) => {
		outputChannel?.appendLine(`Running: ${packageManager.command} ${packageManager.args.join(' ')} (cwd: ${root})`);

		const child = spawn(packageManager.command, packageManager.args, {
			cwd: root,
			shell: process.platform === 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		child.stdout?.on('data', (data: Buffer) => outputChannel?.append(data.toString()));
		child.stderr?.on('data', (data: Buffer) => outputChannel?.append(data.toString()));

		child.on('error', (error) => {
			outputChannel?.appendLine(`Failed to start ${packageManager.command}: ${error.message}`);
			vscode.window.showErrorMessage(
				`React Speedrun Tools: could not run ${packageManager.command}. Is it installed?`,
				'Show Output'
			).then(action => {
				if (action === 'Show Output') {
					outputChannel?.show();
				}
			});
			resolve(false);
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve(true);
				return;
			}

			outputChannel?.appendLine(`${packageManager.command} exited with code ${code}.`);
			vscode.window.showErrorMessage(
				`React Speedrun Tools: failed to install Sass (exit code ${code}).`,
				'Show Output'
			).then(action => {
				if (action === 'Show Output') {
					outputChannel?.show();
				}
			});
			resolve(false);
		});
	}));
}

async function removeBoilerplate() {
	const root = await resolveWorkspaceRoot();

	if (!root) {
		return;
	}

	const projectPaths = getProjectPaths(root);

	if (hasDependency(root, 'vite')) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this looks like a Vite project. The CRA cleanup command is for legacy CRA projects, so no files were changed.'
		);
		return;
	}

	if (hasDependency(root, 'next')) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this looks like a Next.js project. The CRA cleanup command is for legacy CRA projects, so no files were changed.'
		);
		return;
	}

	if (fs.existsSync(path.join(projectPaths.source, 'App.tsx')) || fs.existsSync(path.join(projectPaths.source, 'index.tsx'))) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this project uses TypeScript entry files. TypeScript support is planned, so no files were changed.'
		);
		return;
	}

	const projectDescription = isReactProject(root)
		? 'Replace the CRA starter files in src'
		: 'This folder does not look like a React project. Replace the CRA starter files in src anyway';
	const confirmation = await vscode.window.showWarningMessage(
		`${projectDescription}? This replaces the CRA starter files and the starter CSS with a minimal JavaScript setup, then installs Sass. Your other files are kept.`,
		{ modal: true },
		'Replace starter files'
	);

	if (confirmation !== 'Replace starter files') {
		return;
	}

	try {
		ensureDirectory(projectPaths.source);
		ensureDirectory(projectPaths.components);
		ensureDirectory(projectPaths.fonts);

		for (const fileName of CRA_STARTER_FILES) {
			fs.rmSync(path.join(projectPaths.source, fileName), { force: true });
		}

		fs.writeFileSync(path.join(projectPaths.source, 'index.js'), StringGenerators.indexJs);
		fs.writeFileSync(path.join(projectPaths.source, 'App.js'), StringGenerators.appJs);

		if (!fs.existsSync(projectPaths.styles)) {
			fs.writeFileSync(projectPaths.styles, '');
		}
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to replace the starter files. ${error}`);
		return;
	}

	const sassInstalled = await installSass(root);

	if (sassInstalled) {
		vscode.window.showInformationMessage('React Speedrun Tools: starter files replaced and Sass installed.');
	} else {
		vscode.window.showWarningMessage('React Speedrun Tools: starter files were replaced, but Sass could not be installed automatically.');
	}
}

async function createReactComponent() {
	const root = await resolveWorkspaceRoot();

	if (!root) {
		return;
	}

	const projectPaths = getProjectPaths(root);
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

	const newComponentPath = path.join(projectPaths.components, `${componentName}.jsx`);

	if (fs.existsSync(newComponentPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			`${componentName}.jsx already exists. Overwrite it?`,
			{ modal: true },
			'Overwrite'
		);

		if (overwrite !== 'Overwrite') {
			return;
		}
	}

	try {
		writeFileEnsuringDirectory(newComponentPath, StringGenerators.buildComponent(componentName));

		const document = await vscode.workspace.openTextDocument(newComponentPath);
		const editor = await vscode.window.showTextDocument(document);
		const lines = document.getText().split(/\r?\n/);
		const returnLineIndex = lines.findIndex(line => line.includes('return'));
		const position = returnLineIndex >= 0
			? new vscode.Position(returnLineIndex, lines[returnLineIndex].length)
			: new vscode.Position(0, 0);

		editor.selection = new vscode.Selection(position, position);
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to create ${componentName}.jsx. ${error}`);
	}
}

function isFontFileForFamily(fileName: string, fontFamily: string): boolean {
	const normalizedFamily = fontFamily.replace(/\s+/g, '').toLowerCase();
	const normalizedFileName = fileName.toLowerCase();

	return /\.(ttf|otf|woff2?)$/i.test(fileName) && normalizedFileName.startsWith(normalizedFamily);
}

async function addFont() {
	const root = await resolveWorkspaceRoot();

	if (!root) {
		return;
	}

	const projectPaths = getProjectPaths(root);
	const selectedFont = await vscode.window.showQuickPick(BUNDLED_FONTS, {
		placeHolder: 'Select a font to add',
	});

	if (!selectedFont) {
		return;
	}

	const bundledFontPath = path.join(extensionPath, 'assets', 'fonts', selectedFont);

	if (!fs.existsSync(bundledFontPath)) {
		vscode.window.showErrorMessage(`React Speedrun Tools: the bundled "${selectedFont}" font could not be found.`);
		return;
	}

	try {
		ensureDirectory(projectPaths.fonts);
		copyDirectory(bundledFontPath, projectPaths.fonts);

		const fontFileNames = fs.readdirSync(projectPaths.fonts)
			.filter(fileName => isFontFileForFamily(fileName, selectedFont))
			.sort((a, b) => a.localeCompare(b));

		if (fontFileNames.length === 0) {
			vscode.window.showErrorMessage(`React Speedrun Tools: no font files were found for "${selectedFont}".`);
			return;
		}

		const fontStylesPath = path.join(projectPaths.source, '_fonts.sass');
		const existingFontStyles = readFileIfExists(fontStylesPath);
		const fontMarker = `/* ${selectedFont} */`;

		if (!existingFontStyles.includes(fontMarker)) {
			writeFileEnsuringDirectory(fontStylesPath, StringGenerators.getFontStyling(fontFileNames, selectedFont) + existingFontStyles);
		}

		ensureSassImport(projectPaths.styles, 'fonts');
		vscode.window.showInformationMessage(`React Speedrun Tools: ${selectedFont} added.`);
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to add ${selectedFont}. ${error}`);
	}
}

async function generateColorVariables() {
	const root = await resolveWorkspaceRoot();

	if (!root) {
		return;
	}

	const projectPaths = getProjectPaths(root);
	const colorsPath = path.join(projectPaths.source, '_colors.sass');

	if (fs.existsSync(colorsPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			'_colors.sass already exists. Replace it with the color variable template?',
			{ modal: true },
			'Replace'
		);

		if (overwrite !== 'Replace') {
			return;
		}
	}

	try {
		writeFileEnsuringDirectory(colorsPath, StringGenerators.colorVariablesTemplate);
		ensureSassImport(projectPaths.styles, 'colors');
		vscode.window.showInformationMessage('React Speedrun Tools: color variables generated.');
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to generate color variables. ${error}`);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const subscriptionPrefix = 'react-speedrun-tools.';
	extensionPath = context.extensionPath;

	const channel = vscode.window.createOutputChannel('React Speedrun Tools');
	outputChannel = channel;
	context.subscriptions.push(channel);

	const createSubscriptions = (subscriptions: Subscription[]) => subscriptions.map(subscription => vscode.commands.registerCommand(subscriptionPrefix + subscription.commandId, subscription.action));

	context.subscriptions.push(...createSubscriptions([
		new Subscription('removeBoilerplate', removeBoilerplate),
		new Subscription('createReactComponent', createReactComponent),
		new Subscription('addFont', addFont),
		new Subscription('generateColorVariables', generateColorVariables),
	]));
}

export function deactivate() {}
