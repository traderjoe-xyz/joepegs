require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");
require("@nomiclabs/hardhat-waffle");
require("@openzeppelin/hardhat-upgrades");
require("dotenv").config();
require("hardhat-abi-exporter");
require("hardhat-contract-sizer");
require("hardhat-deploy");
require("hardhat-deploy-ethers");
require("solidity-coverage");
require("./tasks/transfer-ownerships");

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.8.10",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: process.env.DEPLOY_PRIVATE_KEY
        ? [process.env.DEPLOY_PRIVATE_KEY]
        : [],
      chainId: 43114,
      live: true,
      saveDeployments: true,
      gasPrice: 225_000_000_000,
    },
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      gasPrice: 225_000_000_000,
      gasLimit: 8_000_000_000,
      chainId: 43113,
      accounts: process.env.DEPLOY_PRIVATE_KEY
        ? [process.env.DEPLOY_PRIVATE_KEY]
        : [],
    },
    bscTestnet: {
      url: process.env.BSC_TESTNET_RPC_ENDPOINT,
      gasPrice: 20_000_000_000,
      chainId: 97,
      accounts: process.env.BSC_TESTNET_DEPLOYER
        ? [process.env.BSC_TESTNET_DEPLOYER]
        : [],
    },
    bsc: {
      url: process.env.BSC_RPC_ENDPOINT,
      gasPrice: 5_000_000_000,
      chainId: 56,
      accounts: process.env.BSC_TESTNET_DEPLOYER
        ? [process.env.BSC_TESTNET_DEPLOYER]
        : [],
    },
  },
  contractSizer: {
    strict: true,
  },
  namedAccounts: {
    deployer: 0,
    dev: 1,
  },
  etherscan: {
    apiKey: {
      // See https://hardhat.org/plugins/nomiclabs-hardhat-etherscan.html#multiple-api-keys-and-alternative-block-explorers
      avalanche: process.env.SNOWTRACE_API_KEY,
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY,
      bscTestnet: process.env.BSC_API_KEY,
      bsc: process.env.BSC_API_KEY,
    },
  },
};
