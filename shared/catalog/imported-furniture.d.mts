export interface ImportedFurnitureAsset {
  catalogId: string;
  slug: string;
  label: string;
  finish: 'wood' | 'fabric' | 'mixed';
  targetDimensions: [number, number, number];
  tintStrength: number;
  styleTags: string[];
}

export interface ImportedFurnitureLibrary {
  repository: string;
  api: string;
  source: string;
  license: string;
  style: string;
  palette: Record<string, string>;
}

export const IMPORTED_FURNITURE_LIBRARY: ImportedFurnitureLibrary;
export const IMPORTED_FURNITURE_ASSETS: ImportedFurnitureAsset[];
export const IMPORTED_FURNITURE_BY_ID: Record<string, ImportedFurnitureAsset>;
