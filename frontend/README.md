# DNA Frontend

This is a monorepo containing the DNA frontend packages.

## Structure

- `packages/core` - TypeScript package without React dependencies. Contains shared utilities, types, and business logic. Can be used stand alone to interact with the DNA backend.
- `packages/app` - React application using Vite, TanStack Query, and Radix Themes.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run the React app in development mode:

```bash
npm run dev
```

This will start the Vite dev server for the app.

### Build

Build all packages:

```bash
npm run build
```

Build individual packages:

```bash
npm run build:core
npm run build:app
```

### Testing

Run all tests:

```bash
npm run test
```

Run tests once (no watch mode):

```bash
npm run test:run
```

Run tests with coverage:

```bash
npm run test:coverage
```

Run tests for individual packages:

```bash
npm run test --workspace=@dna/core
npm run test --workspace=@dna/app
```

## Packages

### @dna/core

A TypeScript package that provides shared utilities and types. It has no React dependencies and can be used in any TypeScript project.

**Usage:**

```typescript
import { formatDate, isValidUrl, type Version } from '@dna/core';
```

### @dna/app

A React application built with:

- **Vite** - Fast build tool and dev server
- **TanStack Query** - Powerful data synchronization for React
- **Radix Themes** - Beautiful, accessible component library

The app imports and uses the `@dna/core` package.

## Code Formatting and Type Checking

The frontend uses [Prettier](https://prettier.io/) for code formatting and TypeScript for type checking. These tools are automatically checked in CI on pull requests.

### Formatting Your Code

To format your code locally, use the npm command:

```bash
npm run format
```

This will format all TypeScript, JSON, CSS, and Markdown files in the frontend monorepo.

### Checking Code Formatting

To check if your code is properly formatted without making changes:

```bash
npm run format:check
```

This command will fail if any files need formatting, which is useful for CI checks.

### Type Checking

To check TypeScript types across all packages:

```bash
npm run typecheck
```

This runs TypeScript's type checker (`tsc --noEmit`) on all packages without emitting any files.

### Formatting and Type Checking Individual Packages

You can also run these commands for individual packages:

```bash
# Format a specific package
npm run format --workspace=@dna/app
npm run format --workspace=@dna/core

# Check formatting for a specific package
npm run format:check --workspace=@dna/app
npm run format:check --workspace=@dna/core

# Type check a specific package
npm run typecheck --workspace=@dna/app
npm run typecheck --workspace=@dna/core
```

## Testing

Both packages use [Vitest](https://vitest.dev/) for testing:

- **@dna/core** - Uses Vitest with Node.js environment for testing utilities and types
- **@dna/app** - Uses Vitest with jsdom environment and React Testing Library for component testing

Test files should be named `*.test.ts` or `*.test.tsx` and placed alongside the source files or in a `__tests__` directory.
