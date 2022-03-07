// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ICurrencyManager} from "./ICurrencyManager.sol";
import {IExecutionManager} from "./IExecutionManager.sol";

import {OrderTypes} from "../libraries/OrderTypes.sol";

interface ILooksRareExchange {
    function matchAskWithTakerBidUsingAVAXAndWAVAX(
        OrderTypes.TakerOrder calldata takerBid,
        OrderTypes.MakerOrder calldata makerAsk
    ) external payable;

    function matchAskWithTakerBid(
        OrderTypes.TakerOrder calldata takerBid,
        OrderTypes.MakerOrder calldata makerAsk
    ) external;

    function matchBidWithTakerAsk(
        OrderTypes.TakerOrder calldata takerAsk,
        OrderTypes.MakerOrder calldata makerBid
    ) external;

    function getMakerOrders(
        address _collection,
        uint256 _tokenId,
        uint256 _offset,
        uint256 _limit
    ) external view returns (OrderTypes.MakerOrder[] memory);

    function createMakerOrder(OrderTypes.MakerOrder memory makerOrder) external;

    function DOMAIN_SEPARATOR() external view returns (bytes32);

    function currencyManager() external view returns (ICurrencyManager);

    function executionManager() external view returns (IExecutionManager);
}
