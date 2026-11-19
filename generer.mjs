/**
 * Les notes IMDb des épisodes des séries d'animation, en un petit fichier par
 * série, pour Animelink.
 *
 * IMDb publie chaque jour ses jeux de données pour un usage personnel et non
 * commercial (https://developer.imdb.com/non-commercial-datasets/). Ils sont
 * trop lourds pour un téléphone : on les lit ici, une fois par nuit, et l'on
 * n'en garde que ce que l'application affiche — la note et les votes de la
 * série, puis de chaque épisode, avec son titre.
 *
 * Trois passes, sans rien garder de superflu en mémoire :
 *   1. title.basics : les séries d'animation ;
 *   2. title.episode : leurs épisodes, saison et numéro ;
 *   3. title.ratings : les notes ; title.basics encore : les titres des épisodes.
 *
 * Information courtesy of IMDb (https://www.imdb.com). Used with permission.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import zlib from "node:zlib";
import { Readable } from "node:stream";

const SOURCE = "https://datasets.imdbws.com";
const SORTIE = process.argv[2] ?? "donnees";
const CACHE = process.argv[3] ?? ".cache";

/** Les sortes de titres qui sont une série. */
const SERIES = new Set(["tvSeries", "tvMiniSeries"]);

/** Télécharge un fichier une fois (le cache sert aux deux passes sur title.basics). */
async function telecharger(nom) {
  const chemin = path.join(CACHE, nom);
  if (fs.existsSync(chemin)) return chemin;
  fs.mkdirSync(CACHE, { recursive: true });
  const reponse = await fetch(`${SOURCE}/${nom}`);
  if (!reponse.ok || !reponse.body) throw new Error(`${nom} : ${reponse.status}`);
  await new Promise((fini, echec) => {
    const fichier = fs.createWriteStream(chemin);
    Readable.fromWeb(reponse.body).pipe(fichier).on("finish", fini).on("error", echec);
  });
  return chemin;
}

/** Chaque ligne d'un fichier TSV compressé, découpée en colonnes, l'en-tête sauté. */
async function* lignes(chemin) {
  const lecteur = readline.createInterface({
    input: fs.createReadStream(chemin).pipe(zlib.createGunzip()),
    crlfDelay: Infinity,
  });
  let premiere = true;
  for await (const ligne of lecteur) {
    if (premiere) {
      premiere = false;
      continue;
    }
    yield ligne.split("\t");
  }
}

const nombre = (valeur) => (valeur === "\\N" ? null : Number(valeur));

async function main() {
  const debut = Date.now();
  const basics = await telecharger("title.basics.tsv.gz");
  const episodesTsv = await telecharger("title.episode.tsv.gz");
  const ratingsTsv = await telecharger("title.ratings.tsv.gz");

  // 1. Les séries d'animation.
  const series = new Set();
  for await (const [id, sorte, , , , , , , genres] of lignes(basics)) {
    if (SERIES.has(sorte) && genres?.includes("Animation")) series.add(id);
  }
  console.log(`${series.size} séries d'animation`);

  // 2. Leurs épisodes numérotés.
  const episodes = new Map(); // id de l'épisode → { serie, saison, numero }
  for await (const [id, parent, saison, numero] of lignes(episodesTsv)) {
    if (!series.has(parent)) continue;
    const s = nombre(saison);
    const e = nombre(numero);
    if (!s || !e) continue;
    episodes.set(id, { serie: parent, saison: s, numero: e });
  }
  console.log(`${episodes.size} épisodes`);

  // 3. Les notes, des séries et des épisodes.
  const notes = new Map(); // id → [note, votes]
  for await (const [id, note, votes] of lignes(ratingsTsv)) {
    if (episodes.has(id) || series.has(id)) notes.set(id, [Number(note), Number(votes)]);
  }

  // Les titres des épisodes : une seconde lecture de title.basics.
  const titres = new Map();
  for await (const [id, sorte, titre] of lignes(basics)) {
    if (sorte === "tvEpisode" && episodes.has(id)) titres.set(id, titre);
  }

  // Une série, un fichier — seulement celles dont au moins un épisode est noté.
  const parSerie = new Map();
  for (const [id, episode] of episodes) {
    const liste = parSerie.get(episode.serie) ?? [];
    liste.push([episode.saison, episode.numero, id, titres.get(id) ?? "", ...(notes.get(id) ?? [null, null])]);
    parSerie.set(episode.serie, liste);
  }
  fs.rmSync(SORTIE, { recursive: true, force: true });
  fs.mkdirSync(path.join(SORTIE, "s"), { recursive: true });
  let ecrites = 0;
  let octets = 0;
  for (const [serie, liste] of parSerie) {
    if (!liste.some((episode) => episode[4] !== null)) continue;
    liste.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const [note, votes] = notes.get(serie) ?? [null, null];
    // e : [saison, épisode, id IMDb, titre, note, votes] — court, l'application le lit vite.
    const contenu = JSON.stringify({ n: note, v: votes, e: liste });
    fs.writeFileSync(path.join(SORTIE, "s", `${serie}.json`), contenu);
    ecrites += 1;
    octets += contenu.length;
  }
  const bilan = {
    le: new Date().toISOString(),
    series: ecrites,
    episodes: episodes.size,
    source: "IMDb non-commercial datasets — Information courtesy of IMDb (https://www.imdb.com). Used with permission.",
  };
  fs.writeFileSync(path.join(SORTIE, "bilan.json"), JSON.stringify(bilan, null, 2));
  console.log(`${ecrites} fichiers, ${(octets / 1e6).toFixed(1)} Mo, en ${Math.round((Date.now() - debut) / 1000)} s`);
}

main().catch((erreur) => {
  console.error(erreur);
  process.exit(1);
});
