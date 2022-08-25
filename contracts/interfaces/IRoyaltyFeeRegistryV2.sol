// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {RoyaltyFeeTypes} from "../libraries/RoyaltyFeeTypes.sol";

interface IRoyaltyFeeRegistryV2 {
    function updateRoyaltyInfoPartsForCollection(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external;

    function updateRoyaltyFeeLimit(uint256 _royaltyFeeLimit) external;

    function royaltyInfoParts(address _collection, uint256 _amount)
        external
        view
        returns (RoyaltyFeeTypes.FeeAmountPart[] memory);

    function royaltyFeeInfoPartsForCollection(address collection)
        external
        view
        returns (address, RoyaltyFeeTypes.FeeInfoPart[] memory);
}
