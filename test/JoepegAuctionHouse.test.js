const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

const { JOE, WAVAX, ZERO_ADDRESS } = require("./utils/constants");
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
  const minPercentageToAsk = 8500; // 8500 = 85%

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
    this.david = this.signers[4];

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

    this.protocolFeePct = 200; // 200 = 2%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy();
    await this.protocolFeeManager.initialize(this.protocolFeePct);

    this.royaltyFeePct = 100; // 100 = 1%
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

    await this.erc721Token.transferOwnership(this.david.address);
    this.royaltyFeeRecipient = this.david.address;

    // Mint
    await this.erc721Token.mint(this.alice.address);
  });

  const startEnglishAuction = async (
    account = alice,
    startPrice = englishAuctionStartPrice,
    tokenId = aliceTokenId
  ) => {
    await erc721Token.connect(account).approve(auctionHouse.address, tokenId);
    await auctionHouse
      .connect(account)
      .startEnglishAuction(
        erc721Token.address,
        tokenId,
        WAVAX,
        auctionDuration,
        startPrice,
        minPercentageToAsk
      );
  };

  const depositAndApproveWAVAX = async (account, value) => {
    await wavax.connect(account).deposit({ value });
    await wavax.connect(account).approve(auctionHouse.address, value);
  };

  const placeEnglishAuctionBid = async (
    account = bob,
    value = englishAuctionStartPrice,
    tokenId = aliceTokenId
  ) => {
    await depositAndApproveWAVAX(account, value);
    await auctionHouse
      .connect(account)
      .placeEnglishAuctionBid(erc721Token.address, tokenId, value);
  };

  const placeEnglishAuctionBidWithAVAX = async (
    account = bob,
    value = englishAuctionStartPrice,
    tokenId = aliceTokenId
  ) => {
    await auctionHouse
      .connect(account)
      .placeEnglishAuctionBidWithAVAXAndWAVAX(erc721Token.address, tokenId, 0, {
        value,
      });
  };

  const assertWAVAXBalanceIncrease = async (
    address,
    balanceBefore,
    increaseAmount
  ) => {
    const currWAVAXBalance = await wavax.balanceOf(address);
    expect(currWAVAXBalance.sub(balanceBefore)).to.be.equal(increaseAmount);
  };

  xdescribe("startEnglishAuction", function () {
    it("cannot start with unsupported currency", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            JOE,
            auctionDuration,
            englishAuctionStartPrice,
            minPercentageToAsk
          )
      ).to.be.revertedWith("JoepegAuctionHouse__UnsupportedCurrency");
    });

    it("cannot start with minPercentageAsk of zero", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            auctionDuration,
            englishAuctionStartPrice,
            0
          )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidMinPercentageToAsk");
    });

    it("cannot start with minPercentageAsk greater than 10_000", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            auctionDuration,
            englishAuctionStartPrice,
            10_001
          )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidMinPercentageToAsk");
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
            englishAuctionStartPrice,
            minPercentageToAsk
          )
      ).to.be.revertedWith("JoepegAuctionHouse__InvalidDuration");
    });

    it("cannot start with existing auction", async function () {
      await startEnglishAuction();
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .startEnglishAuction(
            this.erc721Token.address,
            aliceTokenId,
            WAVAX,
            auctionDuration,
            englishAuctionStartPrice,
            minPercentageToAsk
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
            englishAuctionStartPrice,
            minPercentageToAsk
          )
      ).to.be.revertedWith("ERC721: transfer caller is not owner nor approved");
    });

    it("successfully starts auction", async function () {
      await startEnglishAuction();

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
      expect(auction.minPercentageToAsk).to.be.equal(minPercentageToAsk);
    });
  });

  xdescribe("placeEnglishAuctionBid", function () {
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
      await startEnglishAuction();

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
      await startEnglishAuction();
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
      await startEnglishAuction();

      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBid(this.erc721Token.address, aliceTokenId, 0)
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("creator cannot bid", async function () {
      await startEnglishAuction();
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
      await startEnglishAuction();
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
      await startEnglishAuction();
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
      await startEnglishAuction();
      await placeEnglishAuctionBid();

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
      await startEnglishAuction();
      await placeEnglishAuctionBid();

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
      await startEnglishAuction();
      const beforeEndTime = (
        await this.auctionHouse.englishAuctions(
          this.erc721Token.address,
          aliceTokenId
        )
      ).endTime;

      await advanceTimeAndBlock(
        duration.seconds(auctionDuration - englishAuctionRefreshTime)
      );

      await placeEnglishAuctionBid();

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
      await startEnglishAuction();

      const beforeAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(beforeAuction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(beforeAuction.lastBidPrice).to.be.equal(0);

      await placeEnglishAuctionBid();

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(englishAuctionStartPrice);
    });

    it("follow up bid from same bidder correctly records lastBidder and lastBidPrice", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBid();

      const followUpMinBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct)
        .div(10_000);
      await placeEnglishAuctionBid(this.bob, followUpMinBidPrice);

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(
        englishAuctionStartPrice.add(followUpMinBidPrice)
      );
    });

    it("follow up bid correctly refunds last bid to last bidder and updates lastBidder + lastBidPrice", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBid();

      const bobWAVAXBalanceBeforeRefund = await this.wavax.balanceOf(
        this.bob.address
      );

      const followUpBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct + 10_000)
        .div(10_000);
      await placeEnglishAuctionBid(this.carol, followUpBidPrice);

      const bobWAVAXBalanceAfterRefund = await this.wavax.balanceOf(
        this.bob.address
      );
      expect(
        bobWAVAXBalanceAfterRefund.sub(bobWAVAXBalanceBeforeRefund)
      ).to.be.equal(englishAuctionStartPrice);

      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(auction.lastBidder).to.be.equal(this.carol.address);
      expect(auction.lastBidPrice).to.be.equal(followUpBidPrice);
    });
  });

  xdescribe("placeEnglishAuctionBidWithAVAXAndWAVAX", function () {
    it("cannot bid on nonexistent auction", async function () {
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__CurrencyMismatch");
    });

    it("cannot bid on non-WAVAX currency auction", async function () {
      await this.currencyManager.addCurrency(JOE);
      await this.erc721Token
        .connect(this.alice)
        .approve(this.auctionHouse.address, aliceTokenId);
      await this.auctionHouse
        .connect(this.alice)
        .startEnglishAuction(
          this.erc721Token.address,
          aliceTokenId,
          JOE,
          auctionDuration,
          englishAuctionStartPrice,
          minPercentageToAsk
        );
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("JoepegAuctionHouse__CurrencyMismatch");
    });

    it("cannot bid without WAVAX approval", async function () {
      await startEnglishAuction();
      await this.wavax
        .connect(this.bob)
        .deposit({ value: englishAuctionStartPrice });
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            englishAuctionStartPrice
          )
      ).to.be.revertedWith("SafeERC20: low-level call failed");
    });

    it("cannot bid zero amount", async function () {
      await startEnglishAuction();
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("creator cannot bid", async function () {
      await startEnglishAuction();
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0,
            { value: englishAuctionStartPrice }
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionCreatorCannotPlaceBid"
      );
    });

    it("cannot bid on ended auction", async function () {
      await startEnglishAuction();
      await advanceTimeAndBlock(duration.seconds(auctionDuration));
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0,
            {
              value: englishAuctionStartPrice,
            }
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionCannotBidOnEndedAuction"
      );
    });

    it("cannot bid less than start price", async function () {
      await startEnglishAuction();
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0,
            {
              value: englishAuctionStartPrice.sub(1),
            }
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("cannot bid less than englishAuctionMinBidIncrementPct of last bid if same bidder", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBidWithAVAX();

      const followUpInsufficientBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct)
        .div(10_000)
        .sub(1);
      await expect(
        this.auctionHouse
          .connect(this.bob)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0,
            {
              value: followUpInsufficientBidPrice,
            }
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("cannot bid less than englishAuctionMinBidIncrementPct greater than last bid", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBidWithAVAX();

      const followUpInsufficientBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct + 10_000)
        .div(10_000)
        .sub(1);
      await expect(
        this.auctionHouse
          .connect(this.carol)
          .placeEnglishAuctionBidWithAVAXAndWAVAX(
            this.erc721Token.address,
            aliceTokenId,
            0,
            { value: followUpInsufficientBidPrice }
          )
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount"
      );
    });

    it("bid in last englishAuctionRefreshTime extends auction end time", async function () {
      await startEnglishAuction();
      const beforeEndTime = (
        await this.auctionHouse.englishAuctions(
          this.erc721Token.address,
          aliceTokenId
        )
      ).endTime;

      await advanceTimeAndBlock(
        duration.seconds(auctionDuration - englishAuctionRefreshTime)
      );

      await placeEnglishAuctionBidWithAVAX();

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
      await startEnglishAuction();

      const beforeAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(beforeAuction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(beforeAuction.lastBidPrice).to.be.equal(0);

      await placeEnglishAuctionBidWithAVAX();

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(englishAuctionStartPrice);
    });

    it("follow up bid from same bidder correctly records lastBidder and lastBidPrice", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBidWithAVAX();

      const followUpMinBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct)
        .div(10_000);
      await placeEnglishAuctionBidWithAVAX(this.bob, followUpMinBidPrice);

      const afterAuction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(afterAuction.lastBidder).to.be.equal(this.bob.address);
      expect(afterAuction.lastBidPrice).to.be.equal(
        englishAuctionStartPrice.add(followUpMinBidPrice)
      );
    });

    it("follow up bid correctly refunds last bid to last bidder and updates lastBidder + lastBidPrice", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBidWithAVAX();

      const bobWAVAXBalanceBeforeRefund = await this.wavax.balanceOf(
        this.bob.address
      );

      const followUpBidPrice = englishAuctionStartPrice
        .mul(englishAuctionMinBidIncrementPct + 10_000)
        .div(10_000);
      await placeEnglishAuctionBidWithAVAX(this.carol, followUpBidPrice);

      const bobWAVAXBalanceAfterRefund = await this.wavax.balanceOf(
        this.bob.address
      );
      expect(
        bobWAVAXBalanceAfterRefund.sub(bobWAVAXBalanceBeforeRefund)
      ).to.be.equal(englishAuctionStartPrice);

      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(auction.lastBidder).to.be.equal(this.carol.address);
      expect(auction.lastBidPrice).to.be.equal(followUpBidPrice);
    });

    it("successfully bids with AVAX and WAVAX", async function () {
      await startEnglishAuction();

      const avaxAmount = englishAuctionStartPrice.div(2);
      const wavaxAmount = englishAuctionStartPrice.div(2);
      await depositAndApproveWAVAX(this.bob, wavaxAmount);
      await this.auctionHouse
        .connect(this.bob)
        .placeEnglishAuctionBidWithAVAXAndWAVAX(
          this.erc721Token.address,
          aliceTokenId,
          wavaxAmount,
          { value: avaxAmount }
        );

      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(auction.lastBidder).to.be.equal(this.bob.address);
      expect(auction.lastBidPrice).to.be.equal(avaxAmount.add(wavaxAmount));
    });
  });

  describe("settleEnglishAuction", function () {
    it("cannot settle nonexistent auction", async function () {
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .settleEnglishAuction(this.erc721Token.address, aliceTokenId)
      ).to.be.revertedWith("JoepegAuctionHouse__NoAuctionExists");
    });

    it("cannot settle auction with no bids", async function () {
      await startEnglishAuction();
      await advanceTimeAndBlock(duration.seconds(auctionDuration));
      await expect(
        this.auctionHouse
          .connect(this.alice)
          .settleEnglishAuction(this.erc721Token.address, aliceTokenId)
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionCannotSettleWithoutBid"
      );
    });

    it("cannot settle auction before endTime if not creator", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBid();
      await advanceTimeAndBlock(duration.seconds(auctionDuration / 2));

      await expect(
        this.auctionHouse
          .connect(this.bob)
          .settleEnglishAuction(this.erc721Token.address, aliceTokenId)
      ).to.be.revertedWith(
        "JoepegAuctionHouse__EnglishAuctionOnlyCreatorCanSettleBeforeEndTime"
      );
    });

    it("creator can settle auction before end time", async function () {
      await startEnglishAuction();
      await placeEnglishAuctionBid();
      await advanceTimeAndBlock(duration.seconds(auctionDuration / 2));

      const beforeRoyaltyFeeRecipientWAVAXBalance = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      const beforeProtocolRecipientWAVAXBalance = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const beforeAliceWAVAXBalance = await this.wavax.balanceOf(
        this.alice.address
      );

      await this.auctionHouse
        .connect(this.alice)
        .settleEnglishAuction(this.erc721Token.address, aliceTokenId);

      // Check englishAuction data is deleted
      const auction = await this.auctionHouse.englishAuctions(
        this.erc721Token.address,
        aliceTokenId
      );
      expect(auction.creator).to.be.equal(ZERO_ADDRESS);
      expect(auction.currency).to.be.equal(ZERO_ADDRESS);
      expect(auction.lastBidder).to.be.equal(ZERO_ADDRESS);
      expect(auction.endTime).to.be.equal(0);
      expect(auction.lastBidPrice).to.be.equal(0);
      expect(auction.startPrice).to.be.equal(0);
      expect(auction.minPercentageToAsk).to.be.equal(0);

      // Confirm royalty fee recipient received royalty fee
      await assertWAVAXBalanceIncrease(
        this.royaltyFeeRecipient,
        beforeRoyaltyFeeRecipientWAVAXBalance,
        englishAuctionStartPrice.mul(this.royaltyFeePct).div(10_000)
      );

      // Confirm protocol fee recipient received royalty fee
      await assertWAVAXBalanceIncrease(
        this.protocolFeeRecipient,
        beforeProtocolRecipientWAVAXBalance,
        englishAuctionStartPrice.mul(this.protocolFeePct).div(10_000)
      );

      // Confirm seller received remaining fees
      await assertWAVAXBalanceIncrease(
        this.alice.address,
        beforeAliceWAVAXBalance,
        englishAuctionStartPrice
          .mul(10_000 - this.royaltyFeePct - this.protocolFeePct)
          .div(10_000)
      );

      // Check NFT is transferred to bidder
      const erc721TokenOwner = await this.erc721Token.ownerOf(aliceTokenId);
      expect(erc721TokenOwner).to.be.equal(this.bob.address);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
