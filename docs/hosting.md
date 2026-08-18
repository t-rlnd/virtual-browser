# Hebergement des fichiers

Deux hebergeurs, separes par nature de fichier :

| Quoi | Ou | Pourquoi la |
| --- | --- | --- |
| MP4 et posters | Bunny (Storage + Pull Zone) | Volumineux, binaires, n'ont rien a faire dans un depot git |
| `scroll-video.js` / `.css` | GitHub, servi par jsDelivr | Versionnes avec le code qui les produit, diffables, tagues |

Le bundle est donc **commite** dans `dist/` : c'est ce que jsDelivr lit. C'est
la seule raison pour laquelle un artefact de build est versionne ici.

## La regle qui prime sur tout le reste

Les MP4 doivent etre servis **bruts**. Il ne faut passer ni par Bunny Stream ni
par Cloudflare Stream : ces services transcodent en HLS, et le streaming
adaptatif rend `currentTime` imprecis. Les seeks se calent alors sur les
frontieres de segment, ce qui detruit exactement la propriete dont depend tout
le scrub.

Ce qu'il faut est donc un simple stockage objet derriere un CDN.

## Pourquoi pas les assets Webflow

Le gestionnaire d'assets de Webflow conviendrait au cas present (quatre MP4 et
quatre posters par largeur, soit une douzaine de fichiers), mais c'est une
bibliotheque a plat, sans dossiers ni versionnement, et l'upload est manuel.
Le jour ou l'on migre vers le rendu canvas, il faudra televerser plusieurs
centaines d'images : autant mettre le stockage externe en place tout de suite.

## Option retenue : Bunny

1. Creer une **Storage Zone** (region proche de l'audience principale).
2. Creer une **Pull Zone** branchee sur cette Storage Zone, avec un domaine
   personnalise ou le `*.b-cdn.net` fourni.
3. Dans la Pull Zone, onglet **Headers**, ajouter
   `Access-Control-Allow-Origin: *`. Ce n'est pas necessaire pour la balise
   `<video>`, mais indispensable si l'on bascule un jour sur le rendu canvas.
4. Recuperer le mot de passe de la Storage Zone (onglet **FTP & API Access**).

Televersement :

```bash
export BUNNY_STORAGE_ZONE=ma-zone
export BUNNY_STORAGE_KEY=xxxxxxxx
npm run encode -- masters/video1.mp4 masters/video2.mp4
./scripts/upload-bunny.sh
```

Le script ne televerse que `public/assets` : le bundle ne passe pas par Bunny.

Verification :

```bash
./scripts/check-cdn.sh https://ma-zone.b-cdn.net/scroll-video/v1/video1-1280.mp4
```

Le script controle les trois points qui comptent : requetes `Range` servies,
CORS ouverts, et absence de flux adaptatif.

## Option equivalente : Cloudflare R2

Meme principe, avec `wrangler` a la place de `curl` :

```bash
wrangler r2 bucket create scroll-video
wrangler r2 object put scroll-video/scroll-video/v1/video1-1280.mp4 \
  --file public/assets/video1-1280.mp4 --content-type video/mp4
```

Brancher ensuite un domaine personnalise sur le bucket (R2 > Settings > Public
access > Custom domain) et ajouter une Transform Rule pour les en-tetes CORS.
Le point d'attention est le meme : ne pas router les fichiers vers Cloudflare
Stream.

## Le code sur GitHub, via jsDelivr

jsDelivr sert n'importe quel fichier d'un depot **public** a l'URL :

```
https://cdn.jsdelivr.net/gh/<compte>/<depot>@<tag>/dist/scroll-video.js
```

Le depot doit etre public : jsDelivr n'a aucun moyen de lire un depot prive.

Le tag est immuable, donc cache indefiniment. Publier une mise a jour du code :

```bash
npm run build
git add dist && git commit -m "build: v1.1.0"
git tag v1.1.0 && git push --tags
```

Puis remplacer `@v1.0.0` par `@v1.1.0` dans les deux snippets Webflow. Tant
que ce numero ne bouge pas, aucun visiteur ne peut recevoir un bundle a moitie
deploye.

Ne jamais pointer sur `@main` : jsDelivr y applique un cache de 7 jours, une
correction peut donc mettre une semaine a apparaitre.

## Versionner le prefixe des medias plutot que purger le cache

Les videos sont rangees sous `scroll-video/v1/`. Pour publier une nouvelle
version des **videos**, incrementer ce prefixe (`v2`, `v3`...) et mettre a jour
`base` dans [`src/config.js`](../src/config.js) plutot que de purger le
cache du CDN. Le deploiement devient atomique et l'ancienne version reste
servie tant que la nouvelle n'est pas referencee.

Ce prefixe et le tag git sont deux compteurs independants : les videos bougent
rarement, le code plus souvent.

## Budget de poids

Ordres de grandeur pour un master de 6 secondes, avec les 3 premieres secondes
en all-intra :

- 750 px : environ 1,5 Mo par video
- 1280 px : environ 5 Mo par video
- 1920 px : environ 10 Mo par video

Le client ne telecharge qu'une seule largeur. La seconde video n'est chargee
qu'apres l'interactivite de la page, et le mode economiseur de donnees force la
plus petite largeur.
