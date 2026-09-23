import { createConfig, http, injected } from "wagmi";
import { sepolia } from "wagmi/chains";

import { SEPOLIA_RPC_URL } from "./contract";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(SEPOLIA_RPC_URL),
  },
  ssr: true,
});