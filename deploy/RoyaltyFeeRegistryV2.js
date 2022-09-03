const { verify } = require("./utils");

module.exports = async function ({
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = await getChainId();

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = "0xdB40a7b71642FE24CC546bdF4749Aa3c0B042f78";
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x64c4607AD853999EE5042Ba8377BfC4099C273DE";
  }

  const royaltyFeeLimit = 2000; // 2000 = 20%
  const maxNumRecipients = 5;

  const args = [royaltyFeeLimit, maxNumRecipients];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("RoyaltyFeeRegistryV2", {
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

  // Initialize implementation contract
  const implementationContract = await ethers.getContractAt(
    "RoyaltyFeeRegistryV2",
    proxyContract.implementation
  );
  await implementationContract.initialize(...args);

  await verify(proxyContract.implementation, []);
};

module.exports.tags = ["RoyaltyFeeRegistryV2"];
