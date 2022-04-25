const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments, getChainId }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = getChainId();

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = deployer;
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
  }

  const joepegExchange = await deployments.get("JoepegExchange");

  const args = [joepegExchange.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("TransferManagerERC1155", {
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

  await verify(proxyContract.address, args);
};

module.exports.tags = ["TransferManagerERC1155"];
module.exports.dependencies = ["JoepegExchange"];
