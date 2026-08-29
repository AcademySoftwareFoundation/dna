# DNA Docs

Documentation site for [DNA](https://github.com/AcademySoftwareFoundation/dna)
(Dailies Note Assistant), an Academy Software Foundation project.

<img width="1043" height="908" alt="Screenshot 2026-08-18 at 12 55 36 AM" src="https://github.com/user-attachments/assets/88ec6cc4-6ba8-4654-9243-ab907e290f38" />

Built with [Docusaurus](https://docusaurus.io/). It serves two independent
documentation sections:

| Section | Route | Source |
| --- | --- | --- |
| Frontend guides | `/docs` | `docs/**/*.mdx`, hand-written |
| Backend API reference | `/api` | generated from `openapi/backend.json` |

## Getting started

```bash
npm install
npm start
```

## Backend API reference

The backend commits its OpenAPI document at `backend/docs/openapi.json`
(regenerated with `make openapi` and guarded by a drift test), so refreshing the
docs is just a copy plus a `servers` injection for the API demo panel:

```bash
./scripts/fetch-openapi.sh     # refresh openapi/backend.json
npm run regen-api-docs         # rebuild MDX under api/reference/
```

`scripts/fetch-openapi.sh` reads the sibling checkout by default; both inputs
can be overridden:

```bash
DNA_SPEC=/path/to/openapi.json ./scripts/fetch-openapi.sh
DNA_SERVER_URL=https://dna.example.com ./scripts/fetch-openapi.sh
```

The generated `api/reference/` directory is not checked in. `api/index.mdx` is
hand-written and is.

## Building

```bash
npm run build       # build (does not regenerate API docs)
npm run build:full  # gen-api-docs && build  <- use in CI
```

Because `sidebarsApi.ts` imports the generated `api/reference/sidebar`, a clean
checkout must run `gen-api-docs` before `build`. `build:full` chains them.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` | Dev server |
| `npm run build` | Production build |
| `npm run build:full` | Generate API docs, then build |
| `npm run fetch-openapi` | Copy the backend's committed spec |
| `npm run gen-api-docs` | Spec → `api/reference/` |
| `npm run clean-api-docs` | Remove generated MDX |
| `npm run regen-api-docs` | Clean, then generate |
| `npm run typecheck` | `tsc` |

## License

[Apache-2.0](./LICENSE). See [NOTICE](./NOTICE) for the provenance of the
generated OpenAPI description.
