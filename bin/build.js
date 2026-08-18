/**
 * Construction et service des fichiers, sur le modele du starter Finsweet.
 *
 *   node bin/build.js                     watch + serveur local + live reload
 *   NODE_ENV=production node bin/build.js  ecrit dist/ minifie
 *
 * Le serveur de developpement sert les fichiers **tels qu'ils seront en
 * ligne**, sans transformation. C'est ce qui permet de pointer le code
 * personnalise d'une page Webflow sur localhost et de developper contre le
 * vrai site.
 */
import * as esbuild from 'esbuild';
import { readdirSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { join, sep } from 'node:path';

import { serveMedia } from './serve-media.js';

const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Les deux modes n'ecrivent pas au meme endroit, et ce n'est pas un detail :
 * `dist/` est versionne et sert de source a jsDelivr. Si le mode watch y
 * ecrivait, un `git add` distrait publierait un bundle de developpement —
 * sourcemap et client de live reload compris, ce dernier ouvrant chez chaque
 * visiteur une connexion vers un localhost qui n'existe pas.
 */
const BUILD_DIRECTORY = PRODUCTION ? 'dist' : 'dev';

/**
 * Deux entrees pour un meme nom de sortie : le JS et la feuille de style
 * partent de sources distinctes mais s'appellent tous deux scroll-video.
 */
const ENTRY_POINTS = [
  { in: 'src/main.js', out: 'scroll-video' },
  { in: 'src/styles/scroll-video.css', out: 'scroll-video' },
];

const LIVE_RELOAD = !PRODUCTION;
const SERVE_PORT = Number(process.env.PORT ?? 3000);
const SERVE_ORIGIN = `http://localhost:${SERVE_PORT}`;

/** Repertoire servi avec support des Range, hors du perimetre d'esbuild. */
const MEDIA_ROUTE = 'public';

const context = await esbuild.context({
  bundle: true,
  entryPoints: ENTRY_POINTS,
  outdir: BUILD_DIRECTORY,
  // GSAP n'est pas bundle : le script attend window.gsap et window.ScrollTrigger,
  // charges depuis leur CDN avant lui (voir webflow/footer.html).
  format: 'iife',
  minify: PRODUCTION,
  sourcemap: !PRODUCTION,
  target: PRODUCTION ? 'es2019' : 'esnext',
  inject: LIVE_RELOAD ? ['./bin/live-reload.js'] : undefined,
  define: { SERVE_ORIGIN: JSON.stringify(SERVE_ORIGIN) },
});

if (PRODUCTION) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();

  // servedir a la racine, et non sur le repertoire de sortie : les pages de
  // demonstration, les medias et le bundle doivent cohabiter sous une seule
  // origine. Port 0 = esbuild choisit, il n'est pas expose directement.
  const upstream = await context.serve({ servedir: '.', port: 0 });

  // Tout passe par ce serveur, qui ne retient que les medias — esbuild ne les
  // annonce pas comme seekable, ce qui suffit a casser le scrub.
  createServer((clientRequest, clientResponse) => {
    const { pathname } = new URL(clientRequest.url, SERVE_ORIGIN);

    if (pathname.startsWith(`/${MEDIA_ROUTE}/`)) {
      const served = serveMedia(MEDIA_ROUTE, pathname.slice(MEDIA_ROUTE.length + 1), clientRequest, clientResponse);
      if (served) return;
    }

    const proxied = httpRequest(
      {
        hostname: upstream.hosts[0],
        port: upstream.port,
        path: clientRequest.url,
        method: clientRequest.method,
        headers: clientRequest.headers,
      },
      (upstreamResponse) => {
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
        upstreamResponse.pipe(clientResponse, { end: true });
      }
    );

    proxied.on('error', () => {
      clientResponse.writeHead(502);
      clientResponse.end('serveur de build injoignable');
    });

    clientRequest.pipe(proxied, { end: true });
  }).listen(SERVE_PORT, logServedFiles);
}

/** Affiche les balises pretes a coller dans le code personnalise Webflow. */
function logServedFiles() {
  const walk = (directory) =>
    readdirSync(directory, { withFileTypes: true })
      .flatMap((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? walk(path) : path;
      });

  const rows = walk(BUILD_DIRECTORY)
    .filter((file) => !file.endsWith('.map'))
    .map((file) => {
      const location = [SERVE_ORIGIN, ...file.split(sep)].join('/');
      return {
        Fichier: location,
        'A coller dans Webflow': location.endsWith('.css')
          ? `<link href="${location}" rel="stylesheet" />`
          : `<script defer src="${location}"></script>`,
      };
    });

  console.table(rows);
  console.log(`Demonstration : ${SERVE_ORIGIN}/  ·  bundle : ${SERVE_ORIGIN}/demo/bundle.html`);
}
