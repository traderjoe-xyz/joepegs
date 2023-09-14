// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICallbackRecipient {
    function saleCallback(
        bytes32 orderHash,
        address taker,
        uint256 nftId,
        uint256 price
    ) external;
}
