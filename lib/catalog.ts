export const PRODUCT_ART = [
  "olio",
  "miele",
  "taccuino",
  "inchiostro",
  "candele",
  "caffe",
  "sciarpa",
  "sapone",
  "lino",
  "argento",
  "vino",
  "seta",
] as const;

export type ProductArtKey = (typeof PRODUCT_ART)[number];

export const PRODUCT_ART_LABELS: Record<ProductArtKey, string> = {
  olio: "Olio cru",
  miele: "Miele millesimo",
  taccuino: "Taccuino",
  inchiostro: "Inchiostro",
  candele: "Candele",
  caffe: "Caffè",
  sciarpa: "Sciarpa",
  sapone: "Sapone",
  lino: "Lino",
  argento: "Argento",
  vino: "Vino",
  seta: "Seta",
};

export const CATALOG_SEED = [
  {
    slug: "olio-del-frantoio-vecchio",
    name: "Olio Cru Taggiasca — Riserva del Crinale",
    imageKey: "olio",
    priceCredits: 86,
    stock: 18,
    description:
      "Monovarietale taggiasca, olive raccolte a mano sul crinale e molite a freddo il giorno stesso. Bottiglia da 500 ml in vetro scuro, collo sigillato a cera, numerata. Piccante pulito, erba e mandorla amara.",
  },
  {
    slug: "miele-di-castagno",
    name: "Miele di Castagno — Millesimo",
    imageKey: "miele",
    priceCredits: 48,
    stock: 22,
    description:
      "Un solo raccolto, arnie dietro la zecca. Miele scuro, amaro nobile, non pastorizzato. Vaso in cristallo da 250 g, cucchiaio d’argento a parte se lo chiedi.",
  },
  {
    slug: "taccuino-in-pelle",
    name: "Taccuino in Pelle di Capra — Edizione cucita",
    imageKey: "taccuino",
    priceCredits: 120,
    stock: 10,
    description:
      "Carta di cotone a filo, copertina in pelle conciata in bottega, taglio in oro. Cento fogli. Ogni esemplare porta il segno del coltello di casa.",
  },
  {
    slug: "inchiostro-di-noce",
    name: "Inchiostro di Noce — Flacone soffiato",
    imageKey: "inchiostro",
    priceCredits: 36,
    stock: 24,
    description:
      "Decotto di mallo, ferro e gomma arabica in flacone di vetro soffiato da 30 ml, collo dorato. Si ossida sul foglio in un bruno da archivio.",
  },
  {
    slug: "candele-dape",
    name: "Candele d’Ape — Cera vergine",
    imageKey: "candele",
    priceCredits: 54,
    stock: 16,
    description:
      "Coppia colata a mano in cera d’api della stessa famiglia del miele, stoppino di lino, base in bronzo. Bruciano lente, senza profumo aggiunto.",
  },
  {
    slug: "caffe-della-macina",
    name: "Caffè della Macina — Tostatura in padella",
    imageKey: "caffe",
    priceCredits: 42,
    stock: 28,
    description:
      "Lotto singolo tostato in padella di ferro e chiuso in latta nera da 250 g. Corpo denso, cacao e scorza. Macinato solo se lo chiedi in nota.",
  },
  {
    slug: "sciarpa-cardata",
    name: "Sciarpa di Lana e Cachemire — Telaio",
    imageKey: "sciarpa",
    priceCredits: 180,
    stock: 6,
    description:
      "Lana delle pecore di Costa e cachemire cardati, tessuti al telaio, non tinti. Colore bronzo naturale. Un capo per inverno, non una serie.",
  },
  {
    slug: "sapone-alloro",
    name: "Sapone all’Alloro — Saponificio di casa",
    imageKey: "sapone",
    priceCredits: 28,
    stock: 20,
    description:
      "Saponetta all’olio cru e foglie d’alloro pestate, stagionata tre mesi. Forma irregolare, su piattino di alabastro se lo prendi in coppia.",
  },
  {
    slug: "lino-della-casa",
    name: "Tovaglia di Lino — Orlo a giorno",
    imageKey: "lino",
    priceCredits: 160,
    stock: 8,
    description:
      "Lino avorio tessuto a mano, orlo a giorno, nastro di seta. Per la tavola di festa, non per il cassetto. Misura 180 × 140.",
  },
  {
    slug: "argento-da-tavola",
    name: "Cucchiaio d’Argento 925 — Argenteria",
    imageKey: "argento",
    priceCredits: 95,
    stock: 12,
    description:
      "Un cucchiaio da tavola in argento 925, fuso e limato in bottega, patina calda. Marchio di casa sotto il manico. Si vende a pezzo, non a servizio.",
  },
  {
    slug: "vino-della-costa",
    name: "Rossese della Costa — Annata della casa",
    imageKey: "vino",
    priceCredits: 72,
    stock: 14,
    description:
      "Bottiglia da 750 ml, collo a cera. Vino della costa: ciliegia, macchia, sale. Da bere, non da esporre. Una sola annata in cantina.",
  },
  {
    slug: "seta-di-ventimiglia",
    name: "Foulard di Seta — Telaio ligure",
    imageKey: "seta",
    priceCredits: 140,
    stock: 7,
    description:
      "Seta bronzo e verde, telaio stretto, orli a mano. Un metro quadro. Per il collo o per coprire un pane, come si usava.",
  },
] as const;
