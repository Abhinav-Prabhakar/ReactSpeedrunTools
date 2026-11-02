# React Speedrun Tools

![GitHub issues](https://img.shields.io/github/issues/Abhinav-Prabhakar/ReactSpeedrunTools)

An extension to help you scaffold and develop React projects faster.

## Features

- **Scaffold React App Files** — creates the entry, `App`, stylesheet, and Vite
  `index.html` files for Vite projects, or `layout`/`page`/`globals` files for
  Next.js App Router projects.
- **Create A New React Component** — generates `.jsx` or `.tsx` components based
  on the project language.
- **Add A Font** — copies a bundled font into the project and generates
  `@font-face` rules with correct weights and italics for CSS, SCSS, or Sass.
- **Generate Color Variables** — generates CSS custom properties or Sass
  variables depending on the project stylesheet.
- **Clean Legacy CRA Boilerplate And Install Sass** — replaces legacy CRA starter
  files with a minimal JavaScript setup. This is intentionally limited to legacy
  JavaScript CRA projects.

## Installation

1. Open VS Code.
2. Press `Ctrl/Cmd + Shift + X` to open the Extensions panel.
3. Search for **React Speedrun Tools** and install it.

## Usage

1. Open a React project folder.
2. Open the Command Palette (`Ctrl/Cmd + Shift + P`).
3. Run one of the commands under **React Speedrun Tools**.

Commands that write files ask for confirmation before replacing existing files.

## Settings

| Setting | Values | Default | Description |
| --- | --- | --- | --- |
| `reactSpeedrunTools.language` | `auto`, `javascript`, `typescript` | `auto` | Language used when generating components and scaffolding files. `auto` detects `tsconfig.json`, TypeScript dependencies, and existing `.ts`/`.tsx` files. |
| `reactSpeedrunTools.styling` | `auto`, `css`, `scss`, `sass`, `tailwind` | `auto` | Styling approach used when scaffolding and generating styles. `auto` detects Tailwind, Sass, and existing stylesheets. |

## Supported projects

- **Vite** — first-class support.
- **Next.js App Router** — scaffolds missing `app/layout`, `app/page`, and
  `app/globals` files.
- **Generic React projects** — Vite-style scaffolding after confirmation.
- **Legacy CRA** — use the dedicated CRA cleanup command.
- **Remix / React Router** — not supported yet.

Tailwind scaffolding generates the CSS entry with the correct Tailwind import,
but the project still needs Tailwind configured in its build tool.

## Development

```bash
npm install
npm run compile
npm run lint
```

Press `F5` in VS Code to launch the extension host.

## Contributing

Issues and pull requests are welcome:
<https://github.com/Abhinav-Prabhakar/ReactSpeedrunTools>
