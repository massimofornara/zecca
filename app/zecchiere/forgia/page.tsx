import { saveForgeSettingsForm } from "@/actions/admin";
import { SubmitButton } from "@/components/forms/SubmitButton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSettings } from "@/lib/zecca/settings";

export const metadata = { title: "Forgia" };

export default async function ForgiaSettingsPage() {
  const settings = await getSettings();
  const tiers = settings.forgeTiers;

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-4xl text-primary">Regola la forgia</h1>
      <p className="mt-2 text-muted-foreground">
        Il tasso in euro e quello in dollari sono indipendenti (1 cr = X EUR, 1 cr = Y USD). Le
        soglie della forgia restano in crediti.
      </p>
      <form action={saveForgeSettingsForm} className="mt-8 space-y-6">
        <div className="space-y-1.5">
          <Label htmlFor="eurPerCredit">Euro per un credito</Label>
          <Input
            id="eurPerCredit"
            name="eurPerCredit"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={(settings.eurCentsPerCredit / 100).toFixed(2)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usdPerCredit">Dollari USA per un credito</Label>
          <Input
            id="usdPerCredit"
            name="usdPerCredit"
            type="number"
            step="0.01"
            min={0.01}
            defaultValue={(settings.usdCentsPerCredit / 100).toFixed(2)}
            required
          />
          <p className="text-xs text-muted-foreground">
            Predefinito: 1 cr = 1,00 EUR e 1 cr = 1,08 USD. Non è un cambio EUR/USD derivato: li
            imposti tu.
          </p>
        </div>
        <div className="space-y-4">
          <p className="text-sm uppercase tracking-[0.2em] text-primary/80">Soglie (spesa odierna)</p>
          {tiers.map((tier, i) => (
            <div key={i} className="grid grid-cols-3 gap-2">
              <label className="text-xs">
                Min
                <Input name={`tier${i}_min`} type="number" defaultValue={tier.minSpent} className="mt-1" />
              </label>
              <label className="text-xs">
                Max (vuoto = ∞)
                <Input
                  name={`tier${i}_max`}
                  type="number"
                  defaultValue={tier.maxSpent ?? ""}
                  className="mt-1"
                />
              </label>
              <label className="text-xs">
                % forgiato
                <Input name={`tier${i}_percent`} type="number" defaultValue={tier.percent} className="mt-1" />
              </label>
            </div>
          ))}
        </div>
        <SubmitButton>Salva regole</SubmitButton>
      </form>
    </div>
  );
}
