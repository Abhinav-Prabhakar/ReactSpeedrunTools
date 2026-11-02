const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

const problemMatcherPlugin = {
	name: 'esbuild-problem-matcher',
	setup(build) {
		build.onStart(() => console.log('[watch] build started'));
		build.onEnd(result => {
			for (const error of result.errors) {
				console.error(`✘ [ERROR] ${error.text}`);
				if (error.location) {
					console.error(`    ${error.location.file}:${error.location.line}:${error.location.column}:`);
				}
			}
			console.log('[watch] build finished');
		});
	},
};

async function main() {
	const context = await esbuild.context({
		entryPoints: ['src/extension.ts'],
		bundle: true,
		format: 'cjs',
		platform: 'node',
		target: 'node16',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		logLevel: 'silent',
		plugins: [problemMatcherPlugin],
	});

	if (watch) {
		await context.watch();
		return;
	}

	await context.rebuild();
	await context.dispose();
}

main().catch(error => {
	console.error(error);
	process.exit(1);
});
