import { PrismaClient } from "@prisma/client";
import { CATALOG_SEED, catalogProductFields } from "../lib/catalog";
import { attachCatalogSuppliers } from "../lib/suppliers";
import { createShipmentsForOrder } from "../lib/zecca/shop";

const prisma = new PrismaClient();

async function main() {
  const suppliers = await attachCatalogSuppliers(prisma);
  for (const product of CATALOG_SEED) {
    const supplier = suppliers.get(product.supplierSlug);
    await prisma.product.upsert({
      where: { slug: product.slug },
      create: {
        ...catalogProductFields(product),
        active: true,
        supplierId: supplier?.id,
      },
      update: {
        ...catalogProductFields(product),
        active: true,
        supplierId: supplier?.id,
      },
    });
  }
  const orders = await prisma.order.findMany({ include: { shipments: true } });
  for (const order of orders) {
    if (order.shipments.length === 0) {
      await createShipmentsForOrder(order.id, prisma);
    }
  }
  console.log(`Catalogo aggiornato: ${CATALOG_SEED.length} pezzi, ${suppliers.size} fornitori. Massimo non imballa.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
