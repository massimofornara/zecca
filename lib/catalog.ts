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

export const SHOP_CATEGORIES = [
  { slug: "dispensa", label: "Dispensa" },
  { slug: "cantina", label: "Cantina" },
  { slug: "tavola", label: "Tavola" },
  { slug: "bottega", label: "Bottega" },
  { slug: "tessuti", label: "Tessuti" },
  { slug: "corpo", label: "Corpo e casa" },
] as const;

export type ShopCategory = (typeof SHOP_CATEGORIES)[number]["slug"];

export type CatalogProduct = {
  slug: string;
  supplierSlug: string;
  name: string;
  imageKey: ProductArtKey;
  priceCredits: number;
  stock: number;
  category: ShopCategory;
  description: string;
};

export const CATALOG_SEED: readonly CatalogProduct[] = [
  {
    slug: "olio-del-frantoio-vecchio",
    supplierSlug: "frantoio-del-crinale",
    name: "Olio Cru Taggiasca — Riserva del Crinale",
    imageKey: "olio",
    priceCredits: 86,
    stock: 18,
    category: "dispensa",
    description:
      "Monovarietale taggiasca, olive raccolte a mano sul crinale e molite a freddo il giorno stesso. Bottiglia da 500 ml in vetro scuro, collo sigillato a cera, numerata. Piccante pulito, erba e mandorla amara.",
  },
  {
    slug: "olio-novello-taggiasca",
    supplierSlug: "frantoio-del-crinale",
    name: "Olio Novello Taggiasca — Prima spremitura",
    imageKey: "olio",
    priceCredits: 64,
    stock: 20,
    category: "dispensa",
    description:
      "Il primo olio della campagna: verde, torbido, profumo di carciofo. Latta da 250 ml, da finire in pochi mesi. Non è la riserva: è l’annata viva.",
  },
  {
    slug: "olive-taggiasche-salamoia",
    supplierSlug: "oliveto-di-taggia",
    name: "Olive Taggiasche in Salamoia",
    imageKey: "olio",
    priceCredits: 32,
    stock: 30,
    category: "dispensa",
    description:
      "Olive intere, denocciolate a mano, in salamoia di mare e alloro. Vaso da 310 g. Per la tavola, non per l’aperitivo in plastica.",
  },
  {
    slug: "pasta-di-olive-crinale",
    supplierSlug: "oliveto-di-taggia",
    name: "Pasta di Olive — Crinale",
    imageKey: "olio",
    priceCredits: 38,
    stock: 24,
    category: "dispensa",
    description:
      "Solo taggiasca, olio cru e un filo di origano. Vaso da 180 g. Sulla bruschetta o nel condimento, senza acciughe e senza zucchero.",
  },
  {
    slug: "pesto-genovese-pra",
    supplierSlug: "pestoteca-pra",
    name: "Pesto di Pra — Mortaio",
    imageKey: "olio",
    priceCredits: 44,
    stock: 22,
    category: "dispensa",
    description:
      "Basilico di Pra, pinoli, parmigiano, pecorino, aglio e olio cru. Pestato al mortaio, chiuso in vetro da 130 g, da tenere al fresco.",
  },
  {
    slug: "miele-di-castagno",
    supplierSlug: "apicoltura-millesimo",
    name: "Miele di Castagno — Millesimo",
    imageKey: "miele",
    priceCredits: 48,
    stock: 22,
    category: "dispensa",
    description:
      "Un solo raccolto, arnie dietro la zecca. Miele scuro, amaro nobile, non pastorizzato. Vaso in cristallo da 250 g, cucchiaio d’argento a parte se lo chiedi.",
  },
  {
    slug: "confettura-di-fichi",
    supplierSlug: "composta-del-fico",
    name: "Confettura di Fichi — Costa",
    imageKey: "miele",
    priceCredits: 36,
    stock: 18,
    category: "dispensa",
    description:
      "Fichi della costa, poco zucchero, cottura lenta. Vaso da 220 g. Per il pecorino o per il pane di ieri.",
  },
  {
    slug: "sale-della-macchia",
    supplierSlug: "erbe-della-macchia",
    name: "Sale alle Erbe della Macchia",
    imageKey: "sapone",
    priceCredits: 22,
    stock: 36,
    category: "dispensa",
    description:
      "Sale marino, rosmarino, timo, alloro e scorza di limone. Barattolo da 150 g. Basta poco, sulla carne o sul pane.",
  },
  {
    slug: "farina-di-castagne",
    supplierSlug: "mulino-delle-castagne",
    name: "Farina di Castagne — Mulino",
    imageKey: "caffe",
    priceCredits: 34,
    stock: 16,
    category: "dispensa",
    description:
      "Castagne essiccate e macinate a pietra. Sacco da 500 g. Per castagnaccio, pasta fresca o una polenta dolce.",
  },
  {
    slug: "caffe-della-macina",
    supplierSlug: "torrefazione-della-macina",
    name: "Caffè della Macina — Tostatura in padella",
    imageKey: "caffe",
    priceCredits: 42,
    stock: 28,
    category: "dispensa",
    description:
      "Lotto singolo tostato in padella di ferro e chiuso in latta nera da 250 g. Corpo denso, cacao e scorza. Macinato solo se lo chiedi in nota.",
  },
  {
    slug: "tisana-del-crinale",
    supplierSlug: "erboristeria-crinale",
    name: "Tisana del Crinale — Erbe secche",
    imageKey: "caffe",
    priceCredits: 26,
    stock: 20,
    category: "dispensa",
    description:
      "Melissa, tiglio, rosa canina e un filo di menta. Sacchetto di carta da 80 g. Infuso della sera, senza aromi.",
  },
  {
    slug: "cioccolato-delle-cinque",
    supplierSlug: "cioccolateria-albenga",
    name: "Cioccolato Fondente — Cinque Terre",
    imageKey: "caffe",
    priceCredits: 46,
    stock: 14,
    category: "dispensa",
    description:
      "Tavoletta da 80 g, 75% cacao, sale della costa. Temperata in bottega, carta d’archivio. Non è un souvenir.",
  },
  {
    slug: "biscotti-al-castagno",
    supplierSlug: "forno-del-miele",
    name: "Biscotti al Castagno e Miele",
    imageKey: "miele",
    priceCredits: 30,
    stock: 20,
    category: "dispensa",
    description:
      "Farina di castagne, miele di Millesimo, burro. Scatola di latta da 200 g. Si sbriciolano: è il segno che sono fatti a mano.",
  },
  {
    slug: "pecorino-pennavaire",
    supplierSlug: "caseificio-pennavaire",
    name: "Pecorino Pennavaire — Stagionato",
    imageKey: "miele",
    priceCredits: 68,
    stock: 10,
    category: "dispensa",
    description:
      "Forma piccola, crosta naturale, pasta secca. Circa 400 g. Latte delle pecore della valle, stagionato otto mesi.",
  },
  {
    slug: "vino-della-costa",
    supplierSlug: "cantina-della-costa",
    name: "Rossese della Costa — Annata della casa",
    imageKey: "vino",
    priceCredits: 72,
    stock: 14,
    category: "cantina",
    description:
      "Bottiglia da 750 ml, collo a cera. Vino della costa: ciliegia, macchia, sale. Da bere, non da esporre. Una sola annata in cantina.",
  },
  {
    slug: "aceto-di-rossese",
    supplierSlug: "acetificio-noli",
    name: "Aceto di Rossese — Botte piccola",
    imageKey: "vino",
    priceCredits: 40,
    stock: 16,
    category: "cantina",
    description:
      "Aceto di vino rosso, invecchiato in botte. Bottiglia da 250 ml. Per l’insalata e per spegnere una padella, non per lo scaffale.",
  },
  {
    slug: "liquore-di-mirto",
    supplierSlug: "distilleria-mirto",
    name: "Liquore di Mirto — Bacche della macchia",
    imageKey: "vino",
    priceCredits: 78,
    stock: 12,
    category: "cantina",
    description:
      "Bacche di mirto macerate, bottiglia da 500 ml. Dolce ma pulito. Si beve fresco, dopo cena, in un bicchiere piccolo.",
  },
  {
    slug: "grappa-di-vinaccia",
    supplierSlug: "cantina-della-costa",
    name: "Grappa di Vinaccia — Distillata in casa",
    imageKey: "vino",
    priceCredits: 88,
    stock: 8,
    category: "cantina",
    description:
      "Vinaccia del Rossese, alambicco a bagnomaria. 500 ml, 42°. Niente erbe, niente vaniglia: solo vinaccia e legno.",
  },
  {
    slug: "vermouth-della-rada",
    supplierSlug: "vermutteria-della-rada",
    name: "Vermouth della Rada — Erbe di porto",
    imageKey: "vino",
    priceCredits: 74,
    stock: 11,
    category: "cantina",
    description:
      "Vino bianco, assenzio, arancio amaro e un filo di china. Bottiglia da 750 ml. Per un bicchiere solo, con ghiaccio e scorza.",
  },
  {
    slug: "taccuino-in-pelle",
    supplierSlug: "legatoria-costa",
    name: "Taccuino in Pelle di Capra — Edizione cucita",
    imageKey: "taccuino",
    priceCredits: 120,
    stock: 10,
    category: "bottega",
    description:
      "Carta di cotone a filo, copertina in pelle conciata in bottega, taglio in oro. Cento fogli. Ogni esemplare porta il segno del coltello di casa.",
  },
  {
    slug: "inchiostro-di-noce",
    supplierSlug: "officina-del-mallo",
    name: "Inchiostro di Noce — Flacone soffiato",
    imageKey: "inchiostro",
    priceCredits: 36,
    stock: 24,
    category: "bottega",
    description:
      "Decotto di mallo, ferro e gomma arabica in flacone di vetro soffiato da 30 ml, collo dorato. Si ossida sul foglio in un bruno da archivio.",
  },
  {
    slug: "carta-da-lettere",
    supplierSlug: "cartiera-albenga",
    name: "Carta da Lettere — Cotone a filo",
    imageKey: "taccuino",
    priceCredits: 33,
    stock: 26,
    category: "bottega",
    description:
      "Ventiquattro fogli e dodici buste, cotone, filigrana della cartiera. Per una lettera vera, non per la stampante.",
  },
  {
    slug: "sigillo-di-cera",
    supplierSlug: "cartiera-albenga",
    name: "Sigillo di Cera e Timbrino",
    imageKey: "candele",
    priceCredits: 29,
    stock: 18,
    category: "bottega",
    description:
      "Bastoncini di cera d’api e un timbrino in ottone con la Z. Per chiudere una busta come si faceva.",
  },
  {
    slug: "cintura-di-cuoio",
    supplierSlug: "pelletteria-del-porto",
    name: "Cintura di Cuoio — Fibbia in ottone",
    imageKey: "taccuino",
    priceCredits: 125,
    stock: 9,
    category: "bottega",
    description:
      "Cuoio vegetale, cucita a mano, fibbia in ottone. Una misura da accorciare in bottega se lo chiedi nella nota.",
  },
  {
    slug: "portafoglio-in-pelle",
    supplierSlug: "pelletteria-del-porto",
    name: "Portafoglio in Pelle — Senza logo",
    imageKey: "taccuino",
    priceCredits: 98,
    stock: 12,
    category: "bottega",
    description:
      "Pelle di vitello, due scomparti, cucitura a filo. Si piega e basta. Nessuna scritta fuori.",
  },
  {
    slug: "lino-della-casa",
    supplierSlug: "tessitura-dellorlo",
    name: "Tovaglia di Lino — Orlo a giorno",
    imageKey: "lino",
    priceCredits: 160,
    stock: 8,
    category: "tavola",
    description:
      "Lino avorio tessuto a mano, orlo a giorno, nastro di seta. Per la tavola di festa, non per il cassetto. Misura 180 × 140.",
  },
  {
    slug: "tovaglioli-di-lino",
    supplierSlug: "tessitura-dellorlo",
    name: "Tovaglioli di Lino — Quattro pezzi",
    imageKey: "lino",
    priceCredits: 52,
    stock: 14,
    category: "tavola",
    description:
      "Quattro tovaglioli 45 × 45, stesso lino della tovaglia, orlo a mano. Si lavano e si stirano: è il loro lavoro.",
  },
  {
    slug: "argento-da-tavola",
    supplierSlug: "argenteria-sanremo",
    name: "Cucchiaio d’Argento 925 — Argenteria",
    imageKey: "argento",
    priceCredits: 95,
    stock: 12,
    category: "tavola",
    description:
      "Un cucchiaio da tavola in argento 925, fuso e limato in bottega, patina calda. Marchio di casa sotto il manico. Si vende a pezzo, non a servizio.",
  },
  {
    slug: "pentola-di-rame",
    supplierSlug: "ramificio-oneglia",
    name: "Pentola di Rame — Fondo stagnato",
    imageKey: "argento",
    priceCredits: 220,
    stock: 5,
    category: "tavola",
    description:
      "Rame martellato, diametro 24 cm, manici in ferro. Per sughi lunghi. Si passa di generazione, non si mette in lavastoviglie.",
  },
  {
    slug: "coltello-da-cucina",
    supplierSlug: "coltelleria-san-siro",
    name: "Coltello da Cucina — Lama carbonio",
    imageKey: "argento",
    priceCredits: 145,
    stock: 7,
    category: "tavola",
    description:
      "Lama in acciaio al carbonio, manico in ulivo, 18 cm. Arriva affilato. Si lava a mano e si affila, come un attrezzo.",
  },
  {
    slug: "tagliere-di-ulivo",
    supplierSlug: "legno-di-ulivo",
    name: "Tagliere di Ulivo — Unico pezzo",
    imageKey: "olio",
    priceCredits: 90,
    stock: 9,
    category: "tavola",
    description:
      "Una fetta di ulivo, corteccia lasciata, olio di lino. Circa 35 cm. Ogni pezzo è diverso: è l’albero, non uno stampo.",
  },
  {
    slug: "bicchiere-soffiato",
    supplierSlug: "vetreria-finale",
    name: "Bicchiere Soffiato — Set di due",
    imageKey: "inchiostro",
    priceCredits: 58,
    stock: 12,
    category: "tavola",
    description:
      "Due bicchieri da vino, vetro soffiato, piede corto. Irregolari di proposito. Per il Rossese, non per la vetrina.",
  },
  {
    slug: "piatto-albissola",
    supplierSlug: "fornace-albissola",
    name: "Piatto di Albissola — Maiolica",
    imageKey: "lino",
    priceCredits: 62,
    stock: 10,
    category: "tavola",
    description:
      "Piatto piano, smalto blu e bianco, cottura in fornace. Diametro 26 cm. Si usa in tavola, si scheggia se lo tratti male.",
  },
  {
    slug: "vaso-da-olio",
    supplierSlug: "fornace-albissola",
    name: "Vaso da Olio — Terracotta smaltata",
    imageKey: "lino",
    priceCredits: 84,
    stock: 8,
    category: "tavola",
    description:
      "Orcio piccolo, smalto interno, tappo in sughero. Per tenere l’olio in cucina, non per decorare una mensola.",
  },
  {
    slug: "lampada-a-olio",
    supplierSlug: "cereria-delle-arnie",
    name: "Lampada a Olio — Bronzo e vetro",
    imageKey: "candele",
    priceCredits: 110,
    stock: 6,
    category: "tavola",
    description:
      "Corpo in bronzo, serbatoio in vetro, stoppino di lino. Brucia olio della casa. Luce bassa, per la cena.",
  },
  {
    slug: "sciarpa-cardata",
    supplierSlug: "lanificio-di-costa",
    name: "Sciarpa di Lana e Cachemire — Telaio",
    imageKey: "sciarpa",
    priceCredits: 180,
    stock: 6,
    category: "tessuti",
    description:
      "Lana delle pecore di Costa e cachemire cardati, tessuti al telaio, non tinti. Colore bronzo naturale. Un capo per inverno, non una serie.",
  },
  {
    slug: "seta-di-ventimiglia",
    supplierSlug: "setificio-ventimiglia",
    name: "Foulard di Seta — Telaio ligure",
    imageKey: "seta",
    priceCredits: 140,
    stock: 7,
    category: "tessuti",
    description:
      "Seta bronzo e verde, telaio stretto, orli a mano. Un metro quadro. Per il collo o per coprire un pane, come si usava.",
  },
  {
    slug: "coperta-di-lana",
    supplierSlug: "lanificio-di-costa",
    name: "Coperta di Lana — Telaio largo",
    imageKey: "sciarpa",
    priceCredits: 240,
    stock: 4,
    category: "tessuti",
    description:
      "Lana grezza, 180 × 140, frangia a mano. Pesa. Per il letto d’inverno o per la sedia vicino al fuoco.",
  },
  {
    slug: "guanti-cardati",
    supplierSlug: "lanificio-di-costa",
    name: "Guanti Cardati — Lana di Costa",
    imageKey: "sciarpa",
    priceCredits: 76,
    stock: 10,
    category: "tessuti",
    description:
      "Paio lavorato ai ferri, lana non tinta, palmo rinforzato. Caldi e un poco ruvidi. Una taglia media, si assestano.",
  },
  {
    slug: "candele-dape",
    supplierSlug: "cereria-delle-arnie",
    name: "Candele d’Ape — Cera vergine",
    imageKey: "candele",
    priceCredits: 54,
    stock: 16,
    category: "corpo",
    description:
      "Coppia colata a mano in cera d’api della stessa famiglia del miele, stoppino di lino, base in bronzo. Bruciano lente, senza profumo aggiunto.",
  },
  {
    slug: "sapone-alloro",
    supplierSlug: "saponificio-alloro",
    name: "Sapone all’Alloro — Saponificio di casa",
    imageKey: "sapone",
    priceCredits: 28,
    stock: 20,
    category: "corpo",
    description:
      "Saponetta all’olio cru e foglie d’alloro pestate, stagionata tre mesi. Forma irregolare, su piattino di alabastro se lo prendi in coppia.",
  },
  {
    slug: "olio-da-bagno",
    supplierSlug: "saponificio-alloro",
    name: "Olio da Bagno — Alloro e oliva",
    imageKey: "sapone",
    priceCredits: 48,
    stock: 14,
    category: "corpo",
    description:
      "Olio di oliva, alloro e un filo di lavanda. Flacone da 200 ml. Poche gocce nell’acqua. Niente schiuma e niente plastica profumata.",
  },
  {
    slug: "profumo-alloro",
    supplierSlug: "profumeria-delle-foglie",
    name: "Acqua di Alloro — Estratto",
    imageKey: "sapone",
    priceCredits: 82,
    stock: 8,
    category: "corpo",
    description:
      "Foglia d’alloro, bergamotto e legno. 50 ml, alcool di vino. Odore di cucina di casa, non di vetrina.",
  },
  {
    slug: "anello-dargento",
    supplierSlug: "oreficeria-del-capo",
    name: "Anello d’Argento — Fascia liscia",
    imageKey: "argento",
    priceCredits: 160,
    stock: 6,
    category: "corpo",
    description:
      "Fascia in argento 925, martellata, senza pietre. Si regola in bottega se indichi la misura nella nota.",
  },
] as const;

const CATEGORY_BY_SLUG = new Map(CATALOG_SEED.map((product) => [product.slug, product.category]));

export function categoryOf(slug: string): ShopCategory | null {
  return CATEGORY_BY_SLUG.get(slug) ?? null;
}

export function shopCategoryLabel(slug: string | null | undefined) {
  if (!slug) return "Bottega";
  return SHOP_CATEGORIES.find((category) => category.slug === slug)?.label ?? "Bottega";
}

export function catalogProductFields(product: CatalogProduct) {
  const { supplierSlug: _supplierSlug, category: _category, ...fields } = product;
  return fields;
}
