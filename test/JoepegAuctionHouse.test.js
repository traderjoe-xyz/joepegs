const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

const { WAVAX, ZERO_ADDRESS } = require("./utils/constants");
const { latest } = require("./utils/time");

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

    // Mint
    this.aliceTokenId = 1;
    await this.erc721Token.mint(this.alice.address);

    this.auctionDuration = 6000;
    this.englishAuctionStartPrice = ethers.utils.parseEther("1");
  });

  describe("startEnglishAuction", function () {
    it("cannot start with unsupported currency", async function () {
      const joe = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
      await expect(
        this.auctionHouse.startEnglishAuction(
          this.erc721Token.address,
          this.aliceTokenId,
          joe,
          this.auctionDuration,
          this.englishAuctionStartPrice
        )
      ).to.be.revertedWith("JoepegAuctionHouse__UnsupportedCurrency");
    });

    it("cannot start with zero duration", async function () {
      await expect(
        this.auctionHouse.startEnglishAuction(
          this.erc721Token.address,
          this.aliceTokenId,
          WAVAX,
          0,
          ethers.utils.parseEther("1")
        )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidDuration");
    });

    it("cannot start with existing auction", async function () {
      await this.erc721Token
        .connect(this.alice)
        .approve(this.auctionHouse.address, this.aliceTokenId);
      await this.auctionHouse
        .connect(this.alice)
        .startEnglishAuction(
          this.erc721Token.address,
          this.aliceTokenId,
          WAVAX,
          this.auctionDuration,
          this.englishAuctionStartPrice
        );
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            this.aliceTokenId,
            WAVAX,
            this.auctionDuration,
            this.englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__AuctionAlreadyExists");
    });

    it("missing ERC721 approval for auction house", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            this.aliceTokenId,
            WAVAX,
            this.auctionDuration,
            this.englishAuctionStartPrice
          )
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("successfully starts auction", async function () {
      await this.erc721Token
        .connect(this.alice)
        .approve(this.auctionHouse.address, this.aliceTokenId);
      await this.auctionHouse
        .connect(this.alice)
        .startEnglishAuction(
          this.erc721Token.address,
          this.aliceTokenId,
          WAVAX,
          this.auctionDuration,
          this.englishAuctionStartPrice
        );

      const startTime = await latest();
      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        this.aliceTokenId
      );
      expect(auction.creator).to.be.equal(this.alice.address);
      expect(auction.currency).to.be.equal(WAVAX);
      expect(auction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(auction.endTime).to.be.equal(startTime.add(this.auctionDuration));
      expect(auction.lastBidPrice).to.be.equal(0);
      expect(auction.startPrice).to.be.equal(this.englishAuctionStartPrice);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
