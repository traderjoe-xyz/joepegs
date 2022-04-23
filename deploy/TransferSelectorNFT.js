const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments, getChainId }) {
  const { deploy, catchUnknownSigner } = deployments;
  const { deployer } = await getNamedAccounts();

  let proxyContract, proxyOwner;

  const chainId = await getChainId();

  if (chainId == 4 || chainId == 43113) {
    proxyOwner = deployer;
  } else if (chainId == 43114 || chainId == 31337) {
    // multisig
    proxyOwner = "0x2fbB61a10B96254900C03F1644E9e1d2f5E76DD2";
  }

  const transferManagerERC721 = await deployments.get("TransferManagerERC721");
  const transferManagerERC1155 = await deployments.get(
    "TransferManagerERC1155"
  );

  const args = [transferManagerERC721.address, transferManagerERC1155.address];
  await catchUnknownSigner(async () => {
    proxyContract = await deploy("TransferSelectorNFT", {
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

module.exports.tags = ["TransferSelectorNFT"];
module.exports.dependencies = [
  "TransferManagerERC721",
  "TransferManagerERC1155",
];
