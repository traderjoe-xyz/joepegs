const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe("RoyaltyFeeManager", function () {
  const tokenId = 1;
  const amount = ethers.utils.parseEther("1");

  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.RoyaltyFeeRegistryCF = await ethers.getContractFactory(
      "RoyaltyFeeRegistry"
    );
    this.RoyaltyFeeRegistryV2CF = await ethers.getContractFactory(
      "RoyaltyFeeRegistryV2"
    );
    this.RoyaltyFeeSetterCF = await ethers.getContractFactory(
      "RoyaltyFeeSetter"
    );
    this.RoyaltyFeeSetterV2CF = await ethers.getContractFactory(
      "RoyaltyFeeSetterV2"
    );
    this.RoyaltyFeeManagerCF = await ethers.getContractFactory(
      "RoyaltyFeeManager"
    );

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];
    this.carol = this.signers[3];
    this.david = this.signers[4];
    this.eric = this.signers[5];

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
    erc721Token = this.erc721Token;

    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy();
    await this.royaltyFeeRegistry.initialize(this.royaltyFeeLimit);

    this.maxNumRecipients = 2;
    this.royaltyFeeRegistryV2 = await this.RoyaltyFeeRegistryV2CF.deploy();
    await this.royaltyFeeRegistryV2.initialize(
      this.royaltyFeeLimit,
      this.maxNumRecipients
    );

    this.royaltyFeeSetter = await this.RoyaltyFeeSetterCF.deploy();
    await this.royaltyFeeSetter.initialize(this.royaltyFeeRegistry.address);
    await this.royaltyFeeRegistry.transferOwnership(
      this.royaltyFeeSetter.address
    );

    this.royaltyFeeSetterV2 = await this.RoyaltyFeeSetterV2CF.deploy();
    await this.royaltyFeeSetterV2.initialize(this.royaltyFeeRegistryV2.address);
    await this.royaltyFeeRegistryV2.transferOwnership(
      this.royaltyFeeSetterV2.address
    );

    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy();
    await this.royaltyFeeManager.initialize(this.royaltyFeeRegistry.address);
    await this.royaltyFeeManager.initializeRoyaltyFeeRegistryV2(
      this.royaltyFeeRegistryV2.address
    );

    // Royalty fee information for RoyaltyFeeSetter
    this.royaltyFeeRecipientV1 = this.alice.address;
    this.royaltyFeePctV1 = 1000;
    await this.erc721Token.transferOwnership(this.royaltyFeeRecipientV1);

    // Royalty fee information for RoyaltyFeeSetterV2
    this.royaltyFeeRecipient1 = this.david.address;
    royaltyFeeRecipient1 = this.royaltyFeeRecipient1;
    this.royaltyFeePct1 = 500;
    royaltyFeePct1 = this.royaltyFeePct1;
    this.royaltyFeeRecipient2 = this.eric.address;
    royaltyFeeRecipient2 = this.royaltyFeeRecipient2;
    this.royaltyFeePct2 = 100;
    royaltyFeePct2 = this.royaltyFeePct2;
  });

  describe("initializeRoyaltyFeeRegistryV2", function () {
    it("cannot update royaltyFeeRegistryV2 when already set", async function () {
      await expect(
        this.royaltyFeeManager.initializeRoyaltyFeeRegistryV2(
          this.royaltyFeeRegistryV2.address
        )
      ).to.be.revertedWith("RoyaltyFeeManager__RoyaltyFeeRegistryV2AlreadySet");
    });
  });

  describe("calculateRoyaltyFeeAmountParts with no overrides", function () {
    it("calculateRoyaltyFeeAmountParts returns ERC2981 royalty info", async function () {
      const [receiver, royaltyAmount] = await this.erc721Token.royaltyInfo(
        tokenId,
        amount
      );
      const feeAmountParts =
        await this.royaltyFeeManager.calculateRoyaltyFeeAmountParts(
          this.erc721Token.address,
          tokenId,
          amount
        );
      expect(feeAmountParts.length).to.be.equal(1);
      expect(receiver).to.be.equal(feeAmountParts[0].receiver);
      expect(royaltyAmount).to.be.equal(feeAmountParts[0].amount);
    });
  });

  describe("calculateRoyaltyFeeAmountParts with v1 setter", function () {
    beforeEach(async function () {
      await this.royaltyFeeSetter.updateRoyaltyInfoForCollection(
        this.erc721Token.address,
        this.dev.address,
        this.royaltyFeeRecipientV1,
        this.royaltyFeePctV1
      );
    });

    it("calculateRoyaltyFeeAmountParts returns information from v1 setter", async function () {
      const feeAmountParts =
        await this.royaltyFeeManager.calculateRoyaltyFeeAmountParts(
          this.erc721Token.address,
          tokenId,
          amount
        );
      expect(feeAmountParts.length).to.be.equal(1);
      expect(this.royaltyFeeRecipientV1).to.be.equal(
        feeAmountParts[0].receiver
      );
      expect(amount.mul(this.royaltyFeePctV1).div(10_000)).to.be.equal(
        feeAmountParts[0].amount
      );
    });
  });

  describe("calculateRoyaltyFeeAmountParts with v2 setter", function () {
    beforeEach(async function () {
      await this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollection(
        this.erc721Token.address,
        this.dev.address,
        [
          { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
          { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
        ]
      );
    });

    it("calculateRoyaltyFeeAmountParts returns information from v2 setter", async function () {
      const feeAmountParts =
        await this.royaltyFeeManager.calculateRoyaltyFeeAmountParts(
          this.erc721Token.address,
          tokenId,
          amount
        );
      expect(feeAmountParts.length).to.be.equal(2);

      expect(this.royaltyFeeRecipient1).to.be.equal(feeAmountParts[0].receiver);
      expect(amount.mul(this.royaltyFeePct1).div(10_000)).to.be.equal(
        feeAmountParts[0].amount
      );

      expect(this.royaltyFeeRecipient2).to.be.equal(feeAmountParts[1].receiver);
      expect(amount.mul(this.royaltyFeePct2).div(10_000)).to.be.equal(
        feeAmountParts[1].amount
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
