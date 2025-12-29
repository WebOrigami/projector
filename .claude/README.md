# Claude Project Preferences

## Project Overview

This is a minimal Electron application prototype for editing text files. The goal is to keep the implementation as simple as possible.

## Code Style

- Use ES modules (`import`/`export`)
- Use double quotes for strings
- Use async/await for asynchronous operations
- Prefer `const` over `let`
- In a given .js module file, generally keep the top-level functions sorted by function name. Exception: the main class in a class file goes at the top after imports, constant declarations, and other initializations.
- Within a class definition, generally keep the top-level property/method implementations sorted by name. Exception: the constructor() goes at the top as is conventional.

## Architecture Principles

- Keep the HTML completely vanilla (no CSS or JavaScript in the renderer for now)
- No dependencies beyond Electron and electron-builder
- Main process handles all application logic
- Minimal, straightforward implementations preferred over abstractions

## Project Structure

```
/
├── main.js              # Main process (Electron entry point)
├── renderer/            # Renderer process files
│   └── index.html       # Window content
├── build/               # Build assets (icons, etc.) - committed to git
├── dist/                # Build output - NOT committed to git
├── .vscode/             # VS Code configuration
└── package.json
```

## Development Workflow

- Run: `npm start`
- Debug: Use VS Code "Start Debugging" (F5)
- Build: `npm run build`
