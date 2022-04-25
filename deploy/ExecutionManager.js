const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments, getChainId }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let proxyContract, proxyOwner;

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = deployer;
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
  }

  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
  );
  const strategyPrivateSale = await deployments.get("StrategyPrivateSale");
  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );

  const args = [];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("ExecutionManager", {
      from: deployer,
      proxy: {
        owner: proxyOwner,
        proxyContract: "OpenZeppelinTransparentProxy",
        viaAdminContract: "DefaultProxyAdmin",
        execute: {
          init: {
            methodName: "initialize",
            args: args,
          },
        },
      },
      log: true,
      deterministicDeployment: false,
    });
  })

  const executionManager = await ethers.getContract(
    "ExecutionManager",
    deployer
  );

  await executionManager.addStrategy(
    strategyAnyItemFromCollectionForFixedPrice.address
  );
  await executionManager.addStrategy(strategyPrivateSale.address);
  await executionManager.addStrategy(strategyStandardSaleForFixedPrice.address);

// await verify(proxyContract.address, args);
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyAnyItemFromCollectionForFixedPrice",
  "StrategyPrivateSale",
  "StrategyStandardSaleForFixedPrice",
];
