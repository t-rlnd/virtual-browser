/**
 * Service des medias avec support des requetes Range.
 *
 * Le serveur de developpement d'esbuild repond bien 206 a un Range explicite,
 * mais n'annonce jamais `Accept-Ranges: bytes` sur une requete simple. Le
 * navigateur en conclut que la ressource n'est pas seekable et **ignore
 * silencieusement toute ecriture de `currentTime`** : la video se lit, mais le
 * scrub ne peut plus rien piloter.
 *
 * Ce module reprend donc le service des fichiers de `public/assets` et laisse
 * le reste a esbuild.
 */
import { createReadStream, statSync } from 'node:fs';
import { extname, normalize, join } from 'node:path';

const TYPES = { '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webm': 'video/webm' };

/** Sert `pathname` depuis `root`. Renvoie false si le fichier n'existe pas. */
export function serveMedia(root, pathname, request, response) {
  // normalize neutralise les `..` : rien en dehors de la racine ne doit sortir.
  const relative = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const file = join(root, relative);

  let stats;
  try {
    stats = statSync(file);
    if (!stats.isFile()) return false;
  } catch {
    return false;
  }

  const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
  const headers = {
    'Content-Type': type,
    // La ligne qui manque a esbuild, et sans laquelle le scrub ne fonctionne pas.
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range ?? '');

  if (range) {
    const start = range[1] === '' ? stats.size - Number(range[2]) : Number(range[1]);
    const end = range[2] === '' || range[1] === '' ? stats.size - 1 : Number(range[2]);

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start < 0 || end >= stats.size) {
      response.writeHead(416, { 'Content-Range': `bytes */${stats.size}` });
      response.end();
      return true;
    }

    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Content-Length': end - start + 1,
    });
    if (request.method !== 'HEAD') createReadStream(file, { start, end }).pipe(response);
    else response.end();
    return true;
  }

  response.writeHead(200, { ...headers, 'Content-Length': stats.size });
  if (request.method !== 'HEAD') createReadStream(file).pipe(response);
  else response.end();
  return true;
}
