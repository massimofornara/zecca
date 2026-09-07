import type { PrismaClient } from "@prisma/client";

export const SUPPLIER_SEED = [
  {
    slug: "frantoio-del-crinale",
    name: "Frantoio del Crinale",
    company: "Frantoio del Crinale S.n.c.",
    street: "Strada del Crinale 14",
    city: "Dolcedo",
    postal: "18020",
    phone: "+390183280014",
    email: "spedizioni@frantoiodelcrinale.it",
  },
  {
    slug: "apicoltura-millesimo",
    name: "Apicoltura Millesimo",
    company: "Apicoltura Millesimo di Brea",
    street: "Via delle Arnie 3",
    city: "Millesimo",
    postal: "17017",
    phone: "+39019754003",
    email: "ordini@apicolturamillesimo.it",
  },
  {
    slug: "legatoria-costa",
    name: "Legatoria Costa",
    company: "Legatoria Costa",
    street: "Vicolo del Cuoio 7",
    city: "Albenga",
    postal: "17031",
    phone: "+39018255107",
    email: "bottega@legatoriacosta.it",
  },
  {
    slug: "officina-del-mallo",
    name: "Officina del Mallo",
    company: "Officina del Mallo",
    street: "Via del Molo 9",
    city: "Noli",
    postal: "17026",
    phone: "+39019748912",
    email: "inchiostro@officinalmallo.it",
  },
  {
    slug: "cereria-delle-arnie",
    name: "Cereria delle Arnie",
    company: "Cereria delle Arnie",
    street: "Contrada delle Api 2",
    city: "Calice Ligure",
    postal: "17020",
    phone: "+39019759021",
    email: "cera@cereriadellearnie.it",
  },
  {
    slug: "torrefazione-della-macina",
    name: "Torrefazione della Macina",
    company: "Torrefazione della Macina",
    street: "Via Paleocapa 22",
    city: "Savona",
    postal: "17100",
    phone: "+39019820114",
    email: "lotti@macina.coffee",
  },
  {
    slug: "lanificio-di-costa",
    name: "Lanificio di Costa",
    company: "Lanificio di Costa",
    street: "Via del Telaio 5",
    city: "Pieve di Teco",
    postal: "18026",
    phone: "+39018336108",
    email: "tessuti@lanificiodicosta.it",
  },
  {
    slug: "saponificio-alloro",
    name: "Saponificio all’Alloro",
    company: "Saponificio all’Alloro",
    street: "Via Soleri 11",
    city: "Taggia",
    postal: "18018",
    phone: "+39018447520",
    email: "saponi@alloro.liguria.it",
  },
  {
    slug: "tessitura-dellorlo",
    name: "Tessitura dell’Orlo",
    company: "Tessitura dell’Orlo",
    street: "Corso Repubblica 40",
    city: "Ventimiglia",
    postal: "18039",
    phone: "+39018435122",
    email: "lino@tessituradellorlo.it",
  },
  {
    slug: "argenteria-sanremo",
    name: "Argenteria di Sanremo",
    company: "Argenteria di Sanremo",
    street: "Via Palazzo 8",
    city: "Sanremo",
    postal: "18038",
    phone: "+39018450733",
    email: "laboratorio@argenteriasanremo.it",
  },
  {
    slug: "cantina-della-costa",
    name: "Cantina della Costa",
    company: "Cantina della Costa",
    street: "Strada del Rossese 16",
    city: "Dolceacqua",
    postal: "18035",
    phone: "+39018420641",
    email: "cantina@costarossese.it",
  },
  {
    slug: "setificio-ventimiglia",
    name: "Setificio di Ventimiglia",
    company: "Setificio di Ventimiglia",
    street: "Via Hanbury 19",
    city: "Ventimiglia",
    postal: "18039",
    phone: "+39018435188",
    email: "seta@setificiovtm.it",
  },
] as const;

export type SupplierSlug = (typeof SUPPLIER_SEED)[number]["slug"];

export const PRODUCT_SUPPLIER: Record<string, SupplierSlug> = {
  "olio-del-frantoio-vecchio": "frantoio-del-crinale",
  "miele-di-castagno": "apicoltura-millesimo",
  "taccuino-in-pelle": "legatoria-costa",
  "inchiostro-di-noce": "officina-del-mallo",
  "candele-dape": "cereria-delle-arnie",
  "caffe-della-macina": "torrefazione-della-macina",
  "sciarpa-cardata": "lanificio-di-costa",
  "sapone-alloro": "saponificio-alloro",
  "lino-della-casa": "tessitura-dellorlo",
  "argento-da-tavola": "argenteria-sanremo",
  "vino-della-costa": "cantina-della-costa",
  "seta-di-ventimiglia": "setificio-ventimiglia",
};

export function formatSupplierSeat(supplier: {
  name: string;
  street: string;
  postal: string;
  city: string;
}) {
  return `${supplier.name} · ${supplier.street}, ${supplier.postal} ${supplier.city}`;
}

export async function upsertSuppliers(db: PrismaClient) {
  const bySlug = new Map<string, { id: string; slug: string }>();
  for (const supplier of SUPPLIER_SEED) {
    const row = await db.supplier.upsert({
      where: { slug: supplier.slug },
      create: { ...supplier },
      update: {
        name: supplier.name,
        company: supplier.company,
        street: supplier.street,
        city: supplier.city,
        postal: supplier.postal,
        phone: supplier.phone,
        email: supplier.email,
      },
    });
    bySlug.set(row.slug, row);
  }
  return bySlug;
}

export async function attachCatalogSuppliers(db: PrismaClient) {
  const bySlug = await upsertSuppliers(db);
  for (const [productSlug, supplierSlug] of Object.entries(PRODUCT_SUPPLIER)) {
    const supplier = bySlug.get(supplierSlug);
    if (!supplier) continue;
    await db.product.updateMany({
      where: { slug: productSlug },
      data: { supplierId: supplier.id },
    });
  }
  return bySlug;
}
