// Meta formats its own files with the settings it syncs to the packages.
import { readFileSync } from 'node:fs';

export default JSON.parse(
  readFileSync(
    new URL('templates/synced/.prettierrc', import.meta.url),
    'utf8',
  ),
);
