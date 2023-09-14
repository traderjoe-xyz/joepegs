const { ethers } = require("hardhat");

function getProxyOwner(chainId) {
  if (chainId == 43113) {
    // Avax Fuji
    return "0xdB40a7b71642FE24CC546bdF4749Aa3c0B042f78";
  } else if (chainId == 43114 || chainId == 31337) {
    // Avax Mainnet or forked multisig
    return "0x64c4607AD853999EE5042Ba8377BfC4099C273DE";
  } else if (chainId == 97) {
    // BSC Testnet
    return "0x310c9B5cE631F7e0AC5F5D6D6d4Cfe7dC27992E1";
  } else if (chainId == 56) {
    // BSC Mainnet multisig
    return "0x65f64965718649cB67434E8d0B5dd122d51972D1";
  } else {
    throw `Unknown chain ID ${chainId}`;
  }
}

function getWNative(chainId) {
  if (chainId == 43114 || chainId == 31337) {
    // Avax Mainnet or forked
    return ethers.utils.getAddress(
      "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7"
    );
  } else if (chainId == 43113) {
    // Avax Fuji
    return ethers.utils.getAddress(
      "0xd00ae08403B9bbb9124bB305C09058E32C39A48c"
    );
  } else if (chainId == 97) {
    // BSC Testnet
    return ethers.utils.getAddress(
      "0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd"
    );
  } else if (chainId == 56) {
    // BSC Mainnet
    return ethers.utils.getAddress(
      "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
    );
  } else {
    throw new Error("Failed to find WAVAX address");
  }
}

module.exports = {
  getProxyOwner: getProxyOwner,
  getWNative: getWNative,
};
