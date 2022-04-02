const { run } = require("hardhat");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const joepegExchange = await deployments.get("JoepegExchange");

  const args = [joepegExchange.address];
  const transferManagerERC721 = await deploy("TransferManagerERC721", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await run("verify:verify", {
    address: transferManagerERC721.address,
    constructorArguments: args,
  });
};

module.exports.tags = ["TransferManagerERC721"];
module.exports.dependencies = ["JoepegExchange"];
