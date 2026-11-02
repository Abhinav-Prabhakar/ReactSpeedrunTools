# React Speedrun Tools

[![CI](https://github.com/Abhinav-Prabhakar/ReactSpeedrunTools/actions/workflows/ci.yml/badge.svg)](https://github.com/Abhinav-Prabhakar/ReactSpeedrunTools/actions/workflows/ci.yml)
[![GitHub issues](https://img.shields.io/github/issues/Abhinav-Prabhakar/ReactSpeedrunTools)](https://github.com/Abhinav-Prabhakar/ReactSpeedrunTools/issues)

Scaffold and style React apps faster inside VS Code. React Speedrun Tools detects
whether a project uses Vite, Next.js, or Create React App, then writes the entry
files, components, fonts, and color variables that match the project's language
and stylesheet syntax.

## Installation

Install the packaged VSIX:

```bash
code --install-extension react-speedrun-tools-0.1.0.vsix
```

The extension is prepared for Marketplace publishing; `npm run package` builds a
VSIX locally.

## Commands

All commands are available from the Command Palette under **React Speedrun
Tools**.

| Command | Description |
| --- | --- |
| **Scaffold React App Files** | Writes Vite or Next.js App Router entry files, stylesheets, and `index.html` wiring. |
| **Create A New React Component** | Creates a `.jsx` or `.tsx` component with a validated PascalCase name. |
| **Add A Font** | Copies a bundled font into the project and generates `@font-face` rules. |
| **Generate Color Variables** | Generates CSS custom properties or Sass variables. |
| **Clean Legacy CRA Boilerplate And Install Sass** | Replaces known Create React App starter files in legacy JavaScript projects. |

### Scaffold React App Files

The command adapts to the detected project:

- **Vite** — creates `src/main.{jsx,tsx}`, `src/App.{jsx,tsx}`, and the
  stylesheet selected by `reactSpeedrunTools.styling`. It creates
  `index.html` when missing and updates an existing `index.html` to point at
  the correct entry file.
- **Next.js App Router** — creates `app/layout.{jsx,tsx}`,
  `app/page.{jsx,tsx}`, and `app/globals.{css,scss,sass}` (or the `src/app`
  equivalents). Existing App Router files are left untouched.
- **Remix** — creates `app/root.{jsx,tsx}`, `app/routes/_index.{jsx,tsx}`, and
  `app/app.{css,scss,sass}` (or the detected stylesheet). The root imports the
  stylesheet. If `app/routes.ts` exists, the command warns that the new route may
  need to be registered in that config.
- **React Router** — creates `app/root.{jsx,tsx}`, `app/routes/home.{jsx,tsx}`,
  `app/routes.{ts,js}` when no route config exists, and
  `app/app.{css,scss,sass}` (or the detected stylesheet). If a route config
  already exists, the command warns when `routes/home` is not registered.
- **Generic React** — asks for confirmation before writing Vite-style files.
- **Create React App** — points you at the legacy cleanup command.

Existing files require a modal confirmation. A backup is created before any file
is replaced, and the operation shows progress and can be cancelled. Sass is
installed automatically when the project uses SCSS or Sass and does not already
have it.

### Create A New React Component

Generates a component in `src/components` (or `app/components` for Remix and
React Router). TypeScript projects get `.tsx`; JavaScript projects get `.jsx`.
Component names must start with a capital letter and contain only letters and
numbers. Existing components require confirmation, and the editor opens with the
cursor on the `return` line.

### Add A Font

Bundled families (WOFF2):

- Inter
- Poppins
- Plus Jakarta Sans
- Roboto

Fonts are copied to `src/assets/fonts` or `app/assets/fonts` for Next.js, Remix,
and React Router. `@font-face` rules are generated with the correct weight,
italic style, variable font range, format, and a URL relative to the project's
stylesheet. Existing font blocks are not duplicated, and the stylesheet import
is added automatically.

### Generate Color Variables

Writes `colors.css`, `_colors.scss`, or `_colors.sass` next to the project's main
stylesheet:

- **CSS** — `:root` custom properties
- **SCSS / Sass** — `$primary-color`, `$primary-text`, `$secondary-color`,
  `$secondary-text`

An existing color file requires confirmation, and a backup is created before it
is replaced. The stylesheet import is added automatically.

### Clean Legacy CRA Boilerplate And Install Sass

Replaces the known CRA starter files in `src` with a minimal JavaScript
`index.js`, `App.js`, and `app.sass`. Other files are kept. The command:

- Only runs on legacy JavaScript CRA-style projects.
- Creates `src/components` and `src/assets/fonts`.
- Backs up every file it deletes or replaces.
- Installs Sass as a dev dependency with npm, pnpm, yarn, or bun.
- Redirects Vite, Next.js, and TypeScript entry projects to the appropriate
  command instead of changing files.

## Settings

| Setting | Values | Default | Description |
| --- | --- | --- | --- |
| `reactSpeedrunTools.language` | `auto`, `javascript`, `typescript` | `auto` | Language used when generating components and scaffolding files. `auto` detects `tsconfig.json`, TypeScript dependencies, and existing `.ts`/`.tsx` files. |
| `reactSpeedrunTools.styling` | `auto`, `css`, `scss`, `sass`, `tailwind` | `auto` | Styling approach used when scaffolding and generating styles. `auto` detects Tailwind, Sass, and existing stylesheets. |

Invalid values fall back to `auto` with a warning.

## Project detection

| Project | Detection |
| --- | --- |
| Vite | `vite` dependency |
| Next.js | `next` dependency |
| Create React App | `react-scripts` dependency |
| Remix | `@remix-run/react` dependency |
| React Router | `@react-router/dev` dependency |
| Generic React | `react` dependency |
| Unknown | no matching dependency |

Next.js, Remix, and React Router are checked before Vite, so framework projects
that use Vite are detected correctly. Stylesheet detection covers `src/index.*`,
`src/app.*`, `app/globals.*`, `app/app.*`, `app/tailwind.*`, `app/styles/*`, and
the Pages Router `styles/globals.*`.

## Safety and backups

- Commands that replace or delete files ask for confirmation first.
- Files are copied into extension workspace storage before they are changed.
  Use **Reveal Backup** in the notification to open the backup folder.
- The **React Speedrun Tools** output channel logs the selected workspace,
  detected project, backup path, generated files, package-manager commands, and
  failures.
- Long operations show progress and support cancellation.
- Sass installation is skipped in untrusted workspaces.
- The extension requires a local workspace and is disabled in virtual
  workspaces because project detection and package-manager installation need
  direct file-system access.

Backups are pruned automatically: only the 20 most recent backups are kept per
workspace.

## Requirements

- VS Code 1.77 or newer.
- A local project folder.
- npm, pnpm, yarn, or bun only when Sass needs to be installed.

## Development

```bash
npm install
npm run check-types   # TypeScript type-check
npm run lint          # ESLint 9 flat config
npm run bundle        # esbuild bundle for the extension host
npm test              # @vscode/test-cli integration tests
npm run package       # build a VSIX
```

`npm test` downloads the stable VS Code test host on first run and uses
`@vscode/test-cli`. Press `F5` in VS Code to launch the extension with the
esbuild watch task.

The extension is bundled with esbuild into `dist/extension.js`. TypeScript still
compiles to `out/` for tests and type information.

## Releasing

1. Update the version in `package.json` and `CHANGELOG.md`.
2. Run `npm run package` and test the generated VSIX.
3. Set the `VSCE_PAT` repository secret.
4. Push a `v*` tag (for example `v0.1.0`) or run the **Release** workflow
   manually with `publish` enabled.

The release workflow lints, type-checks, bundles, tests, packages the VSIX,
publishes to the Marketplace when `VSCE_PAT` is available, and attaches the VSIX
to the GitHub release for tag builds. `npm run package` also runs the
type-check, lint, and esbuild bundle before invoking `vsce`.

## License

The extension source is licensed under the [MIT License](LICENSE).

Bundled fonts keep their upstream licenses in `assets/fonts`:

- Inter — SIL Open Font License 1.1
- Poppins — SIL Open Font License 1.1
- Plus Jakarta Sans — SIL Open Font License 1.1
- Roboto — Apache License 2.0

See [assets/fonts/NOTICE.md](assets/fonts/NOTICE.md) for details.

## Contributing

Issues and pull requests are welcome:
<https://github.com/Abhinav-Prabhakar/ReactSpeedrunTools>
