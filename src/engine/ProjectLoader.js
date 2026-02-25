export async function loadProjectFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load project: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export async function loadProjectFromFile(file) {
  const text = await file.text();
  return JSON.parse(text);
}

export function normalizeProject(project) {
  const normalized = structuredClone(project);

  normalized.grid = normalized.grid ?? { columns: 8, rows: 8 };
  normalized.customGrid = normalized.customGrid ?? { columns: 8, rows: 2, label: 'Custom Clips' };
  normalized.global = normalized.global ?? { bpm: 120, timeSignature: [4, 4], quantization: '1m' };

  if (!Array.isArray(normalized.tracks)) normalized.tracks = [];
  if (!Array.isArray(normalized.customClips)) normalized.customClips = [];

  return normalized;
}
