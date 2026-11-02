import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
	files: 'out/test/**/*.test.js',
	// @vscode/test-cli 0.0.15 does not complete on the VS Code 1.144 test host,
	// so pin a known-good stable host for local runs and CI.
	version: '1.96.4',
	extensionDevelopmentPath: '.',
	mocha: {
		ui: 'tdd',
		timeout: 20000,
		color: true,
	},
});
