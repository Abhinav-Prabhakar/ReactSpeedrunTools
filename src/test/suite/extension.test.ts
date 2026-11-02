import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
	test('activates and registers its commands', async () => {
		const extension = vscode.extensions.getExtension('abhinav-prabhakar.react-speedrun-tools');
		assert.ok(extension, 'the extension should be discoverable in the test host');

		await extension.activate();
		assert.strictEqual(extension.isActive, true);

		const commands = await vscode.commands.getCommands(true);
		for (const command of [
			'react-speedrun-tools.scaffoldReactApp',
			'react-speedrun-tools.removeBoilerplate',
			'react-speedrun-tools.createReactComponent',
			'react-speedrun-tools.addFont',
			'react-speedrun-tools.generateColorVariables',
		]) {
			assert.ok(commands.includes(command), `${command} should be registered`);
		}
	});
});
