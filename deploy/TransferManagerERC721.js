const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const joepegExchange = await deployments.get("JoepegExchange");

  const args = [joepegExchange.address];
  const { address } = await deploy("TransferManagerERC721", {
    from: deployer,
    args,
    log: true,
    deterministicDeployment: false,
  });

  await verify(address, args);
};

module.exports.tags = ["TransferManagerERC721"];
module.exports.dependencies = ["JoepegExchange"];
