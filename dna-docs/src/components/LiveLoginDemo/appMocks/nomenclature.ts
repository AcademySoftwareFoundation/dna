import {DEFAULT_RESOLVED_NOMENCLATURE} from '@dna-app/nomenclature/nomenclature';

// Stands in for frontend/packages/app/src/nomenclature in docs demos (see
// plugins/dna-app-embed.ts). The real module reads VITE_NOMENCLATURE from
// Vite's `import.meta.env` and needs a NomenclatureProvider; demos always
// show the app's default terminology.

export function useNomenclature() {
  return DEFAULT_RESOLVED_NOMENCLATURE;
}
