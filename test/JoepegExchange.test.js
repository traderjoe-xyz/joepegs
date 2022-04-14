const { config, ethers, network, upgrades } = require("hardhat");
const { expect } = require("chai");
const { advanceTimeAndBlock, duration } = require("./utils/time");
const { start } = require("repl");

const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

xdescribe("JoepegExchange", function () {
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
    this.RoyaltyFeeSetterCF = await ethers.getContractFactory(
      "RoyaltyFeeSetter"
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

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.royaltyFeeRecipient = this.signers[1].address;
    this.alice = this.signers[2];
    this.bob = this.signers[3];
    this.carol = this.signers[4];

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
    this.executionManager = await this.ExecutionManagerCF.deploy();
    this.protocolFeePct = 100; // 100 = 1%
    this.protocolFeeManager = await this.ProtocolFeeManagerCF.deploy(
      this.protocolFeePct
    );
    this.royaltyFeeLimit = 1000; // 1000 = 10%
    this.royaltyFeeRegistry = await this.RoyaltyFeeRegistryCF.deploy(
      this.royaltyFeeLimit
    );
    this.royaltyFeeSetter = await this.RoyaltyFeeSetterCF.deploy(
      this.royaltyFeeRegistry.address
    );
    this.royaltyFeeManager = await this.RoyaltyFeeManagerCF.deploy(
      this.royaltyFeeRegistry.address
    );
    this.protocolFeeRecipient = this.dev.address;
    this.strategyStandardSaleForFixedPrice =
      await this.StrategyStandardSaleForFixedPriceCF.deploy();
    this.strategyAnyItemFromCollectionForFixedPrice =
      await this.StrategyAnyItemFromCollectionForFixedPriceCF.deploy();
    this.exchange = await this.ExchangeCF.deploy(
      this.currencyManager.address,
      this.executionManager.address,
      this.protocolFeeManager.address,
      this.royaltyFeeManager.address,
      WAVAX,
      this.protocolFeeRecipient
    );
    this.transferManagerERC721 = await this.TransferManagerERC721CF.deploy(
      this.exchange.address
    );
    this.transferManagerERC1155 = await this.TransferManagerERC1155CF.deploy(
      this.exchange.address
    );
    this.transferSelectorNFT = await this.TransferSelectorNFTCF.deploy(
      this.transferManagerERC721.address,
      this.transferManagerERC1155.address
    );

    // Mint
    await this.erc721Token.mint(this.alice.address);

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
    await this.erc721Token.transferOwnership(this.royaltyFeeRecipient);

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
      // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
      const price = ethers.utils.parseEther("1");
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

      // Sign maker ask order
      const signedMessage = await this.alice._signTypedData(
        this.DOMAIN,
        this.TYPES,
        makerAskOrder
      );
      const { r, s, v } = ethers.utils.splitSignature(signedMessage);
      makerAskOrder.r = r;
      makerAskOrder.s = s;
      makerAskOrder.v = v;

      // Create taker bid order
      const takerBidOrder = {
        isOrderAsk: false,
        taker: this.bob.address,
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
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
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

      // Check that royalty recipient received royalty fees
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
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
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
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
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
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
      const royaltyFeeRecipientWavaxBalanceBefore = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
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
      const [_, royaltyFee] = await this.erc721Token.royaltyInfo(
        tokenId,
        price
      );
      const royaltyFeeRecipientWavaxBalanceAfter = await this.wavax.balanceOf(
        this.royaltyFeeRecipient
      );
      expect(royaltyFeeRecipientWavaxBalanceAfter).to.be.equal(
        royaltyFeeRecipientWavaxBalanceBefore.add(royaltyFee)
      );

      // Check that seller received `price - protocolFee - royaltyFee`
      const aliceWavaxBalanceAfter = await this.wavax.balanceOf(
        this.alice.address
      );
      expect(aliceWavaxBalanceAfter).to.be.equal(
        aliceWavaxBalanceBefore.add(price.sub(protocolFee).sub(royaltyFee))
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
