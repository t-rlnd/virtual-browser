/**
 * Recharge la page a chaque rebuild, injecte uniquement en developpement.
 *
 * esbuild expose un flux d'evenements sur /esbuild pendant qu'il sert : il y
 * emet `change` a la fin de chaque reconstruction. C'est ce qui permet de
 * travailler dans le Designer Webflow avec le script pointe sur localhost et
 * de voir l'effet d'une sauvegarde sans toucher au navigateur.
 *
 * SERVE_ORIGIN est remplace a la compilation par bin/build.js.
 */
new EventSource(`${SERVE_ORIGIN}/esbuild`).addEventListener('change', () => location.reload());
