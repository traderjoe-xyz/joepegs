const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

const { ZERO_ADDRESS } = require("./utils/constants");

describe("RoyaltyFeeRegistryV2", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.RoyaltyFeeRegistryV2CF = await ethers.getContractFactory(
      "RoyaltyFeeRegistryV2"
    );
    this.RoyaltyFeeSetterV2CF = await ethers.getContractFactory(
      "RoyaltyFeeSetterV2"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];

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
    this.erc721Token = await this.ERC721TokenCF.deploy();

    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.maxNumRecipients = 2;
    this.royaltyFeeRegistryV2 = await this.RoyaltyFeeRegistryV2CF.deploy();
    await this.royaltyFeeRegistryV2.initialize(
      this.royaltyFeeLimit,
      this.maxNumRecipients
    );

    this.royaltyFeeSetterV2 = await this.RoyaltyFeeSetterV2CF.deploy();
    await this.royaltyFeeSetterV2.initialize(this.royaltyFeeRegistryV2.address);

    // Royalty fee information for RoyaltyFeeSetterV2
    this.royaltyFeeRecipient1 = this.alice.address;
    this.royaltyFeePct1 = 500;
    this.royaltyFeeRecipient2 = this.bob.address;
    this.royaltyFeePct2 = 100;
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

  describe("updateRoyaltyInfoPartsForCollection", function () {
    it("cannot add more than maxNumRecipients", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
          this.erc721Token.address,
          this.dev.address,
          [
            { receiver: this.alice.address, fee: 100 },
            { receiver: this.bob.address, fee: 200 },
            { receiver: this.carol.address, fee: 300 },
          ]
        )
      ).to.be.revertedWith("RoyaltyFeeRegistryV2__TooManyFeeRecipients");
    });

    it("cannot have setter be null address", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
          this.erc721Token.address,
          ZERO_ADDRESS,
          [
            { receiver: this.alice.address, fee: 100 },
            { receiver: this.bob.address, fee: 100 },
          ]
        )
      ).to.be.revertedWith(
        "RoyaltyFeeRegistryV2__RoyaltyFeeSetterCannotBeNullAddr"
      );
    });

    it("cannot have receiver be null address", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
          this.erc721Token.address,
          this.dev.address,
          [{ receiver: ZERO_ADDRESS, fee: 100 }]
        )
      ).to.be.revertedWith(
        "RoyaltyFeeRegistryV2__RoyaltyFeeRecipientCannotBeNullAddr"
      );
    });

    it("cannot have fee be 0", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
          this.erc721Token.address,
          this.dev.address,
          [{ receiver: this.alice.address, fee: 0 }]
        )
      ).to.be.revertedWith("RoyaltyFeeRegistryV2__RoyaltyFeeCannotBeZero");
    });

    it("cannot have fees higher than royaltyFeeLimit", async function () {
      await expect(
        this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
          this.erc721Token.address,
          this.dev.address,
          [
            { receiver: this.alice.address, fee: 900 },
            { receiver: this.bob.address, fee: 200 },
          ]
        )
      ).to.be.revertedWith("RoyaltyFeeRegistryV2__RoyaltyFeeTooHigh");
    });

    it("can successfully update", async function () {
      const setter = this.alice.address;
      await this.royaltyFeeRegistryV2.updateRoyaltyInfoPartsForCollection(
        this.erc721Token.address,
        setter,
        [
          { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
          { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
        ]
      );
      const feeInfoPart1 =
        await this.royaltyFeeRegistryV2.royaltyFeeInfoPartsCollection(
          this.erc721Token.address,
          0
        );
      const feeInfoPart2 =
        await this.royaltyFeeRegistryV2.royaltyFeeInfoPartsCollection(
          this.erc721Token.address,
          1
        );
      // Check that there are only 2 entries
      await expect(
        this.royaltyFeeRegistryV2.royaltyFeeInfoPartsCollection(
          this.erc721Token.address,
          2
        )
      ).to.be.reverted;

      expect(feeInfoPart1.receiver).to.be.equal(this.royaltyFeeRecipient1);
      expect(feeInfoPart1.fee).to.be.equal(this.royaltyFeePct1);

      expect(feeInfoPart2.receiver).to.be.equal(this.royaltyFeeRecipient2);
      expect(feeInfoPart2.fee).to.be.equal(this.royaltyFeePct2);

      expect(
        await this.royaltyFeeRegistryV2.royaltyFeeInfoPartsCollectionSetter(
          this.erc721Token.address
        )
      ).to.be.equal(setter);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
