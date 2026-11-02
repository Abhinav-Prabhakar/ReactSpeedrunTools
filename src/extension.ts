import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import StringGenerators from './stringGenerators';
import { Subscription } from './dataModels';
import {
	getProjectInfo,
	ProjectInfo,
	LanguageSetting,
	StylingSetting,
} from './project';
import {
	copyDirectory,
	ensureDirectory,
	ensureStyleImport,
	installSass,
	readFileIfExists,
	setOutputChannel,
	writeFileEnsuringDirectory,
} from './utils';

const BUNDLED_FONTS = ['Inter', 'Poppins', 'Plus Jakarta Sans', 'Roboto'];
const CRA_STARTER_FILES = [
	'App.css', 'App.js', 'App.jsx', 'App.test.js', 'App.test.jsx',
	'index.css', 'index.js', 'index.jsx', 'logo.svg',
	'reportWebVitals.js', 'setupTests.js',
];

let extensionPath = '';

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
		folders.map(folder => ({ label: folder.name, description: folder.uri.fsPath, folder })),
		{ placeHolder: 'Select the workspace folder to use' }
	);
	return selected?.folder.uri.fsPath;
}

function getProject(root: string): ProjectInfo {
	const configuration = vscode.workspace.getConfiguration('reactSpeedrunTools');
	return getProjectInfo(
		root,
		configuration.get<LanguageSetting>('language', 'auto'),
		configuration.get<StylingSetting>('styling', 'auto')
	);
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

async function removeBoilerplate() {
	const root = await resolveWorkspaceRoot();
	if (!root) {
		return;
	}
	const project = getProject(root);
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
	if (fs.existsSync(path.join(projectPaths.source, 'App.tsx')) || fs.existsSync(path.join(projectPaths.source, 'index.tsx'))) {
		vscode.window.showWarningMessage(
			'React Speedrun Tools: this project uses TypeScript entry files. TypeScript support is planned, so no files were changed.'
		);
		return;
	}

	const projectDescription = project.kind === 'unknown'
		? 'This folder does not look like a React project. Replace the CRA starter files in src anyway'
		: 'Replace the CRA starter files in src';
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
	const project = getProject(root);
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
	if (fs.existsSync(newComponentPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			`${componentName}.${extension} already exists. Overwrite it?`,
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
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to create ${componentName}.${extension}. ${error}`);
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
	const project = getProject(root);
	const selectedFont = await vscode.window.showQuickPick(BUNDLED_FONTS, { placeHolder: 'Select a font to add' });
	if (!selectedFont) {
		return;
	}
	const bundledFontPath = path.join(extensionPath, 'assets', 'fonts', selectedFont);
	if (!fs.existsSync(bundledFontPath)) {
		vscode.window.showErrorMessage(`React Speedrun Tools: the bundled "${selectedFont}" font could not be found.`);
		return;
	}

	try {
		const fontDestination = path.join(project.assetsRoot, 'fonts');
		ensureDirectory(fontDestination);
		copyDirectory(bundledFontPath, fontDestination);

		const fontFileNames = fs.readdirSync(fontDestination)
			.filter(fileName => isFontFileForFamily(fileName, selectedFont))
			.sort((a, b) => a.localeCompare(b));
		if (fontFileNames.length === 0) {
			vscode.window.showErrorMessage(`React Speedrun Tools: no font files were found for "${selectedFont}".`);
			return;
		}

		const fontStylesPath = getStyleModulePath(project, 'fonts');
		const existingFontStyles = readFileIfExists(fontStylesPath);
		const fontMarker = `/* ${selectedFont} */`;
		if (!existingFontStyles.includes(fontMarker)) {
			const separator = existingFontStyles.length > 0 && !existingFontStyles.endsWith('\n') ? '\n\n' : '';
			writeFileEnsuringDirectory(
				fontStylesPath,
				existingFontStyles + separator + StringGenerators.getFontStyling(fontFileNames, selectedFont, project.syntax)
			);
		}

		ensureStyleImport(project.stylesPath, project.syntax, 'fonts');
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
	const project = getProject(root);
	const colorsPath = getStyleModulePath(project, 'colors');
	if (fs.existsSync(colorsPath)) {
		const overwrite = await vscode.window.showWarningMessage(
			`${path.basename(colorsPath)} already exists. Replace it with the color variable template?`,
			{ modal: true },
			'Replace'
		);
		if (overwrite !== 'Replace') {
			return;
		}
	}

	try {
		writeFileEnsuringDirectory(colorsPath, StringGenerators.getColorVariables(project.syntax));
		ensureStyleImport(project.stylesPath, project.syntax, 'colors');
		vscode.window.showInformationMessage('React Speedrun Tools: color variables generated.');
	} catch (error) {
		vscode.window.showErrorMessage(`React Speedrun Tools: failed to generate color variables. ${error}`);
	}
}

export function activate(context: vscode.ExtensionContext) {
	const subscriptionPrefix = 'react-speedrun-tools.';
	extensionPath = context.extensionPath;
	const channel = vscode.window.createOutputChannel('React Speedrun Tools');
	setOutputChannel(channel);
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
