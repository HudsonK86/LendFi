import { mnemonicToAccount } from "viem/accounts";

const m = "test test test test test test test test test test test junk";
for (let i = 0; i < 20; i++) {
  const acc = mnemonicToAccount(m, { path: `m/44'/60'/0'/0/${i}` });
  console.log(acc.address);
}
