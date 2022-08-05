const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

const { WAVAX, ZERO_ADDRESS } = require("./utils/constants");
const { advanceTimeAndBlock, duration, latest } = require("./utils/time");

describe("JoepegAuctionHouse", function () {
  let alice;
  let bob;
  let auctionHouse;
  let erc721Token;
  let wavax;

  const aliceTokenId = 1;
  const auctionDuration = 6000;
  const englishAuctionStartPrice = ethers.utils.parseEther("1");
  const englishAuctionMinBidIncrementPct = 500; // 500 = 5%
  const englishAuctionRefreshTime = 300; // 300 = 5 minutes

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
    alice = this.alice;
    this.bob = this.signers[2];
    bob = this.bob;
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
    wavax = this.wavax;
    this.erc721Token = await this.ERC721TokenCF.deploy();
    erc721Token = this.erc721Token;

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
    auctionHouse = this.auctionHouse;

    // Initialization
    await this.auctionHouse.initialize(
      englishAuctionMinBidIncrementPct,
      englishAuctionRefreshTime,
      this.currencyManager.address,
      this.protocolFeeManager.address,
      this.royaltyFeeManager.address,
      this.protocolFeeRecipient
    );

    await this.currencyManager.addCurrency(WAVAX);

    // Mint
    await this.erc721Token.mint(this.alice.address);
  });

  const startEnglishAuctionAlice = async () => {
    await erc721Token
      .connect(alice)
      .approve(auctionHouse.address, aliceTokenId);
    await auctionHouse
      .connect(alice)
      .startEnglishAuction(
        erc721Token.address,
        aliceTokenId,
        WAVAX,
        auctionDuration,
        englishAuctionStartPrice
      );
  };

  const depositAndApproveWAVAX = async (account, value) => {
    await wavax.connect(account).deposit({ value });
    await wavax.connect(account).approve(auctionHouse.address, value);
  };

  xdescribe("startEnglishAuction", function () {
    it("cannot start with unsupported currency", async function () {
      const joe = "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd";
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            joe,
            auctionDuration,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__UnsupportedCurrency");
    });

    it("cannot start with zero duration", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            0,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidDuration");
    });

    it("cannot start with existing auction", async function () {
      await startEnglishAuctionAlice();
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            auctionDuration,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__AuctionAlreadyExists");
    });

    it("cannot start with missing ERC721 approval", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            auctionDuration,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("successfully starts auction", async function () {
      await startEnglishAuctionAlice();

      const startTime = await latest();
      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(auction.creator).to.be.equal(this.alice.address);
      expect(auction.currency).to.be.equal(WAVAX);
      expect(auction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(auction.endTime).to.be.equal(startTime.add(auctionDuration));
      expect(auction.lastBidPrice).to.be.equal(0);
      expect(auction.startPrice).to.be.equal(englishAuctionStartPrice);
    });
  });

  describe("placeEnglishAuctionBid", function () {
    it("cannot bid on nonexistent auction", async function () {
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__NoAuctionExists");
    });

    it("cannot bid without WAVAX approval", async function () {
      await startEnglishAuctionAlice();

      await this.wavax
        .connect(this.bob)
        .deposit({ value: englishAuctionStartPrice });

      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("cannot bid with insufficient WAVAX approval amount", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice.sub(1));
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("cannot bid zero amount", async function () {
      await startEnglishAuctionAlice();

      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(this.erc721Token.address, aliceTokenId, 0)
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("creator cannot bid", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.alice, englishAuctionStartPrice);
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionCreatorCannotPlaceBid"
      );
    });

    it("cannot bid on ended auction", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await advanceTimeAndBlock(duration.seconds(auctionDuration));
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionCannotBidOnEndedAuction"
      );
    });

    it("cannot bid less than start price", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice.sub(1));
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice.sub(1)
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("cannot bid less than englishAuctionMinBidIncrementPct of last bid if same bidder", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          englishAuctionStartPrice
        );

      const followUpInsufficientBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct)
        .div(10_000)
        .sub(1);
      await depositAndApproveWAVAX(this.bob, followUpInsufficientBidPrice);
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            followUpInsufficientBidPrice
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("cannot bid less than englishAuctionMinBidIncrementPct greater than last bid", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          englishAuctionStartPrice
        );

      const followUpInsufficientBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct + 10_000)
        .div(10_000)
        .sub(1);
      await depositAndApproveWAVAX(this.carol, followUpInsufficientBidPrice);
      await expect(
        this.auctionHouse
          .connect(this.carol)
          .placeEnglishAuctionBid(
            this.erc721Token.address,
            aliceTokenId,
            followUpInsufficientBidPrice
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("bid in last englishAuctionRefreshTime extends auction end time", async function () {
      await startEnglishAuctionAlice();
      const beforeEndTime = (
        await this.auctionHouse.englishAuctions(
          this.erc721Token.address,
          aliceTokenId
        )
      ).endTime;

      await advanceTimeAndBlock(
        duration.seconds(auctionDuration - englishAuctionRefreshTime)
      );

      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          englishAuctionStartPrice
        );

      const afterEndTime = (
        await this.auctionHouse.englishAuctions(
          this.erc721Token.address,
          aliceTokenId
        )
      ).endTime;
      expect(afterEndTime).to.be.equal(
        beforeEndTime.add(englishAuctionRefreshTime)
      );
    });

    it("first bid correctly records lastBidder and lastBidPrice", async function () {
      await startEnglishAuctionAlice();

      const beforeAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(beforeAuction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(beforeAuction.lastBidPrice).to.be.equal(0);

      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          englishAuctionStartPrice
        );

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(englishAuctionStartPrice);
    });

    it("follow up bid from same bidder correctly records lastBidder and lastBidPrice", async function () {
      await startEnglishAuctionAlice();
      await depositAndApproveWAVAX(this.bob, englishAuctionStartPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          englishAuctionStartPrice
        );

      const followUpMinBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct)
        .div(10_000);
      await depositAndApproveWAVAX(this.bob, followUpMinBidPrice);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBid(
          this.erc721Token.address,
          aliceTokenId,
          followUpMinBidPrice
        );

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(
        englishAuctionStartPrice.add(followUpMinBidPrice)
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
