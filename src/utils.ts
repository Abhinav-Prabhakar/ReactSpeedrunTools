import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import type { StyleSyntax } from './project';

export interface PackageManager {
	command: string;
	args: string[];
}

let outputChannel: vscode.OutputChannel | undefined;

export function setOutputChannel(channel: vscode.OutputChannel): void {
	outputChannel = channel;
}

export function ensureDirectory(directory: string): void {
	fs.mkdirSync(directory, { recursive: true });
}

export function readFileIfExists(filePath: string): string {
	return fs.existsSync(filePath) ? fs.readFileSync(filePath, { encoding: 'utf-8' }) : '';
}

export function writeFileEnsuringDirectory(filePath: string, contents: string): void {
	ensureDirectory(path.dirname(filePath));
	fs.writeFileSync(filePath, contents);
}

export function copyDirectory(source: string, destination: string): void {
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

export function ensureStyleImport(stylesPath: string, syntax: StyleSyntax, moduleName: string): void {
	const existingStyles = readFileIfExists(stylesPath);
	const importPattern = new RegExp(`@(use|import)\\s+["']?(?:\\./)?${moduleName}(?:\\.css)?["']?`);

	if (importPattern.test(existingStyles)) {
		return;
	}

	const statement = syntax === 'css'
		? `@import "./${moduleName}.css";`
		: syntax === 'scss'
			? `@use "${moduleName}" as *;`
			: `@use "${moduleName}" as *`;

	writeFileEnsuringDirectory(stylesPath, `${statement}\n${existingStyles}`);
}

export function detectPackageManager(root: string): PackageManager {
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

export async function installSass(root: string): Promise<boolean> {
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
