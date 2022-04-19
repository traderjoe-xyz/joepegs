const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract;

  // TODO: Update to finalized value
  const defaultProtocolFeeAmount = 1000; // 1000 -> 10%

  const args = [defaultProtocolFeeAmount];
  await catchUnknownSigner(async () => {
    proxyAddress = await deploy("ProtocolFeeManager", {
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

module.exports.tags = ["ProtocolFeeManager"];
