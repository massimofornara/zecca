export const PRODUCT_ART = [
  "olio",
  "miele",
  "taccuino",
  "inchiostro",
  "candele",
  "caffe",
  "sciarpa",
  "sapone",
] as const;

export type ProductArtKey = (typeof PRODUCT_ART)[number];

export const PRODUCT_ART_LABELS: Record<ProductArtKey, string> = {
  olio: "Olio",
  miele: "Miele",
  taccuino: "Taccuino",
  inchiostro: "Inchiostro",
  candele: "Candele",
  caffe: "Caffè",
  sciarpa: "Sciarpa",
  sapone: "Sapone",
};

export const CATALOG_SEED = [
  {
    slug: "olio-del-frantoio-vecchio",
    name: "Olio del Frantoio Vecchio",
    imageKey: "olio",
    priceCredits: 18,
    stock: 24,
    description:
      "Prima spremitura delle olive taggiasche raccolte a mano sul crinale. Bottiglia da 500 ml, sapore verde e un po’ piccante, come l’aria di novembre.",
  },
  {
    slug: "miele-di-castagno",
    name: "Miele di Castagno",
    imageKey: "miele",
    priceCredits: 12,
    stock: 30,
    description:
      "Miele scuro, amaro in modo nobile. Lo smeliamo a giugno dalle arnie dietro la zecca. Vaso da 250 g, tappo in sughero.",
  },
  {
    slug: "taccuino-in-pelle",
    name: "Taccuino in Pelle di Capra",
    imageKey: "taccuino",
    priceCredits: 28,
    stock: 14,
    description:
      "Carta di cotone cucita a filo, copertina in pelle conciata in bottega. Cento fogli. Per conti, ricette, o il primo verso che non vuoi perdere.",
  },
  {
    slug: "inchiostro-di-noce",
    name: "Inchiostro di Noce",
    imageKey: "inchiostro",
    priceCredits: 9,
    stock: 36,
    description:
      "Decotto di mallo, ferro e gomma arabica. Si ossida sul foglio in un bruno profondo. Flacone da 30 ml con contagocce in vetro.",
  },
  {
    slug: "candele-dape",
    name: "Candele d’Ape",
    imageKey: "candele",
    priceCredits: 14,
    stock: 20,
    description:
      "Coppia di candele in cera d’api della stessa famiglia del miele. Bruciano lente, profumano di favo. Stoppino di lino.",
  },
  {
    slug: "caffe-della-macina",
    name: "Caffè della Macina",
    imageKey: "caffe",
    priceCredits: 11,
    stock: 40,
    description:
      "Miscela tostata in padella di ferro, macinata al momento del confezionamento. 250 g. Corpo medio, chiusura di cacao e scorza.",
  },
  {
    slug: "sciarpa-cardata",
    name: "Sciarpa di Lana Cardata",
    imageKey: "sciarpa",
    priceCredits: 42,
    stock: 8,
    description:
      "Lana delle pecore di Costa, cardata e tessuta al telaio. Colore bronzo naturale, non tinto. Calda senza essere pesante.",
  },
  {
    slug: "sapone-alloro",
    name: "Sapone all’Alloro",
    imageKey: "sapone",
    priceCredits: 8,
    stock: 32,
    description:
      "Saponetta all’olio d’oliva e foglie d’alloro pestate. Per le mani dopo il lavoro in bottega. Forma irregolare, come deve essere.",
  },
] as const;
