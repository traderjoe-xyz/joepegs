// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ICallbackRecipient {
    function saleCallback(address taker, bytes32 orderHash) external;
}
