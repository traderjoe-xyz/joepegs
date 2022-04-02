const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const joepegExchange = await deployments.get("JoepegExchange");

  const args = [joepegExchange.address];
  const transferManagerERC1155 = await deploy("TransferManagerERC1155", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address: transferManagerERC1155.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["TransferManagerERC1155"];
module.exports.dependencies = ["JoepegExchange"];
