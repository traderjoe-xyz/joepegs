const buildMakerAskOrderAndTakerBidOrder = async (
  DOMAIN,
  seller,
  buyer,
  collection,
  price,
  tokenId,
  strategy,
  currency,
  nonce
) => {
  const startTime = parseInt(Date.now() / 1000) - 1000;
  const endTime = startTime + 100000;
  const minPercentageToAsk = 9000;

  const MAKER_ORDER_TYPE = [
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
  const TYPES = {
    MakerOrder: MAKER_ORDER_TYPE,
  };

  // Following https://dev.to/zemse/ethersjs-signing-eip712-typed-structs-2ph8
  const makerAskOrder = {
    isOrderAsk: true,
    signer: seller.address,
    collection,
    price,
    tokenId,
    amount: 1,
    currency,
    strategy,
    nonce,
    startTime,
    endTime,
    minPercentageToAsk,
    params: ethers.utils.formatBytes32String(""),
  };

  // Sign maker ask order
  const signedMessage = await seller._signTypedData(
    DOMAIN,
    TYPES,
    makerAskOrder
  );
  const { r, s, v } = ethers.utils.splitSignature(signedMessage);
  makerAskOrder.r = r;
  makerAskOrder.s = s;
  makerAskOrder.v = v;

  // Create taker bid order
  const takerBidOrder = {
    isOrderAsk: false,
    taker: buyer.address,
    price,
    tokenId,
    minPercentageToAsk,
    params: ethers.utils.formatBytes32String(""),
  };

  return { makerAsk: makerAskOrder, takerBid: takerBidOrder };
};

module.exports = { buildMakerAskOrderAndTakerBidOrder };
