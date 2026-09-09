import { settlementProviderHealth } from "../lib/settlement/pipeline";
import { mintContractForAsset } from "../lib/zecca/token-mint";
import { shopWalletAddress } from "../lib/zecca/shop-payout";
import { shopBtcAddress } from "../lib/zecca/btc-payout";

async function main() {
  console.log("shop evm", shopWalletAddress());
  console.log("shop btc", shopBtcAddress());
  console.log("mint USDT", mintContractForAsset("USDT"));
  console.log("mint USDC", mintContractForAsset("USDC"));
  console.log("mint ZECCA", mintContractForAsset("ZECCA"));
  for (const provider of settlementProviderHealth()) {
    console.log(`${provider.ready ? "READY" : "OFF "} ${provider.id}\t${provider.detail}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
