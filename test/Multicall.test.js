const { config, ethers, network } = require("hardhat");
const { expect } = require("chai");

describe("Multicall", function () {
  before(async function () {
    this.ERC721TokenCF = await ethers.getContractFactory("ERC721Token");
    this.ERC1155TokenCF = await ethers.getContractFactory("ERC1155Token");
    this.MulticallCF = await ethers.getContractFactory("Multicall");

    this.signers = await ethers.getSigners();
    this.dev = this.signers[0];
    this.alice = this.signers[1];
    this.bob = this.signers[2];

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
    this.erc1155Token = await this.ERC1155TokenCF.deploy();
    this.multicall = await this.MulticallCF.deploy();

    // Mint ERC721 tokens
    await this.erc721Token.mint(this.alice.address);
    await this.erc721Token.mint(this.alice.address);
    await this.erc721Token.mint(this.alice.address);

    // Mint ERC1155 tokens
    this.erc1155Tokens = [
      { id: 1, amount: 10 },
      { id: 2, amount: 5 },
    ];
    await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.mint(this.alice.address, token.id, token.amount, [])
      )
    );
  });

  it("can transfer multiple ERC721 tokens", async function () {
    const tokenIds = [1, 2];
    const sender = this.alice.address;
    const recipient = this.bob.address;

    // Check that Alice has the tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(sender);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(sender);

    // Alice must approve the multicall as operator
    await this.erc721Token
      .connect(this.alice)
      .setApprovalForAll(this.multicall.address, true);

    // Prepare calls
    const ERC721_ABI = [
      "function safeTransferFrom(address from, address to, uint256 tokenId)",
    ];
    const iface = new ethers.utils.Interface(ERC721_ABI);
    const calls = tokenIds.map((tokenId) => {
      return {
        target: this.erc721Token.address,
        callData: iface.encodeFunctionData("safeTransferFrom", [
          sender,
          recipient,
          tokenId,
        ]),
      };
    });

    // Transfer NFTs
    await this.multicall.connect(this.alice).aggregate(calls);

    // Check that Bob received the tokens
    expect(await this.erc721Token.ownerOf(1)).to.be.equal(recipient);
    expect(await this.erc721Token.ownerOf(2)).to.be.equal(recipient);
  });

  it("can transfer multiple ERC1155 tokens", async function () {
    const sender = this.alice.address;
    const recipient = this.bob.address;

    // Check that Alice has the tokens
    let balances = await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.balanceOf(sender, token.id)
      )
    );
    expect(balances.map((balance) => balance.toNumber())).to.eql(
      this.erc1155Tokens.map((token) => token.amount)
    );

    // Alice must approve the multicall as operator
    await this.erc1155Token
      .connect(this.alice)
      .setApprovalForAll(this.multicall.address, true);

    // Prepare calls
    const ERC1155_ABI = [
      "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
    ];
    const iface = new ethers.utils.Interface(ERC1155_ABI);
    const calls = this.erc1155Tokens.map((token) => {
      return {
        target: this.erc1155Token.address,
        callData: iface.encodeFunctionData("safeTransferFrom", [
          sender,
          recipient,
          token.id,
          token.amount,
          [],
        ]),
      };
    });

    // Transfer NFTs
    await this.multicall.connect(this.alice).aggregate(calls);

    // Check that Bob received the tokens
    balances = await Promise.all(
      this.erc1155Tokens.map((token) =>
        this.erc1155Token.balanceOf(recipient, token.id)
      )
    );
    expect(balances.map((balance) => balance.toNumber())).to.eql(
      this.erc1155Tokens.map((token) => token.amount)
    );
  });

  after(async function () {
    await network.provider.request({
      method: "hardhat_reset",
      params: [],
    });
  });
});
