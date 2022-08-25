// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RoyaltyFeeTypes} from "../libraries/RoyaltyFeeTypes.sol";

interface IRoyaltyFeeRegistry {
    function updateRoyaltyInfoForCollection(
        address collection,
        address setter,
        address receiver,
        uint256 fee
    ) external;

    function updateRoyaltyInfoPartsForCollection(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external;

    function updateRoyaltyFeeLimit(uint256 _royaltyFeeLimit) external;

    function royaltyInfo(address collection, uint256 amount)
        external
        view
        returns (address, uint256);

    function royaltyInfoParts(address _collection, uint256 _amount)
        external
        view
        returns (RoyaltyFeeTypes.FeeAmountPart[] memory);

    function royaltyFeeInfoCollection(address collection)
        external
        view
        returns (
            address,
            address,
            uint256
        );

    function royaltyFeeInfoPartsForCollection(address collection)
        external
        view
        returns (address, RoyaltyFeeTypes.FeeInfoPart[] memory);
}
