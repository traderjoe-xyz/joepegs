// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ICallbackRecipient} from "../interfaces/ICallbackRecipient.sol";

contract MockCallbackReceiver is ICallbackRecipient {
    /// @dev bytes4(keccak256("isValidSignature(bytes32,bytes)")
    bytes4 internal constant MAGIC_VALUE = 0x1626ba7e;

    event CallbackCalled();

    function saleCallback(
        bytes32,
        address,
        uint256,
        uint256
    ) external override {
        emit CallbackCalled();
    }

    function isValidSignature(bytes32, bytes memory)
        external
        pure
        returns (bytes4)
    {
        return MAGIC_VALUE;
    }

    function onERC721Received(
        address,
        address,
        uint256,
        bytes memory
    ) external pure returns (bytes4) {
        return MockCallbackReceiver.onERC721Received.selector;
    }
}
