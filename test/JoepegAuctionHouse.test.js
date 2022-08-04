const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

const { WAVAX } = require("./utils/constants");

describe("JoepegAuctionHouse", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.CurrencyManagerCF = await ethers.getContractFactory("CurrencyManager");
    this.ProtocolFeeManagerCF = await ethers.getContractFactory(
      "ProtocolFeeManager"
    );
    this.RoyaltyFeeRegistryCF = await ethers.getContractFactory(
      "RoyaltyFeeRegistry"
    );
    this.RoyaltyFeeManagerCF = await ethers.getContractFactory(
      "RoyaltyFeeManager"
    );
    this.AuctionHouseCF = await ethers.getContractFactory("JoepegAuctionHouse");

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
    this.wavax = await ethers.getContractAt("IWAVAX", WAVAX);
    this.erc721Token = await this.ERC721TokenCF.deploy();

    this.currencyManager = await this.CurrencyManagerCF.deploy();
    await this.currencyManager.initialize();

    this.protocolFeePct = 100; // 100 = 1%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy();
    await this.protocolFeeManager.initialize(this.protocolFeePct);

    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy();
    await this.royaltyFeeRegistry.initialize(this.royaltyFeeLimit);

    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy();
    await this.royaltyFeeManager.initialize(this.royaltyFeeRegistry.address);

    this.protocolFeeRecipient = this.dev.address;

    this.auctionHouse = await this.AuctionHouseCF.deploy(WAVAX);

    // Initialization
    this.englishAuctionMinBidIncrementPct = 500; // 500 = 5%
    this.englishAuctionRefreshTime = 300; // 300 = 5 minutes
    await this.auctionHouse.initialize(
      this.englishAuctionMinBidIncrementPct,
      this.englishAuctionRefreshTime,
      this.currencyManager.address,
      this.protocolFeeManager.address,
      this.royaltyFeeManager.address,
      this.protocolFeeRecipient
    );

    await this.currencyManager.addCurrency(WAVAX);
  });

  describe("test", function () {
    it("should not test", async function () {});
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
