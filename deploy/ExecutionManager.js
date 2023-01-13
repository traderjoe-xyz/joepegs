const { verify } = require("./utils");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  const chainId = await getChainId();

  let proxyContract, proxyOwner;

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = "0xdB40a7b71642FE24CC546bdF4749Aa3c0B042f78";
  } else if (chainId == 97) {
    proxyOwner = "0x597E2587eCA945fB001BAdF1adF878CcB8e368b6";
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x64c4607AD853999EE5042Ba8377BfC4099C273DE";
  }

  const strategyStandardSaleForFixedPrice = await deployments.get(
    "StrategyStandardSaleForFixedPrice"
  );
  const strategyAnyItemFromCollectionForFixedPrice = await deployments.get(
    "StrategyAnyItemFromCollectionForFixedPrice"
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
  });

  const executionManager = await ethers.getContract(
    "ExecutionManager",
    deployer
  );

  if (proxyContract && proxyContract.newlyDeployed) {
    await executionManager.addStrategy(
      strategyStandardSaleForFixedPrice.address
    );
    await executionManager.addStrategy(
      strategyAnyItemFromCollectionForFixedPrice.address
    );
  }

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["ExecutionManager"];
module.exports.dependencies = [
  "StrategyStandardSaleForFixedPrice",
  "StrategyAnyItemFromCollectionForFixedPrice",
];
