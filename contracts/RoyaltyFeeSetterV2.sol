// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {IRoyaltyFeeRegistryV2} from "./interfaces/IRoyaltyFeeRegistryV2.sol";
import {IOwnable} from "./interfaces/IOwnable.sol";
import {RoyaltyFeeTypes} from "./libraries/RoyaltyFeeTypes.sol";

/**
 * @title RoyaltyFeeSetter
 * @notice Used to allow creators to set royalty parameters in RoyaltyFeeRegistryV2.
 */
contract RoyaltyFeeSetterV2 is Initializable, OwnableUpgradeable {
    using RoyaltyFeeTypes for RoyaltyFeeTypes.FeeInfoPart;

    // ERC721 interfaceID
    bytes4 public constant INTERFACE_ID_ERC721 = 0x80ac58cd;

    // ERC1155 interfaceID
    bytes4 public constant INTERFACE_ID_ERC1155 = 0xd9b67a26;

    // ERC2981 interfaceID
    bytes4 public constant INTERFACE_ID_ERC2981 = 0x2a55205a;

    address public royaltyFeeRegistryV2;

    /**
     * @notice Initializer
     * @param _royaltyFeeRegistryV2 address of the royalty fee registry
     */
    function initialize(address _royaltyFeeRegistryV2) public initializer {
        __Ownable_init();

        royaltyFeeRegistryV2 = _royaltyFeeRegistryV2;
    }

    /**
     * @notice Update royalty info for collection if admin
     * @dev Only to be called if there is no setter address
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param feeInfoParts fee info parts
     */
    function updateRoyaltyInfoPartsForCollectionIfAdmin(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external {
        require(
            !IERC165(collection).supportsInterface(INTERFACE_ID_ERC2981),
            "Admin: Must not be ERC2981"
        );
        require(
            msg.sender == IOwnable(collection).admin(),
            "Admin: Not the admin"
        );
        _updateRoyaltyInfoPartsForCollectionIfOwnerOrAdmin(
            collection,
            setter,
            feeInfoParts
        );
    }

    /**
     * @notice Update royalty info for collection if owner
     * @dev Only to be called if there is no setter address
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param feeInfoParts fee info parts
     */
    function updateRoyaltyInfoPartsForCollectionIfOwner(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external {
        require(
            !IERC165(collection).supportsInterface(INTERFACE_ID_ERC2981),
            "Owner: Must not be ERC2981"
        );
        require(
            msg.sender == IOwnable(collection).owner(),
            "Owner: Not the owner"
        );
        _updateRoyaltyInfoPartsForCollectionIfOwnerOrAdmin(
            collection,
            setter,
            feeInfoParts
        );
    }

    /**
     * @notice Update royalty info for collection
     * @dev Only to be called if there msg.sender is the setter
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param feeInfoParts fee info parts
     */
    function updateRoyaltyInfoPartsForCollectionIfSetter(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external {
        address currentSetter = IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2)
            .royaltyFeeInfoPartsCollectionSetter(collection);
        require(msg.sender == currentSetter, "Setter: Not the setter");
        IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2)
            .updateRoyaltyInfoPartsForCollection(
                collection,
                setter,
                feeInfoParts
            );
    }

    /**
     * @notice Update royalty info for collection
     * @dev Can only be called by contract owner (of this)
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param feeInfoParts fee info parts
     */
    function updateRoyaltyInfoPartsForCollection(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external onlyOwner {
        IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2)
            .updateRoyaltyInfoPartsForCollection(
                collection,
                setter,
                feeInfoParts
            );
    }

    /**
     * @notice Update owner of royalty fee registry
     * @dev Can be used for migration of this royalty fee setter contract
     * @param _owner new owner address
     */
    function updateOwnerOfRoyaltyFeeRegistryV2(address _owner)
        external
        onlyOwner
    {
        IOwnable(royaltyFeeRegistryV2).transferOwnership(_owner);
    }

    /**
     * @notice Update royalty info for collection
     * @param _royaltyFeeLimit new royalty fee limit (500 = 5%, 1,000 = 10%)
     */
    function updateRoyaltyFeeLimit(uint256 _royaltyFeeLimit)
        external
        onlyOwner
    {
        IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2).updateRoyaltyFeeLimit(
            _royaltyFeeLimit
        );
    }

    /**
     * @notice Update information and perform checks before updating royalty fee registry
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param feeInfoParts fee info parts
     */
    function _updateRoyaltyInfoPartsForCollectionIfOwnerOrAdmin(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) internal {
        address currentSetter = IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2)
            .royaltyFeeInfoPartsCollectionSetter(collection);
        require(currentSetter == address(0), "Setter: Already set");
        require(
            (IERC165(collection).supportsInterface(INTERFACE_ID_ERC721) ||
                IERC165(collection).supportsInterface(INTERFACE_ID_ERC1155)),
            "Setter: Not ERC721/ERC1155"
        );
        IRoyaltyFeeRegistryV2(royaltyFeeRegistryV2)
            .updateRoyaltyInfoPartsForCollection(
                collection,
                setter,
                feeInfoParts
            );
    }
}
