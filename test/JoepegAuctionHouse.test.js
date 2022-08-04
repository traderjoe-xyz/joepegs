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

    // Mint
    await this.erc721Token.mint(this.alice.address);

    await this.currencyManager.addCurrency(WAVAX);
  });

  describe("startEnglishAuction", function () {
    it("unsupported currency", async function () {
      const joe = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
      await expect(
        this.auctionHouse.startEnglishAuction(
          this.erc721Token.address,
          1,
          joe,
          600,
          ethers.utils.parseEther("1")
        )
      ).to.be.revertedWith("JoepegAuctionHouse__UnsupportedCurrency");
    });

    it("zero duration", async function () {
      await expect(
        this.auctionHouse.startEnglishAuction(
          this.erc721Token.address,
          1,
          WAVAX,
          0,
          ethers.utils.parseEther("1")
        )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidDuration");
    });

    it("existing auction", async function () {
      // Approve auction house to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.auctionHouse.address, 1);

      await this.auctionHouse
        .connect(this.alice)
        .startEnglishAuction(
          this.erc721Token.address,
          1,
          WAVAX,
          600,
          ethers.utils.parseEther("1")
        );
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            1,
            WAVAX,
            600,
            ethers.utils.parseEther("1")
          )
      ).to.be.revertedWith("JoepegAuctionHouse__AuctionAlreadyExists");
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
