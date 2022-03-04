// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OrderTypes} from "../libraries/OrderTypes.sol";

interface IOrderBook {
    function createMakerOrder(OrderTypes.MakerOrder calldata makerOrder)
        external;

    function markMakerOrderAsExecutedOrCancelled(
        address makerOrderSigner,
        uint256 makerOrderNonce
    ) external;

    function cancelAllOrdersForSender(uint256 minNonce) external;

    function cancelMultipleMakerOrders(uint256[] calldata orderNonces) external;

    function isUserOrderNonceExecutedOrCancelled(
        address user,
        uint256 orderNonce
    ) external view returns (bool);

    function validateOrder(
        OrderTypes.MakerOrder calldata makerOrder,
        bytes32 orderHash
    ) external view;
}
