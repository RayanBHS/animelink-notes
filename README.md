# Notes IMDb des épisodes, pour Animelink

Les notes IMDb de chaque épisode des séries d'animation, en un petit fichier
JSON par série, régénérées chaque nuit par GitHub Actions à partir des jeux de
données qu'IMDb publie pour un usage personnel et non commercial :
https://developer.imdb.com/non-commercial-datasets/

- Branche `main` : le script (`generer.mjs`) et la tâche de nuit.
- Branche `donnees` : `s/<identifiant IMDb de la série>.json`, remplacée chaque nuit.

Format : `{ "n": note de la série, "v": votes, "e": [[saison, épisode, id IMDb, titre, note, votes], …] }`.

Information courtesy of IMDb (https://www.imdb.com). Used with permission.
Usage personnel et non commercial uniquement.
