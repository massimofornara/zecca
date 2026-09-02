import { upsertProductForm } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRODUCT_ART, PRODUCT_ART_LABELS } from "@/lib/catalog";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";

export default async function ProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const isNew = id === "nuovo";
  const product = isNew ? null : await prisma.product.findUnique({ where: { id } });
  if (!isNew && !product) notFound();

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-4xl text-primary">{isNew ? "Nuovo pezzo" : "Modifica pezzo"}</h1>
      <form action={upsertProductForm} className="mt-8 space-y-4">
        {product && <input type="hidden" name="id" value={product.id} />}
        <Field label="Nome" name="name" defaultValue={product?.name} />
        <Field label="Slug" name="slug" defaultValue={product?.slug} />
        <div className="space-y-1.5">
          <Label htmlFor="description">Descrizione</Label>
          <Textarea id="description" name="description" rows={4} defaultValue={product?.description} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="imageKey">Impronta</Label>
          <select
            id="imageKey"
            name="imageKey"
            defaultValue={product?.imageKey ?? "olio"}
            className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
          >
            {PRODUCT_ART.map((key) => (
              <option key={key} value={key}>
                {PRODUCT_ART_LABELS[key]}
              </option>
            ))}
          </select>
        </div>
        <Field label="Prezzo (crediti)" name="priceCredits" type="number" defaultValue={product?.priceCredits ?? 10} />
        <Field label="Scorte" name="stock" type="number" defaultValue={product?.stock ?? 10} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" value="on" defaultChecked={product?.active ?? true} />
          In vetrina
        </label>
        <SubmitButton>Salva</SubmitButton>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} defaultValue={defaultValue} required />
    </div>
  );
}
