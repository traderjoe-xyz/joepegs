const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

const { WAVAX } = require("./utils/constants");
const {
  buildMakerAskOrderAndTakerBidOrder,
} = require("./utils/maker-order.js");

describe("JoepegExchange", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.CurrencyManagerCF = await ethers.getContractFactory("CurrencyManager");
    this.ExecutionManagerCF = await ethers.getContractFactory(
      "ExecutionManager"
    );
    this.ProtocolFeeManagerCF = await ethers.getContractFactory(
      "ProtocolFeeManager"
    );
    this.RoyaltyFeeRegistryCF = await ethers.getContractFactory(
      "RoyaltyFeeRegistry"
    );
    this.RoyaltyFeeRegistryV2CF = await ethers.getContractFactory(
      "RoyaltyFeeRegistryV2"
    );
    this.RoyaltyFeeSetterV2CF = await ethers.getContractFactory(
      "RoyaltyFeeSetterV2"
    );
    this.RoyaltyFeeManagerCF = await ethers.getContractFactory(
      "RoyaltyFeeManager"
    );
    this.StrategyStandardSaleForFixedPriceCF = await ethers.getContractFactory(
      "StrategyStandardSaleForFixedPrice"
    );
    this.StrategyAnyItemFromCollectionForFixedPriceCF =
      await ethers.getContractFactory(
        "StrategyAnyItemFromCollectionForFixedPrice"
      );
    this.ExchangeCF = await ethers.getContractFactory("JoepegExchange");
    this.TransferManagerERC721CF = await ethers.getContractFactory(
      "TransferManagerERC721"
    );
    this.TransferManagerERC1155CF = await ethers.getContractFactory(
      "TransferManagerERC1155"
    );
    this.TransferSelectorNFTCF = await ethers.getContractFactory(
      "TransferSelectorNFT"
    );
    this.MockCallbackReceiverCF = await ethers.getContractFactory(
      "MockCallbackReceiver"
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
    this.wavax = await ethers.getContractAt("IWAVAX", WAVAX);
    this.erc721Token = await this.ERC721TokenCF.deploy();
    this.erc721TokenB = await this.ERC721TokenCF.deploy();

    this.currencyManager = await this.CurrencyManagerCF.deploy();
    await this.currencyManager.initialize();

    this.executionManager = await this.ExecutionManagerCF.deploy();
    await this.executionManager.initialize();

    this.protocolFeePct = 100; // 100 = 1%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy();
    await this.protocolFeeManager.initialize(this.protocolFeePct);

    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy();
    await this.royaltyFeeRegistry.initialize(this.royaltyFeeLimit);

    this.maxNumRecipients = 2;
    this.royaltyFeeRegistryV2 = await this.RoyaltyFeeRegistryV2CF.deploy();
    await this.royaltyFeeRegistryV2.initialize(
      this.royaltyFeeLimit,
      this.maxNumRecipients
    );

    this.royaltyFeeSetterV2 = await this.RoyaltyFeeSetterV2CF.deploy();
    await this.royaltyFeeSetterV2.initialize(this.royaltyFeeRegistryV2.address);
    await this.royaltyFeeRegistryV2.transferOwnership(
      this.royaltyFeeSetterV2.address
    );

    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy();
    await this.royaltyFeeManager.initialize(
      this.royaltyFeeRegistry.address,
      this.royaltyFeeRegistryV2.address
    );

    this.protocolFeeRecipient = this.dev.address;
    this.strategyStandardSaleForFixedPrice =
      await this.StrategyStandardSaleForFixedPriceCF.deploy();
    this.strategyAnyItemFromCollectionForFixedPrice =
      await this.StrategyAnyItemFromCollectionForFixedPriceCF.deploy();

    this.exchange = await this.ExchangeCF.deploy();
    await this.exchange.initialize(
      this.currencyManager.address,
      this.executionManager.address,
      this.protocolFeeManager.address,
      this.royaltyFeeManager.address,
      WAVAX,
      this.protocolFeeRecipient
    );

    this.transferManagerERC721 = await this.TransferManagerERC721CF.deploy();
    await this.transferManagerERC721.initialize(this.exchange.address);

    this.transferManagerERC1155 = await this.TransferManagerERC1155CF.deploy();
    await this.transferManagerERC1155.initialize(this.exchange.address);

    this.transferSelectorNFT = await this.TransferSelectorNFTCF.deploy();
    await this.transferSelectorNFT.initialize(
      this.transferManagerERC721.address,
      this.transferManagerERC1155.address
    );

    this.mockCallbackReceiver = await this.MockCallbackReceiverCF.deploy();

    // Mint
    await this.erc721Token.mint(this.alice.address);
    await this.erc721Token.mint(this.alice.address);
    await this.erc721TokenB.mint(this.alice.address);
    await this.erc721TokenB.mint(this.alice.address);

    // Initialization
    await this.currencyManager.addCurrency(WAVAX);
    await this.executionManager.addStrategy(
      this.strategyStandardSaleForFixedPrice.address
    );
    await this.executionManager.addStrategy(
      this.strategyAnyItemFromCollectionForFixedPrice.address
    );
    await this.exchange.updateTransferSelectorNFT(
      this.transferSelectorNFT.address
    );

    // Set royalty fee information via RoyaltyFeeSetterV2
    this.royaltyFeeRecipient1 = this.david.address;
    this.royaltyFeePct1 = 500;
    this.royaltyFeeRecipient2 = this.eric.address;
    this.royaltyFeePct2 = 100;
    await this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollection(
      this.erc721Token.address,
      this.dev.address,
      [
        { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
        { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
      ]
    );

    const { chainId } = await ethers.provider.getNetwork();
    this.DOMAIN = {
      name: "JoepegExchange",
      version: "1",
      chainId,
      verifyingContract: this.exchange.address,
    };
    this.MAKER_ORDER_TYPE = [
      { name: "isOrderAsk", type: "bool" },
      { name: "signer", type: "address" },
      { name: "collection", type: "address" },
      { name: "price", type: "uint256" },
      { name: "tokenId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "strategy", type: "address" },
      { name: "currency", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "startTime", type: "uint256" },
      { name: "endTime", type: "uint256" },
      { name: "minPercentageToAsk", type: "uint256" },
      { name: "params", type: "bytes" },
    ];
    this.TYPES = {
      MakerOrder: this.MAKER_ORDER_TYPE,
    };
  });

  describe("can execute sales", function () {
    const startTime = parseInt(Date.now() / 1000) - 1000;
    const endTime = startTime + 100000;
    const minPercentageToAsk = 9000;

    it("can sign EIP-712 message", async function () {
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = 100;
      const tokenId = 1;
      const makerAskOrder = {
        isOrderAsk: true,
        signer: this.alice.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };
      const signedMessage = await this.alice._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder
      );

      const expectedSignerAddress = this.alice.address;
      const recoveredAddress = ethers.utils.verifyTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder,
        signedMessage
      );
      expect(expectedSignerAddress).to.be.equal(recoveredAddress);
    });

    it("can perform fixed price sale with maker ask and taker bid", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const { makerAsk: makerAskOrder, takerBid: takerBidOrder } =
        await buildMakerAskOrderAndTakerBidOrder(
          this.DOMAIN,
          this.alice,
          this.bob,
          this.erc721Token.address,
          price,
          tokenId,
          this.strategyStandardSaleForFixedPrice.address,
          WAVAX,
          1
        );

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipient1WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );

      // Match taker bid order with maker ask order
      await this.exchange
        .connect(this.bob)
        .matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipients received royalty fees
      const royaltyFeeRecipient1WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );
      const royaltyFee1 = price.mul(this.royaltyFeePct1).div(10_000);
      const royaltyFee2 = price.mul(this.royaltyFeePct2).div(10_000);
      expect(royaltyFeeRecipient1WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient1WavaxBalanceBefore.add(royaltyFee1)
      );
      expect(royaltyFeeRecipient2WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient2WavaxBalanceBefore.add(royaltyFee2)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(
          price.sub(protocolFee).sub(royaltyFee1).sub(royaltyFee2)
        )
      );
    });

    it("can perform fixed price sale with maker bid and taker ask", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker bid order
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const makerBidOrder = {
        isOrderAsk: false,
        signer: this.bob.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign maker bid order
      const signedMessage = await this.bob._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerBidOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      makerBidOrder.r = r;
      makerBidOrder.s = s;
      makerBidOrder.v = v;

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipient1WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );

      // Match taker ask order with maker bid order
      await this.exchange
        .connect(this.alice)
        .matchBidWithTakerAsk(takerAskOrder, makerBidOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipient received royalty fees
      const royaltyFeeRecipient1WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );
      const royaltyFee1 = price.mul(this.royaltyFeePct1).div(10_000);
      const royaltyFee2 = price.mul(this.royaltyFeePct2).div(10_000);
      expect(royaltyFeeRecipient1WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient1WavaxBalanceBefore.add(royaltyFee1)
      );
      expect(royaltyFeeRecipient2WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient2WavaxBalanceBefore.add(royaltyFee2)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(
          price.sub(protocolFee).sub(royaltyFee1).sub(royaltyFee2)
        )
      );
    });

    it("can perform collection offer sale with collection maker bid and taker ask", async function () {
      // Check that alice indeed owns the NFT
      const tokenId = 1;
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.alice.address
      );

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create collection maker bid order, using `this.strategyAnyItemFromCollectionForFixedPrice`
      // as the strategy
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
      const collectionMakerBidOrder = {
        isOrderAsk: false,
        signer: this.bob.address,
        collection: this.erc721Token.address,
        price,
        tokenId: 0,
        amount: 1,
        strategy: this.strategyAnyItemFromCollectionForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Sign collection maker bid order
      const signedMessage = await this.bob._signTypedData(
        this.DOMAIN,
        this.TYPES,
        collectionMakerBidOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      collectionMakerBidOrder.r = r;
      collectionMakerBidOrder.s = s;
      collectionMakerBidOrder.v = v;

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const aliceWavaxBalanceBefore = await this.wavax.balanceOf(
        this.alice.address
      );
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const royaltyFeeRecipient1WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );

      // Match taker ask order with collection maker bid order
      await this.exchange
        .connect(this.alice)
        .matchBidWithTakerAsk(takerAskOrder, collectionMakerBidOrder);

      // Check that bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(price)
      );
      expect(await this.erc721Token.ownerOf(tokenId)).to.be.equal(
        this.bob.address
      );

      // Check that protocol received protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const protocolFee = price.mul(this.protocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(protocolFee)
      );

      // Check that royalty recipient received royalty fees
      const royaltyFeeRecipient1WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient1
      );
      const royaltyFeeRecipient2WavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient2
      );
      const royaltyFee1 = price.mul(this.royaltyFeePct1).div(10_000);
      const royaltyFee2 = price.mul(this.royaltyFeePct2).div(10_000);
      expect(royaltyFeeRecipient1WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient1WavaxBalanceBefore.add(royaltyFee1)
      );
      expect(royaltyFeeRecipient2WavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipient2WavaxBalanceBefore.add(royaltyFee2)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(
          price.sub(protocolFee).sub(royaltyFee1).sub(royaltyFee2)
        )
      );
    });

    it("protocol fee recipient receives correct custom protocol fee amount", async function () {
      // Set custom protocol fee for this.erc721Token
      const customProtocolFeePct = this.protocolFeePct * 2;
      await this.protocolFeeManager.setProtocolFeeForCollection(
        this.erc721Token.address,
        customProtocolFeePct
      );

      // Approve transferManagerERC721 to transfer NFT
      const tokenId = 1;
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const { makerAsk: makerAskOrder, takerBid: takerBidOrder } =
        await buildMakerAskOrderAndTakerBidOrder(
          this.DOMAIN,
          this.alice,
          this.bob,
          this.erc721Token.address,
          price,
          tokenId,
          this.strategyStandardSaleForFixedPrice.address,
          WAVAX,
          1
        );

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      const protocolRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );

      // Match taker bid order with maker ask order
      await this.exchange
        .connect(this.bob)
        .matchAskWithTakerBid(takerBidOrder, makerAskOrder);

      // Check that protocol received correct amount of protocol fees
      const protocolRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.protocolFeeRecipient
      );
      const customProtocolFee = price.mul(customProtocolFeePct).div(10000);
      expect(protocolRecipientWavaxBalanceAfter).to.be.equal(
        protocolRecipientWavaxBalanceBefore.add(customProtocolFee)
      );
    });

    it("matchAskWithTakerBidUsingAVAXAndWAVAX should revert when maker ask expired", async function () {
      // Approve transferManagerERC721 to transfer NFT
      const tokenId = 1;
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const { makerAsk, takerBid } = await buildMakerAskOrderAndTakerBidOrder(
        this.DOMAIN,
        this.alice,
        this.bob,
        this.erc721Token.address,
        price,
        tokenId,
        this.strategyStandardSaleForFixedPrice.address,
        WAVAX,
        1
      );

      // Approve exchange to transfer WAVAX
      await this.wavax.connect(this.bob).deposit({ value: price });
      await this.wavax.connect(this.bob).approve(this.exchange.address, price);

      // Alice cancels the order
      await this.exchange.connect(this.alice).cancelAllOrdersForSender(2);

      // Bob shouldn't be able to buy it
      await expect(
        this.exchange
          .connect(this.bob)
          .matchAskWithTakerBidUsingAVAXAndWAVAX(takerBid, makerAsk)
      ).to.be.revertedWith("Order: Matching order expired");
    });
  });

  describe("can batch buy NFTs", function () {
    it("can buy multiple ERC721 tokens with WAVAX", async function () {
      // Check that alice indeed owns the NFT
      const tokens = [
        [1, this.erc721Token],
        [2, this.erc721Token],
        [1, this.erc721TokenB],
      ];
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(
          this.alice.address
        );
      }

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);
      await this.erc721TokenB
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const trades = await Promise.all(
        tokens.map(async (token, i) =>
          buildMakerAskOrderAndTakerBidOrder(
            this.DOMAIN,
            this.alice,
            this.bob,
            token[1].address,
            price,
            token[0],
            this.strategyStandardSaleForFixedPrice.address,
            WAVAX,
            i
          )
        )
      );

      // Approve exchange to transfer WAVAX
      const total = price.mul(tokens.length);
      await this.wavax.connect(this.bob).deposit({ value: total });
      await this.wavax.connect(this.bob).approve(this.exchange.address, total);

      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );

      // Batch buy
      await this.exchange.connect(this.bob).batchBuyWithAVAXAndWAVAX(trades);

      // Check that Bob bought the items
      // Check that Bob paid `price` and now owns the NFT!
      expect(await this.wavax.balanceOf(this.bob.address)).to.be.equal(
        bobWavaxBalanceBefore.sub(total)
      );
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(this.bob.address);
      }
    });

    it("can buy multiple ERC721 tokens with AVAX", async function () {
      // Check that alice indeed owns the NFT
      const tokens = [
        [1, this.erc721Token],
        [2, this.erc721Token],
        [1, this.erc721TokenB],
      ];
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(
          this.alice.address
        );
      }

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);
      await this.erc721TokenB
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const trades = await Promise.all(
        tokens.map(async (token, i) =>
          buildMakerAskOrderAndTakerBidOrder(
            this.DOMAIN,
            this.alice,
            this.bob,
            token[1].address,
            price,
            token[0],
            this.strategyStandardSaleForFixedPrice.address,
            WAVAX,
            i
          )
        )
      );

      // Calculate total cost
      const total = price.mul(tokens.length);

      // Batch buy
      await this.exchange
        .connect(this.bob)
        .batchBuyWithAVAXAndWAVAX(trades, { value: total });

      // Check that Bob bought the items
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(this.bob.address);
      }
    });

    it("can buy multiple ERC721 tokens with AVAX and WAVAX", async function () {
      // Check that alice indeed owns the NFT
      const tokens = [
        [1, this.erc721Token],
        [2, this.erc721Token],
        [1, this.erc721TokenB],
      ];
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(
          this.alice.address
        );
      }

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);
      await this.erc721TokenB
        .connect(this.alice)
        .setApprovalForAll(this.transferManagerERC721.address, true);

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const trades = await Promise.all(
        tokens.map(async (token, i) =>
          buildMakerAskOrderAndTakerBidOrder(
            this.DOMAIN,
            this.alice,
            this.bob,
            token[1].address,
            price,
            token[0],
            this.strategyStandardSaleForFixedPrice.address,
            WAVAX,
            i
          )
        )
      );

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(this.bob)
        .deposit({ value: ethers.utils.parseEther("5") });
      await this.wavax
        .connect(this.bob)
        .approve(this.exchange.address, ethers.utils.parseEther("5"));
      const bobWavaxBalanceBefore = await this.wavax.balanceOf(
        this.bob.address
      );
      const bobAvaxBalanceBefore = await this.bob.getBalance();

      // Batch buy: Bob wants to pay with 1 AVAX and 2 WAVAX
      await this.exchange
        .connect(this.bob)
        .batchBuyWithAVAXAndWAVAX(trades, { value: price });

      // Check that Bob bought the items
      for (const token of tokens) {
        expect(await token[1].ownerOf(token[0])).to.be.equal(this.bob.address);
      }

      // Check that Bob spent 1 AVAX and 2 WAVAX
      const bobWavaxBalanceAfter = await this.wavax.balanceOf(this.bob.address);
      expect(bobWavaxBalanceAfter).to.be.eq(
        bobWavaxBalanceBefore.sub(price.mul(2))
      );
      const bobAvaxBalanceAfter = await this.bob.getBalance();
      expect(bobAvaxBalanceAfter).to.be.closeTo(
        bobAvaxBalanceBefore.sub(price),
        ethers.utils.parseEther("0.001")
      );

      // Reset
      await this.wavax.connect(this.bob).withdraw(ethers.utils.parseEther("3"));
    });

    describe("can buy batch with one expired ask and two valid asks", function () {
      var tokens;
      var trades;
      var price;
      var total;

      beforeEach(async function () {
        // Check that alice indeed owns the NFT
        tokens = [
          [1, this.erc721Token],
          [2, this.erc721Token],
          [1, this.erc721TokenB],
        ];
        for (const token of tokens) {
          expect(await token[1].ownerOf(token[0])).to.be.equal(
            this.alice.address
          );
        }

        // Approve transferManagerERC721 to transfer NFT
        await this.erc721Token
          .connect(this.alice)
          .setApprovalForAll(this.transferManagerERC721.address, true);
        await this.erc721TokenB
          .connect(this.alice)
          .setApprovalForAll(this.transferManagerERC721.address, true);

        // Create maker ask order
        price = ethers.utils.parseEther("1");
        trades = await Promise.all(
          tokens.map(async (token, i) =>
            buildMakerAskOrderAndTakerBidOrder(
              this.DOMAIN,
              this.alice,
              this.bob,
              token[1].address,
              price,
              token[0],
              this.strategyStandardSaleForFixedPrice.address,
              WAVAX,
              i
            )
          )
        );

        // Approve exchange to transfer WAVAX
        total = price.mul(tokens.length);

        // Carol buys one of the token first
        await this.exchange
          .connect(this.carol)
          .matchAskWithTakerBidUsingAVAXAndWAVAX(
            { ...trades[1].takerBid, taker: this.carol.address },
            trades[1].makerAsk,
            { value: price }
          );
        expect(await tokens[1][1].ownerOf(tokens[1][0])).to.be.equal(
          this.carol.address
        );
      });

      describe("batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks with an expired maker ask", function () {
        it("can buy multiple ERC721 tokens with AVAX", async function () {
          // Get Bob's AVAX balance
          const bobAvaxBalanceBefore = await this.bob.getBalance();

          // Batch buy
          await this.exchange
            .connect(this.bob)
            .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades, {
              value: total,
            });

          // Check that Bob bought item 0 and 2, but not 1 because Carol bought it first
          for (const token of [tokens[0], tokens[2]]) {
            expect(await token[1].ownerOf(token[0])).to.be.equal(
              this.bob.address
            );
          }

          // Check that Bob only paid for two items
          const expectedAvaxSpentAmount = bobAvaxBalanceBefore.sub(
            price.mul(2)
          );
          expect(await this.bob.getBalance()).to.be.closeTo(
            expectedAvaxSpentAmount,
            ethers.utils.parseEther("0.001")
          );

          // The exchange shouldn't have any AVAX/WAVAX left
          expect(
            await ethers.provider.getBalance(this.exchange.address)
          ).to.be.eq(0);
          expect(await this.wavax.balanceOf(this.exchange.address)).to.be.eq(0);
        });

        it("can buy multiple ERC721 tokens with WAVAX", async function () {
          // Prepare WAVAX for payment
          await this.wavax.connect(this.bob).deposit({ value: total });
          await this.wavax
            .connect(this.bob)
            .approve(this.exchange.address, total);

          // Get Bob's WAVAX balance
          const bobWavaxBalanceBefore = await this.wavax.balanceOf(
            this.bob.address
          );

          // Batch buy
          await this.exchange
            .connect(this.bob)
            .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades);

          // Check that Bob bought item 0 and 2, but not 1 because Carol bought it first
          for (const token of [tokens[0], tokens[2]]) {
            expect(await token[1].ownerOf(token[0])).to.be.equal(
              this.bob.address
            );
          }

          // Check that Bob only paid for two items
          const bobWavaxBalanceAfter = await this.wavax.balanceOf(
            this.bob.address
          );
          const expectedWavaxSpentAmount = bobWavaxBalanceBefore.sub(
            price.mul(2)
          );
          expect(bobWavaxBalanceAfter).to.be.eq(expectedWavaxSpentAmount);
          await this.wavax.connect(this.bob).withdraw(price);

          // The exchange shouldn't have any AVAX/WAVAX left
          expect(
            await ethers.provider.getBalance(this.exchange.address)
          ).to.be.eq(0);
          expect(await this.wavax.balanceOf(this.exchange.address)).to.be.eq(0);
        });

        it("can buy multiple ERC721 tokens with WAVAX and AVAX", async function () {
          // Prepare WAVAX for payment
          const depositAmount = ethers.utils.parseEther("10");
          await this.wavax.connect(this.bob).deposit({ value: depositAmount });
          await this.wavax
            .connect(this.bob)
            .approve(this.exchange.address, depositAmount);

          // Get Bob's AVAX balance
          const bobAvaxBalanceBefore = await this.bob.getBalance();

          // Get Bob's WAVAX balance
          const bobWavaxBalanceBefore = await this.wavax.balanceOf(
            this.bob.address
          );

          // Batch buy: Bob wants to pay with 1.5 WAVAX and 1.5 AVAX
          await this.exchange
            .connect(this.bob)
            .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades, {
              value: ethers.utils.parseEther("1.5"),
            });

          // Check that Bob bought item 0 and 2, but not 1 because Carol bought it first
          for (const token of [tokens[0], tokens[2]]) {
            expect(await token[1].ownerOf(token[0])).to.be.equal(
              this.bob.address
            );
          }

          // Check that Bob only spent 0.5 WAVAX and 1.5 AVAX
          const bobWavaxBalanceAfter = await this.wavax.balanceOf(
            this.bob.address
          );
          expect(bobWavaxBalanceAfter).to.be.eq(
            bobWavaxBalanceBefore.sub(ethers.utils.parseEther("0.5"))
          );
          const bobAvaxBalanceAfter = await this.bob.getBalance();
          expect(bobAvaxBalanceAfter).to.be.closeTo(
            bobAvaxBalanceBefore.sub(ethers.utils.parseEther("1.5")),
            ethers.utils.parseEther("0.001")
          );

          // The exchange shouldn't have any AVAX/WAVAX left
          expect(
            await ethers.provider.getBalance(this.exchange.address)
          ).to.be.eq(0);
          expect(await this.wavax.balanceOf(this.exchange.address)).to.be.eq(0);
        });

        it("should revert when not enough AVAX", async function () {
          // Carol sends only 1 AVAX but the total cost is 2 AVAX
          await expect(
            this.exchange
              .connect(this.carol)
              .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades, {
                value: price,
              })
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("should revert when not enough WAVAX", async function () {
          // Carol has 1 WAVAX but the total cost is 2 AVAX
          this.wavax.connect(this.carol).deposit({ value: price });
          await expect(
            this.exchange
              .connect(this.carol)
              .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades)
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });

        it("should revert when not enough AVAX/WAVAX", async function () {
          // Carol has 1 WAVAX and 0.5 AVAX but the total cost is 2 AVAX
          this.wavax.connect(this.carol).deposit({ value: price });
          await expect(
            this.exchange
              .connect(this.carol)
              .batchBuyWithAVAXAndWAVAXIgnoringExpiredAsks(trades, {
                value: ethers.utils.parseEther("0.5"),
              })
          ).to.be.revertedWith("SafeERC20: low-level call failed");
        });
      });

      describe("batchBuyWithAVAXAndWAVAX", function () {
        it("should revert when a maker ask has expired", async function () {
          await expect(
            this.exchange
              .connect(this.bob)
              .batchBuyWithAVAXAndWAVAX(trades, { value: total })
          ).to.be.revertedWith("Order: Matching order expired");
        });
      });
    });

    after(async function () {
      await network.provider.request({
        method: "hardhat_reset",
        params: [],
      });
    });
  });

  describe("triggers callback on sales", function () {
    const startTime = parseInt(Date.now() / 1000) - 1000;
    const endTime = startTime + 100000;
    const minPercentageToAsk = 9000;

    beforeEach(async function () {
      const mockAddress = this.mockCallbackReceiver.address;

      await network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [mockAddress],
      });

      await network.provider.request({
        method: "hardhat_setBalance",
        params: [mockAddress, ethers.utils.parseEther("1000")._hex],
      });

      await this.erc721Token.mint(mockAddress);
    });

    it("triggers callback on bids", async function () {
      const mockSigner = ethers.provider.getSigner(
        this.mockCallbackReceiver.address
      );
      const tokenId = 1;

      // Create maker bid order
      const price = ethers.utils.parseEther("1");
      const makerBidOrder = {
        isOrderAsk: false,
        signer: this.mockCallbackReceiver.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
        v: 0,
        r: ethers.utils.formatBytes32String(""),
        s: ethers.utils.formatBytes32String(""),
      };

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(mockSigner)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax
        .connect(mockSigner)
        .approve(this.exchange.address, price);

      // Set mock as callback receiver
      await this.exchange.setCallbackRecipientAllowed(
        this.mockCallbackReceiver.address,
        true
      );

      // Match taker ask order with maker bid order
      await expect(
        this.exchange
          .connect(this.alice)
          .matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.emit(this.mockCallbackReceiver, "CallbackCalled");
    });

    it("doesn't trigger callback on asks", async function () {
      const mockSigner = ethers.provider.getSigner(
        this.mockCallbackReceiver.address
      );
      const tokenId = 3;

      // Create maker ask order
      const price = ethers.utils.parseEther("1");
      const makerAskOrder = {
        isOrderAsk: true,
        signer: this.mockCallbackReceiver.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
        v: 0,
        r: ethers.utils.formatBytes32String(""),
        s: ethers.utils.formatBytes32String(""),
      };

      // Create taker bid order
      const takerBidOrder = {
        isOrderAsk: false,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(mockSigner)
        .setApprovalForAll(this.transferManagerERC721.address, true);

      // Get WAVAX and approve exchange to transfer
      await this.wavax
        .connect(this.alice)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax
        .connect(this.alice)
        .approve(this.exchange.address, price);

      // Set mock as callback receiver
      await this.exchange.setCallbackRecipientAllowed(
        this.mockCallbackReceiver.address,
        true
      );

      // Match taker bid order with maker ask order
      await expect(
        this.exchange
          .connect(this.alice)
          .matchAskWithTakerBid(takerBidOrder, makerAskOrder)
      ).not.to.emit(this.mockCallbackReceiver, "CallbackCalled");
    });

    it("doesn't trigger if the address has been removed", async function () {
      const mockSigner = ethers.provider.getSigner(
        this.mockCallbackReceiver.address
      );
      const tokenId = 1;

      // Create maker bid order
      const price = ethers.utils.parseEther("1");
      const makerBidOrder = {
        isOrderAsk: false,
        signer: this.mockCallbackReceiver.address,
        collection: this.erc721Token.address,
        price,
        tokenId,
        amount: 1,
        strategy: this.strategyStandardSaleForFixedPrice.address,
        currency: WAVAX,
        nonce: 1,
        startTime,
        endTime,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
        v: 0,
        r: ethers.utils.formatBytes32String(""),
        s: ethers.utils.formatBytes32String(""),
      };

      // Create taker ask order
      const takerAskOrder = {
        isOrderAsk: true,
        taker: this.alice.address,
        price,
        tokenId,
        minPercentageToAsk,
        params: ethers.utils.formatBytes32String(""),
      };

      // Approve transferManagerERC721 to transfer NFT
      await this.erc721Token
        .connect(this.alice)
        .approve(this.transferManagerERC721.address, tokenId);

      // Approve exchange to transfer WAVAX
      await this.wavax
        .connect(mockSigner)
        .deposit({ value: ethers.utils.parseEther("1") });
      await this.wavax
        .connect(mockSigner)
        .approve(this.exchange.address, price);

      // Set mock as callback receiver
      await this.exchange.setCallbackRecipientAllowed(
        this.mockCallbackReceiver.address,
        true
      );

      // Removes mock as callback receiver
      await this.exchange.setCallbackRecipientAllowed(
        this.mockCallbackReceiver.address,
        false
      );

      // Match taker ask order with maker bid order
      await expect(
        this.exchange
          .connect(this.alice)
          .matchBidWithTakerAsk(takerAskOrder, makerBidOrder)
      ).to.not.emit(this.mockCallbackReceiver, "CallbackCalled");
    });

    after(async function () {
      await network.provider.request({
        method: "hardhat_reset",
        params: [],
      });
    });
  });
});
