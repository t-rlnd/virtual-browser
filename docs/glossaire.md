# Glossaire

Les mots du projet, du plus courant au plus technique.

## L'animation

| Terme | Sens |
| --- | --- |
| **Scrub** | Faire avancer (ou reculer) une vidéo avec le scroll, au lieu de la lire. Scroller de 10 % = avancer de 10 % dans la vidéo. |
| **Boucle** (`loop`) | La vidéo joue seule, en boucle, une fois le scrub terminé. |
| **Idle** | Section hors de l'écran : tout est en pause. |
| **Mode** | L'un des trois états `scrub`, `loop`, `idle`. |
| **Use-case** | Une des vidéos entre lesquelles on bascule (`uc1`, `uc2`…). Chacune a son onglet, ses cards, sa légende. |
| **Auto-avance** | Après `loopRepeats` tours (4), la boucle passe seule au use-case suivant. |
| **Progression** | Le nombre de 0 à 1 qui dit où en est le scroll dans la piste. Tout en découle. |
| **Latch / verrou** | Une fois la boucle atteinte, on ne revient plus au scrub en remontant (`latchLoop`). |
| **Collapse** | Après le verrou, la piste passe de 300vh à une hauteur d'écran (`100dvh`) pour ne pas laisser de scroll vide. |
| **Dock / cadre** | Le moment où la vidéo quitte le plein écran pour se loger dans `[data-vb-frame]`. |
| **Mode compact** | Sous 991 px : plus de scrub pour Protocol, la vidéo boucle directement. |
| **Héros** | La section en haut de page : une vidéo scrubbée derrière un titre qui change deux fois. |
| **Protocol** | La section principale (scrub + boucle + use-cases). |

## La mise en page

| Terme | Sens |
| --- | --- |
| **Piste** | Un bloc très haut (300vh) qui ne sert qu'à créer de la longueur de scroll. |
| **Sticky / conteneur collé** | Élément en `position: sticky` : il reste fixé à l'écran pendant qu'on scrolle sa piste. C'est ce qui donne l'impression que la page « s'arrête » pendant l'animation. |
| **Sections superposées** | L'intro et la boucle sont l'une sur l'autre dans le conteneur collé ; leurs opacités font la transition. |
| **`vh` / `dvh`** | 1 % de la hauteur d'écran. `dvh` tient compte des barres d'adresse mobiles qui apparaissent/disparaissent. |
| **`--vb-scrub`** | Variable CSS posée sur `<html>`, égale à la progression. Le CSS s'en sert pour animer les calques. |
| **Attribut `data-vb-*`** | Repère posé dans le Designer (Settings › Custom attributes). Le script ne connaît que ça, jamais les classes. |

## La vidéo

| Terme | Sens |
| --- | --- |
| **Master** | Le fichier vidéo d'origine, tel qu'il sort du montage. |
| **Seek** | Sauter à un instant précis de la vidéo (`video.currentTime = 2.5`). Le scrub, c'est des dizaines de seeks par seconde. |
| **Image clé / all-intra** | Une vidéo compressée ne stocke en entier que quelques images (les images clés) ; les autres sont des différences. Pour afficher une image quelconque, le navigateur doit repartir de la clé précédente : lent. **All-intra** = toutes les images sont des clés, donc chaque seek est instantané. Plus lourd, mais indispensable pour le scrub. |
| **Découpage** | Les numéros d'image qui séparent scrub et boucle : `data-vb-loop-at` (fin du scrub) et `data-vb-loop-end` (fin de boucle). |
| **Poster** | Image fixe affichée à la place de la vidéo (chargement, `prefers-reduced-motion`). |
| **Faststart** (`moov` avant `mdat`) | L'index du MP4 est placé en tête de fichier, pour pouvoir sauter dans la vidéo sans l'avoir entièrement téléchargée. |
| **Requêtes Range** | Le navigateur demande un morceau précis du fichier (« octets 1 000 000 à 2 000 000 »). Nécessaire pour les seeks ; le serveur local et le CDN doivent le supporter. |
| **HLS / streaming adaptatif** | Vidéo découpée en segments de qualité variable (Bunny Stream, YouTube…). Incompatible avec le scrub : les seeks tombent au segment près. |

## Le code et la mise en ligne

| Terme | Sens |
| --- | --- |
| **Stage** | Le « cerveau » de Protocol (`src/Stage.js`) : il garde l'état courant et donne les ordres aux vidéos. |
| **Couche / layer** | Un objet qui sait afficher une vidéo (`seek`, `playLoop`, `show`, `hide`). `Mp4VideoLayer` le fait avec `<video>`. |
| **Machine à états** | Un objet qui ne connaît qu'un petit nombre d'états et les règles pour passer de l'un à l'autre. Le Stage en est une. |
| **Événement** | Message émis par le Stage (`activechange`, `pausechange`…) que d'autres fichiers écoutent pour se mettre à jour. |
| **Bundle** | Le fichier unique produit par esbuild à partir de tous les fichiers de `src/` : `dist/index.js` (+ `.css`), chargé sur tout le site. |
| **Lenis** | Bibliothèque de smooth scroll : la molette ne fait plus sauter la page, elle glisse jusqu'à sa cible. |
| **esbuild** | L'outil qui fabrique le bundle. |
| **GSAP / ScrollTrigger / SplitText** | Bibliothèque d'animation. ScrollTrigger mesure le scroll, SplitText découpe un texte en lignes. Chargées séparément dans Webflow, pas incluses dans le bundle. |
| **CDN** | Réseau de serveurs qui distribue des fichiers vite, partout. Ici : Bunny pour les vidéos, Netlify pour le code. |
| **Netlify** | Hébergeur branché sur le dépôt GitHub : publie `dist/` à chaque push. |
| **jsDelivr** | CDN qui sert les paquets npm (GSAP) ; servait aussi le bundle avant Netlify. |
| **e2e** | Test « de bout en bout » : un vrai navigateur (Playwright) ouvre la page, scrolle, clique et vérifie. |
| **ADR** | « Architecture Decision Record » : une fiche qui explique une décision et pourquoi (`docs/decisions/`). |
