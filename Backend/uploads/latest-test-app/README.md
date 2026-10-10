# CloudForge Test React App

A minimal React + Vite frontend for testing CloudForge uploaded-ZIP deployments.

## Run locally
Requires Node.js 18+.
```bash
npm install
npm run dev
```

## Production build
```bash
npm run build
```
Build output: `dist/`.

Upload this ZIP with `package.json`, `index.html`, and `src/`. Do not include `node_modules`. This is frontend-only: no database, environment variables, or backend required.
