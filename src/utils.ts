import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';
import type { StyleSyntax } from './project';

export interface PackageManager {
	command: string;
	args: string[];
}

export interface BackupResult {
	directory: string;
	files: string[];
}

let outputChannel: vscode.OutputChannel | undefined;
let storageRoot: string | undefined;

export class OperationCancelledError extends Error {
	public constructor() {
		super('Operation cancelled');
		this.name = 'OperationCancelledError';
	}
}

export function setOutputChannel(channel: vscode.OutputChannel): void {
	outputChannel = channel;
}

export function setStorageRoot(root: string): void {
	storageRoot = root;
}

export function log(message: string): void {
	outputChannel?.appendLine(message);
}

export function showOutput(): void {
	outputChannel?.show(true);
}

export function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function isOperationCancelled(error: unknown): boolean {
	return error instanceof OperationCancelledError;
}

export function checkCancellation(token: vscode.CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new OperationCancelledError();
	}
}

export function runWithProgress<T>(
	title: string,
	task: (progress: vscode.Progress<{ message?: string }>, token: vscode.CancellationToken) => Promise<T>
): Thenable<T> {
	return vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title,
			cancellable: true,
		},
		task
	);
}

function toUri(filePath: string): vscode.Uri {
	return vscode.Uri.file(filePath);
}

function isMissingFile(error: unknown): boolean {
	if (typeof error !== 'object' || error === null || !('code' in error)) {
		return false;
	}

	const code = (error as { code?: string }).code;
	return code === 'FileNotFound' || code === 'EntryNotFound' || code === 'ENOENT';
}

export async function pathExists(filePath: string): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(toUri(filePath));
		return true;
	} catch (error) {
		if (isMissingFile(error)) {
			return false;
		}
		throw error;
	}
}

export async function readTextFile(filePath: string): Promise<string> {
	try {
		const contents = await vscode.workspace.fs.readFile(toUri(filePath));
		return Buffer.from(contents).toString('utf8');
	} catch (error) {
		if (isMissingFile(error)) {
			return '';
		}
		throw error;
	}
}

export async function ensureDirectory(directory: string): Promise<void> {
	try {
		await vscode.workspace.fs.createDirectory(toUri(directory));
	} catch (error) {
		if (!(await pathExists(directory))) {
			throw error;
		}
	}
}

export async function writeTextFile(filePath: string, contents: string): Promise<void> {
	await ensureDirectory(path.dirname(filePath));
	await vscode.workspace.fs.writeFile(toUri(filePath), Buffer.from(contents, 'utf8'));
}

export async function deletePath(filePath: string): Promise<void> {
	try {
		await vscode.workspace.fs.delete(toUri(filePath), { recursive: true, useTrash: true });
	} catch (error) {
		if (isMissingFile(error)) {
			return;
		}

		// Some remote or virtual file systems do not support the trash.
		try {
			await vscode.workspace.fs.delete(toUri(filePath), { recursive: true, useTrash: false });
		} catch (fallbackError) {
			if (!isMissingFile(fallbackError)) {
				throw fallbackError;
			}
		}
	}
}

export async function listFileNames(directory: string): Promise<string[]> {
	try {
		const entries = await vscode.workspace.fs.readDirectory(toUri(directory));
		return entries
			.filter(([, type]) => (type & vscode.FileType.File) !== 0)
			.map(([name]) => name);
	} catch (error) {
		if (isMissingFile(error)) {
			return [];
		}
		throw error;
	}
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
	await ensureDirectory(destination);

	for (const [name, type] of await vscode.workspace.fs.readDirectory(toUri(source))) {
		const sourceEntry = path.join(source, name);
		const destinationEntry = path.join(destination, name);

		if ((type & vscode.FileType.Directory) !== 0) {
			await copyDirectory(sourceEntry, destinationEntry);
		} else {
			await vscode.workspace.fs.copy(toUri(sourceEntry), toUri(destinationEntry), { overwrite: true });
		}
	}
}

/**
 * Copies files into extension storage before they are deleted or overwritten.
 * Backups live outside the project so they never pollute the user's repository.
 */
export async function backupFiles(
	workspaceRoot: string,
	files: string[],
	label: string
): Promise<BackupResult | undefined> {
	if (!storageRoot) {
		log('Backups are unavailable because extension storage was not initialized.');
		return undefined;
	}

	const existing: string[] = [];
	for (const file of files) {
		if (await pathExists(file)) {
			existing.push(file);
		}
	}

	if (existing.length === 0) {
		return undefined;
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const directory = path.join(storageRoot, 'backups', `${timestamp}-${label}`);

	for (const file of existing) {
		const relativePath = path.relative(workspaceRoot, file);
		const destination = path.join(directory, relativePath);
		await ensureDirectory(path.dirname(destination));
		await vscode.workspace.fs.copy(toUri(file), toUri(destination), { overwrite: true });
	}

	log(`Backed up ${existing.length} file(s) to ${directory}`);
	await pruneBackups(MAX_BACKUPS);
	return { directory, files: existing };
}

const MAX_BACKUPS = 20;

async function pruneBackups(keep: number): Promise<void> {
	if (!storageRoot) {
		return;
	}

	const backupRoot = path.join(storageRoot, 'backups');
	let entries: [string, vscode.FileType][];

	try {
		entries = await vscode.workspace.fs.readDirectory(toUri(backupRoot));
	} catch (error) {
		if (isMissingFile(error)) {
			return;
		}
		throw error;
	}

	const expired = entries
		.filter(([, type]) => (type & vscode.FileType.Directory) !== 0)
		.map(([name]) => name)
		.sort()
		.reverse()
		.slice(keep);

	for (const name of expired) {
		await deletePath(path.join(backupRoot, name));
	}

	if (expired.length > 0) {
		log(`Pruned ${expired.length} old backup(s), keeping the newest ${keep}.`);
	}
}

export async function revealBackup(backup: BackupResult | undefined): Promise<void> {
	if (!backup) {
		return;
	}

	try {
		await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(backup.directory));
	} catch (error) {
		log(`Could not reveal backup folder: ${getErrorMessage(error)}`);
	}
}

export async function ensureStyleImport(stylesPath: string, syntax: StyleSyntax, moduleName: string): Promise<void> {
	const existingStyles = await readTextFile(stylesPath);
	const importPattern = new RegExp(`@(use|import)\\s+["']?(?:\\./)?${moduleName}(?:\\.css)?["']?`);

	if (importPattern.test(existingStyles)) {
		return;
	}

	const statement = syntax === 'css'
		? `@import "./${moduleName}.css";`
		: syntax === 'scss'
			? `@use "${moduleName}" as *;`
			: `@use "${moduleName}" as *`;

	await writeTextFile(stylesPath, `${statement}\n${existingStyles}`);
}

export async function detectPackageManager(root: string): Promise<PackageManager> {
	if (await pathExists(path.join(root, 'bun.lockb')) || await pathExists(path.join(root, 'bun.lock'))) {
		return { command: 'bun', args: ['add', '-d', 'sass'] };
	}

	if (await pathExists(path.join(root, 'pnpm-lock.yaml'))) {
		return { command: 'pnpm', args: ['add', '-D', 'sass'] };
	}

	if (await pathExists(path.join(root, 'yarn.lock'))) {
		return { command: 'yarn', args: ['add', '--dev', 'sass'] };
	}

	return { command: 'npm', args: ['install', '--save-dev', 'sass'] };
}

export async function installSass(root: string): Promise<boolean> {
	if (!vscode.workspace.isTrusted) {
		log('Skipped installing Sass because the workspace is not trusted.');
		vscode.window.showWarningMessage(
			'React Speedrun Tools: Sass was not installed automatically because this workspace is not trusted. Install it manually with your package manager.'
		);
		return false;
	}

	const packageManager = await detectPackageManager(root);

	return vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `React Speedrun Tools: installing Sass with ${packageManager.command}…`,
		cancellable: false,
	}, () => new Promise<boolean>((resolve) => {
		log(`Running: ${packageManager.command} ${packageManager.args.join(' ')} (cwd: ${root})`);

		const child = spawn(packageManager.command, packageManager.args, {
			cwd: root,
			shell: process.platform === 'win32',
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		child.stdout?.on('data', (data: Buffer) => outputChannel?.append(data.toString()));
		child.stderr?.on('data', (data: Buffer) => outputChannel?.append(data.toString()));

		child.on('error', (error) => {
			log(`Failed to start ${packageManager.command}: ${error.message}`);
			vscode.window.showErrorMessage(
				`React Speedrun Tools: could not run ${packageManager.command}. Is it installed?`,
				'Show Output'
			).then(action => {
				if (action === 'Show Output') {
					showOutput();
				}
			});
			resolve(false);
		});

		child.on('close', (code) => {
			if (code === 0) {
				resolve(true);
				return;
			}

			log(`${packageManager.command} exited with code ${code}.`);
			vscode.window.showErrorMessage(
				`React Speedrun Tools: failed to install Sass (exit code ${code}).`,
				'Show Output'
			).then(action => {
				if (action === 'Show Output') {
					showOutput();
				}
			});
			resolve(false);
		});
	}));
}
