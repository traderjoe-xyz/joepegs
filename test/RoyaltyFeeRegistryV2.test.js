const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe("RoyaltyFeeRegistryV2", function () {
  before(async function () {
    this.RoyaltyFeeRegistryV2CF = await ethers.getContractFactory(
      "RoyaltyFeeRegistryV2"
    );

    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: config.networks.avalanche.url,
          },
          live: false,
          saveDeployments: true,
          tags: ["test", "local"],
        },
      ],
    });
  });

  beforeEach(async function () {
    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.maxNumRecipients = 2;
    this.royaltyFeeRegistryV2 = await this.RoyaltyFeeRegistryV2CF.deploy();
    await this.royaltyFeeRegistryV2.initialize(
      this.royaltyFeeLimit,
      this.maxNumRecipients
    );
  });

  describe("updateRoyaltyFeeLimit", function () {
    it("cannot update to value greater than 9500", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyFeeLimit(9501)
      ).to.be.revertedWith("RoyaltyFeeRegistryV2__RoyaltyFeeLimitTooHigh");
    });

    it("can successfully update value", async function () {
      const newRoyaltyFeeLimit = this.royaltyFeeLimit / 2;
      await this.royaltyFeeRegistryV2.updateRoyaltyFeeLimit(newRoyaltyFeeLimit);
      expect(await this.royaltyFeeRegistryV2.royaltyFeeLimit()).to.be.equal(
        newRoyaltyFeeLimit
      );
    });
  });

  describe("updateMaxNumRecipients", function () {
    it("cannot update to 0", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateMaxNumRecipients(0)
      ).to.be.revertedWith("RoyaltyFeeRegistryV2__InvalidMaxNumRecipients");
    });

    it("can successfully update value", async function () {
      const newMaxNumRecipients = this.maxNumRecipients * 2;
      await this.royaltyFeeRegistryV2.updateMaxNumRecipients(
        newMaxNumRecipients
      );
      expect(await this.royaltyFeeRegistryV2.maxNumRecipients()).to.be.equal(
        newMaxNumRecipients
      );
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
