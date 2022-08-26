// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC165, IERC2981} from "@openzeppelin/contracts/interfaces/IERC2981.sol";

import {IRoyaltyFeeManager} from "./interfaces/IRoyaltyFeeManager.sol";
import {IRoyaltyFeeRegistry} from "./interfaces/IRoyaltyFeeRegistry.sol";
import {IRoyaltyFeeRegistryV2} from "./interfaces/IRoyaltyFeeRegistryV2.sol";
import {RoyaltyFeeTypes} from "./libraries/RoyaltyFeeTypes.sol";

/**
 * @title RoyaltyFeeManager
 * @notice Handles the logic to check and transfer royalty fees (if any).
 */
contract RoyaltyFeeManager is
    IRoyaltyFeeManager,
    Initializable,
    OwnableUpgradeable
{
    using RoyaltyFeeTypes for RoyaltyFeeTypes.FeeInfoPart;

    // https://eips.ethereum.org/EIPS/eip-2981
    bytes4 public constant INTERFACE_ID_ERC2981 = 0x2a55205a;

    IRoyaltyFeeRegistry public royaltyFeeRegistry;
    IRoyaltyFeeRegistryV2 public royaltyFeeRegistryV2;

    /**
     * @notice Initializer
     * @param _royaltyFeeRegistry address of the RoyaltyFeeRegistry
     * @param _royaltyFeeRegistryV2 address of the RoyaltyFeeRegistryV2
     */
    function initialize(
        address _royaltyFeeRegistry,
        address _royaltyFeeRegistryV2
    ) public initializer {
        __Ownable_init();

        royaltyFeeRegistry = IRoyaltyFeeRegistry(_royaltyFeeRegistry);
        royaltyFeeRegistryV2 = IRoyaltyFeeRegistryV2(_royaltyFeeRegistryV2);
    }

    /**
     * @notice Calculate royalty fee and get recipient
     * @param collection address of the NFT contract
     * @param tokenId tokenId
     * @param amount amount to transfer
     */
    function calculateRoyaltyFeeAndGetRecipient(
        address collection,
        uint256 tokenId,
        uint256 amount
    ) external view override returns (address, uint256) {
        // 1. Check if there is a royalty info in the system
        (address receiver, uint256 royaltyAmount) = royaltyFeeRegistry
            .royaltyInfo(collection, amount);

        // 2. If the receiver is address(0), fee is null, check if it supports the ERC2981 interface
        if ((receiver == address(0)) || (royaltyAmount == 0)) {
            if (IERC165(collection).supportsInterface(INTERFACE_ID_ERC2981)) {
                (receiver, royaltyAmount) = IERC2981(collection).royaltyInfo(
                    tokenId,
                    amount
                );
            }
        }
        return (receiver, royaltyAmount);
    }

    function calculateRoyaltyFeeAmountParts(
        address collection,
        uint256 tokenId,
        uint256 amount
    ) external view override returns (RoyaltyFeeTypes.FeeAmountPart[] memory) {
        // Check if there is royalty info in the system
        RoyaltyFeeTypes.FeeAmountPart[]
            memory registryFeeAmountParts = royaltyFeeRegistryV2
                .royaltyAmountParts(collection, amount);

        if (registryFeeAmountParts.length > 0) {
            return registryFeeAmountParts;
        }

        // There is no royalty info set in registry so check if it supports the ERC2981 interface
        if (IERC165(collection).supportsInterface(INTERFACE_ID_ERC2981)) {
            (address receiver, uint256 royaltyAmount) = IERC2981(collection)
                .royaltyInfo(tokenId, amount);
            RoyaltyFeeTypes.FeeAmountPart[]
                memory feeAmountParts = new RoyaltyFeeTypes.FeeAmountPart[](1);
            feeAmountParts[0] = RoyaltyFeeTypes.FeeAmountPart({
                receiver: receiver,
                amount: royaltyAmount
            });
            return feeAmountParts;
        } else {
            return new RoyaltyFeeTypes.FeeAmountPart[](0);
        }
    }
}
