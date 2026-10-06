/**
 * Construction et service des fichiers, sur le modele du starter Finsweet.
 *
 *   node bin/build.js                     watch + serveur local + live reload
 *   NODE_ENV=production node bin/build.js  ecrit dist/ minifie
 *
 * Le serveur de developpement sert les fichiers **tels qu'ils seront en
 * ligne**, sans transformation. C'est ce qui permet de pointer le code
 * personnalise d'une page Webflow sur localhost (`?dev`, voir webflow/) et de
 * developper contre le vrai site. Les medias, eux, ne passent jamais par ici :
 * ils sont toujours lus sur le CDN (`base` dans src/config.js).
 */
import * as esbuild from 'esbuild';

const PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Les deux modes n'ecrivent pas au meme endroit, et ce n'est pas un detail :
 * `dist/` est versionne et publie tel quel par Cloudflare. Si le mode watch y
 * ecrivait, un `git add` distrait publierait un bundle de developpement —
 * sourcemap et client de live reload compris, ce dernier ouvrant chez chaque
 * visiteur une connexion vers un localhost qui n'existe pas.
 */
const BUILD_DIRECTORY = PRODUCTION ? 'dist' : 'dev';

/**
 * Deux entrees pour un meme nom de sortie : le JS et la feuille de style
 * partent de sources distinctes mais s'appellent tous deux index (un seul
 * bundle pour tout le site, voir src/main.js).
 */
const ENTRY_POINTS = [
  { in: 'src/main.js', out: 'index' },
  { in: 'src/styles/entry.css', out: 'index' },
];

const LIVE_RELOAD = !PRODUCTION;
const SERVE_PORT = Number(process.env.PORT ?? 3000);
const SERVE_ORIGIN = `http://localhost:${SERVE_PORT}`;

/** Site Webflow publie, qui charge ce serveur quand on lui ajoute `?dev`. */
const SITE_URL = process.env.SITE_URL ?? 'https://virtual-browser.webflow.io/';

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

  // servedir a la racine : les snippets Webflow attendent le bundle sous
  // /dev/index.* (voir webflow/head.html et footer.html).
  await context.serve({ servedir: '.', port: SERVE_PORT });

  console.log('');
  console.log(`virtual-browser   ${SERVE_ORIGIN}   (watch + live reload)`);
  console.log('');
  console.log(`  Bundle   ${SERVE_ORIGIN}/${BUILD_DIRECTORY}/index.js`);
  console.log(`           ${SERVE_ORIGIN}/${BUILD_DIRECTORY}/index.css`);
  console.log(`  Site     ${new URL('?dev', SITE_URL)}`);
  console.log('');
  console.log("  Les snippets Webflow (webflow/head.html, footer.html) basculent d'eux-memes");
  console.log("  sur ce serveur quand l'URL du site porte ?dev.");
  console.log('');
}
