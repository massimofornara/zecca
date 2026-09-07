import { PrismaClient } from "@prisma/client";
import { CATALOG_SEED } from "../lib/catalog";

const prisma = new PrismaClient();

async function main() {
  for (const product of CATALOG_SEED) {
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: { ...product, active: true },
      update: {
        name: product.name,
        description: product.description,
        imageKey: product.imageKey,
        priceCredits: product.priceCredits,
        stock: product.stock,
        active: true,
      },
    });
  }
  console.log(`Catalogo aggiornato: ${CATALOG_SEED.length} pezzi di fattura.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
