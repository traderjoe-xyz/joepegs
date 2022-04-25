const { verify } = require("./utils");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const args = [];
  const { address } = await deploy(
    "StrategyAnyItemFromCollectionForFixedPrice",
    {
      from: deployer,
      args,
      log: true,
      deterministicDeployment: false,
    }
  );

  // await verify(address, args);
};

module.exports.tags = ["StrategyAnyItemFromCollectionForFixedPrice"];
