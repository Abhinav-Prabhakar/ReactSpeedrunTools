# Change Log

All notable changes to this extension are documented here.

## [0.1.0] - 2026-11-02

### Added

- Project-aware detection for Vite, Next.js, Create React App, Remix, React
  Router, and generic React projects.
- **Scaffold React App Files** for Vite and Next.js App Router projects.
- TypeScript component and scaffold output.
- CSS, SCSS, Sass, and Tailwind-aware style generation.
- `reactSpeedrunTools.language` and `reactSpeedrunTools.styling` settings.
- Output channel logging, progress reporting, cancellation, and backups for
  destructive operations.
- Bundled font licenses and an extension icon.
- ESLint 9 flat config, esbuild bundling, `@vscode/test-cli` tests, and GitHub
  Actions CI.

### Changed

- Replaced the destructive CRA `src` cleanup with a confirmed, starter-file-only
  command that keeps unrelated files.
- Font and color commands now write to the project's detected stylesheet and
  syntax.
- Component creation validates names, supports TypeScript, confirms overwrites,
  and places the cursor on the `return` line.

### Fixed

- Generated `@font-face` URLs no longer duplicate the file extension.
- Multi-file font families generate explicit, correctly quoted `@font-face`
  blocks.
- Plus Jakarta Sans file matching, font weights, italics, and variable fonts.
- The invalid empty color-variable template.
- Workspace selection in multi-root workspaces.
- Next.js Pages Router global-style detection.

## [0.0.1]

- Initial release.
