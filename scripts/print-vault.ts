import { shopBtcAddress, shopWalletAddress } from "../lib/zecca/shop-payout";
import { getShopNetworkVault } from "../lib/zecca/shop-vault";

async function main() {
  console.log("btc", shopBtcAddress());
  console.log("evm", shopWalletAddress());
  const vault = await getShopNetworkVault();
  for (const asset of vault.assets) {
    console.log(`${asset.id}\t${asset.amountLabel}\tfunded=${asset.hasFunds}\t${asset.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
