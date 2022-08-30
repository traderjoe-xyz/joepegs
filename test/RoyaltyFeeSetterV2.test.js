const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { describe } = require("mocha");

describe.only("RoyaltyFeeSetterV2", function () {
  let royaltyFeeManager;
  let royaltyFeeRecipient1;
  let royaltyFeeRecipient2;
  let royaltyFeePct1;
  let royaltyFeePct2;

  const tokenId = 1;
  const amount = ethers.utils.parseEther("1");

  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ERC721WithoutRoyaltyTokenCF = await ethers.getContractFactory(
      "ERC721WithoutRoyaltyToken"
    );
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
    this.erc721WithoutRoyaltyToken =
      await this.ERC721WithoutRoyaltyTokenCF.deploy();
    await this.erc721Token.transferOwnership(this.alice.address);
    await this.erc721WithoutRoyaltyToken.transferOwnership(this.alice.address);

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
    royaltyFeeManager = this.royaltyFeeManager;
    await this.royaltyFeeManager.initialize(this.royaltyFeeRegistry.address);
    await this.royaltyFeeManager.updateRoyaltyFeeRegistryV2(
      this.royaltyFeeRegistryV2.address
    );

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

  const assertRoyaltyInfoPartsSet = async (
    collection,
    _royaltyFeePct1 = royaltyFeePct1,
    _royaltyFeePct2 = royaltyFeePct2
  ) => {
    const feeAmountParts =
      await royaltyFeeManager.calculateRoyaltyFeeAmountParts(
        collection,
        tokenId,
        amount
      );
    expect(feeAmountParts.length).to.be.equal(2);

    expect(royaltyFeeRecipient1).to.be.equal(feeAmountParts[0].receiver);
    expect(amount.mul(_royaltyFeePct1).div(10_000)).to.be.equal(
      feeAmountParts[0].amount
    );

    expect(royaltyFeeRecipient2).to.be.equal(feeAmountParts[1].receiver);
    expect(amount.mul(_royaltyFeePct2).div(10_000)).to.be.equal(
      feeAmountParts[1].amount
    );
  };

  describe("updateRoyaltyInfoPartsForCollectionIfAdmin", function () {
    it("cannot update if supports ERC2981", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.alice)
          .updateRoyaltyInfoPartsForCollectionIfAdmin(
            this.erc721Token.address,
            this.dev.address,
            [{ receiver: this.alice.address, fee: 100 }]
          )
      ).to.be.revertedWith(
        "RoyaltyFeeSetterV2__CollectionCannotSupportERC2981"
      );
    });

    it("cannot update if not admin", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.carol)
          .updateRoyaltyInfoPartsForCollectionIfAdmin(
            this.erc721WithoutRoyaltyToken.address,
            this.dev.address,
            [{ receiver: this.alice.address, fee: 100 }]
          )
      ).to.be.revertedWith("RoyaltyFeeSetterV2__NotCollectionAdmin");
    });

    it("can successfully update", async function () {
      await this.royaltyFeeSetterV2
        .connect(this.alice)
        .updateRoyaltyInfoPartsForCollectionIfAdmin(
          this.erc721WithoutRoyaltyToken.address,
          this.dev.address,
          [
            { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
            { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
          ]
        );
      await assertRoyaltyInfoPartsSet(this.erc721WithoutRoyaltyToken.address);
    });
  });

  describe("updateRoyaltyInfoPartsForCollectionIfOwner", function () {
    it("cannot update if supports ERC2981", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.alice)
          .updateRoyaltyInfoPartsForCollectionIfOwner(
            this.erc721Token.address,
            this.dev.address,
            [{ receiver: this.alice.address, fee: 100 }]
          )
      ).to.be.revertedWith(
        "RoyaltyFeeSetterV2__CollectionCannotSupportERC2981"
      );
    });

    it("cannot update if not owner", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.carol)
          .updateRoyaltyInfoPartsForCollectionIfOwner(
            this.erc721WithoutRoyaltyToken.address,
            this.dev.address,
            [{ receiver: this.alice.address, fee: 100 }]
          )
      ).to.be.revertedWith("RoyaltyFeeSetterV2__NotCollectionOwner");
    });

    it("can successfully update", async function () {
      await this.royaltyFeeSetterV2
        .connect(this.alice)
        .updateRoyaltyInfoPartsForCollectionIfOwner(
          this.erc721WithoutRoyaltyToken.address,
          this.dev.address,
          [
            { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
            { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
          ]
        );
      await assertRoyaltyInfoPartsSet(this.erc721WithoutRoyaltyToken.address);
    });
  });

  describe("updateRoyaltyInfoPartsForCollectionIfSetter", function () {
    it("cannot update if not setter", async function () {
      const setter = this.bob;
      await this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollection(
        this.erc721WithoutRoyaltyToken.address,
        setter.address,
        [
          { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
          { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
        ]
      );

      await expect(
        this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollectionIfSetter(
          this.erc721WithoutRoyaltyToken.address,
          setter.address,
          [
            {
              receiver: this.royaltyFeeRecipient1,
              fee: this.royaltyFeePct1 / 2,
            },
            {
              receiver: this.royaltyFeeRecipient2,
              fee: this.royaltyFeePct2 / 2,
            },
          ]
        )
      ).to.be.revertedWith("RoyaltyFeeSetterV2__NotCollectionSetter");
    });

    it("can successfully update", async function () {
      const setter = this.bob;
      await this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollection(
        this.erc721WithoutRoyaltyToken.address,
        setter.address,
        [
          { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
          { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
        ]
      );

      const newRoyaltyFeePct1 = this.royaltyFeePct1 / 2;
      const newRoyaltyFeePct2 = this.royaltyFeePct2 / 2;
      await this.royaltyFeeSetterV2
        .connect(this.bob)
        .updateRoyaltyInfoPartsForCollectionIfSetter(
          this.erc721WithoutRoyaltyToken.address,
          setter.address,
          [
            { receiver: this.royaltyFeeRecipient1, fee: newRoyaltyFeePct1 },
            { receiver: this.royaltyFeeRecipient2, fee: newRoyaltyFeePct2 },
          ]
        );
      await assertRoyaltyInfoPartsSet(
        this.erc721WithoutRoyaltyToken.address,
        newRoyaltyFeePct1,
        newRoyaltyFeePct2
      );
    });
  });

  describe("updateRoyaltyInfoPartsForCollection", function () {
    it("cannot update if not owner", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.alice)
          .updateRoyaltyInfoPartsForCollection(
            this.erc721Token.address,
            this.dev.address,
            [
              { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
              { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
            ]
          )
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("can successfully update", async function () {
      await this.royaltyFeeSetterV2.updateRoyaltyInfoPartsForCollection(
        this.erc721Token.address,
        this.dev.address,
        [
          { receiver: this.royaltyFeeRecipient1, fee: this.royaltyFeePct1 },
          { receiver: this.royaltyFeeRecipient2, fee: this.royaltyFeePct2 },
        ]
      );
      await assertRoyaltyInfoPartsSet(this.erc721Token.address);
    });
  });

  describe("updateOwnerOfRoyaltyFeeRegistryV2", function () {
    it("cannot update if not owner", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.alice)
          .updateOwnerOfRoyaltyFeeRegistryV2(this.bob.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("can successfully update", async function () {
      await this.royaltyFeeSetterV2.updateOwnerOfRoyaltyFeeRegistryV2(
        this.bob.address
      );

      await expect(await this.royaltyFeeRegistryV2.owner()).to.be.equal(
        this.bob.address
      );
    });
  });

  describe("updateRoyaltyFeeLimit", function () {
    it("cannot update if not owner", async function () {
      await expect(
        this.royaltyFeeSetterV2
          .connect(this.alice)
          .updateRoyaltyFeeLimit(this.royaltyFeeLimit * 2)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("can successfully update", async function () {
      const newRoyaltyFeeLimit = this.royaltyFeeLimit * 2;
      await this.royaltyFeeSetterV2.updateRoyaltyFeeLimit(newRoyaltyFeeLimit);

      await expect(
        await this.royaltyFeeRegistryV2.royaltyFeeLimit()
      ).to.be.equal(newRoyaltyFeeLimit);
    });
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
