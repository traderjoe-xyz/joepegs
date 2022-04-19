const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract;

  const royaltyFeeRegistry = await deployments.get("RoyaltyFeeRegistry");

  const args = [royaltyFeeRegistry.address];
  await catchUnknownSigner(async () => {
    proxyAddress = await deploy("RoyaltyFeeSetter", {
      from: deployer,
      proxy: {
        owner: deployer,
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

module.exports.tags = ["RoyaltyFeeSetter"];
module.exports.dependencies = ["RoyaltyFeeRegistry"];
