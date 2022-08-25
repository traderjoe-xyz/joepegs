// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {IRoyaltyFeeRegistry} from "./interfaces/IRoyaltyFeeRegistry.sol";
import {RoyaltyFeeTypes} from "./libraries/RoyaltyFeeTypes.sol";

error RoyaltyFeeRegistry__RoyaltyFeeLimitTooHigh();
error RoyaltyFeeRegistry__RoyaltyFeeTooHigh();
error RoyaltyFeeRegistry__RoyaltyFeeRecipientCannotBeNullAddr();
error RoyaltyFeeRegistry__RoyaltyFeeSetterCannotBeNullAddr();
error RoyaltyFeeRegistry__RoyaltyFeeCannotBeZero();
error RoyaltyFeeRegistry__TooManyFeeRecipients();

/**
 * @title RoyaltyFeeRegistry
 * @notice It is a royalty fee registry for the Joepeg exchange.
 */
contract RoyaltyFeeRegistry is
    IRoyaltyFeeRegistry,
    Initializable,
    OwnableUpgradeable
{
    using RoyaltyFeeTypes for RoyaltyFeeTypes.FeeInfoPart;

    struct FeeInfo {
        address setter;
        address receiver;
        uint256 fee;
    }

    // Limit (if enforced for fee royalty in percentage (10,000 = 100%)
    uint256 public royaltyFeeLimit;
    mapping(address => FeeInfo) private _royaltyFeeInfoCollection;

    // Handles multiple royalty fee recipients
    mapping(address => RoyaltyFeeTypes.FeeInfoPart[])
        private _royaltyFeeInfoPartsCollection;
    mapping(address => address) private _royaltyFeeInfoPartsCollectionSetter;

    uint8 public maxNumRecipients;

    event NewRoyaltyFeeLimit(uint256 royaltyFeeLimit);
    event RoyaltyFeeUpdate(
        address indexed collection,
        address indexed setter,
        address indexed receiver,
        uint256 fee
    );

    modifier isValidRoyaltyFeeLimit(uint256 _royaltyFeeLimit) {
        if (_royaltyFeeLimit > 9500) {
            revert RoyaltyFeeRegistry__RoyaltyFeeLimitTooHigh();
        }
        _;
    }

    /**
     * @notice Initializer
     * @param _royaltyFeeLimit new royalty fee limit (500 = 5%, 1,000 = 10%)
     */
    function initialize(uint256 _royaltyFeeLimit)
        public
        initializer
        isValidRoyaltyFeeLimit(_royaltyFeeLimit)
    {
        __Ownable_init();

        royaltyFeeLimit = _royaltyFeeLimit;
        maxNumRecipients = 5;
    }

    /**
     * @notice Update royalty info for collection
     * @param _royaltyFeeLimit new royalty fee limit (500 = 5%, 1,000 = 10%)
     */
    function updateRoyaltyFeeLimit(uint256 _royaltyFeeLimit)
        external
        override
        isValidRoyaltyFeeLimit(_royaltyFeeLimit)
        onlyOwner
    {
        royaltyFeeLimit = _royaltyFeeLimit;

        emit NewRoyaltyFeeLimit(_royaltyFeeLimit);
    }

    /**
     * @notice Update royalty info for collection
     * @param collection address of the NFT contract
     * @param setter address that sets the receiver
     * @param receiver receiver for the royalty fee
     * @param fee fee (500 = 5%, 1,000 = 10%)
     */
    function updateRoyaltyInfoForCollection(
        address collection,
        address setter,
        address receiver,
        uint256 fee
    ) external override onlyOwner {
        require(fee <= royaltyFeeLimit, "Registry: Royalty fee too high");
        _royaltyFeeInfoCollection[collection] = FeeInfo({
            setter: setter,
            receiver: receiver,
            fee: fee
        });

        emit RoyaltyFeeUpdate(collection, setter, receiver, fee);
    }

    /**
     * @notice Update royalty info for collection
     * @param collection address of the NFT contract
     * @param feeInfoParts address that sets the receiver
     */
    function updateRoyaltyInfoPartsForCollection(
        address collection,
        address setter,
        RoyaltyFeeTypes.FeeInfoPart[] memory feeInfoParts
    ) external override onlyOwner {
        uint256 numFeeInfoParts = feeInfoParts.length;
        if (numFeeInfoParts > maxNumRecipients) {
            revert RoyaltyFeeRegistry__TooManyFeeRecipients();
        }
        if (setter == address(0)) {
            revert RoyaltyFeeRegistry__RoyaltyFeeSetterCannotBeNullAddr();
        }

        uint256 totalFees = 0;

        for (uint256 i = 0; i < numFeeInfoParts; i++) {
            RoyaltyFeeTypes.FeeInfoPart memory feeInfoPart = feeInfoParts[i];
            if (feeInfoPart.receiver == address(0)) {
                revert RoyaltyFeeRegistry__RoyaltyFeeRecipientCannotBeNullAddr();
            }
            if (feeInfoPart.fee == 0) {
                revert RoyaltyFeeRegistry__RoyaltyFeeCannotBeZero();
            }
            totalFees += feeInfoPart.fee;
        }

        if (totalFees > royaltyFeeLimit) {
            revert RoyaltyFeeRegistry__RoyaltyFeeTooHigh();
        }

        _royaltyFeeInfoPartsCollection[collection] = feeInfoParts;
        _royaltyFeeInfoPartsCollectionSetter[collection] = setter;
    }

    /**
     * @notice Calculate royalty info for a collection address and a sale gross amount
     * @param collection collection address
     * @param amount amount
     * @return receiver address and amount received by royalty recipient
     */
    function royaltyInfo(address collection, uint256 amount)
        external
        view
        override
        returns (address, uint256)
    {
        return (
            _royaltyFeeInfoCollection[collection].receiver,
            (amount * _royaltyFeeInfoCollection[collection].fee) / 10000
        );
    }

    function royaltyInfoParts(address _collection, uint256 _amount)
        external
        view
        override
        returns (RoyaltyFeeTypes.FeeAmountPart[] memory)
    {
        RoyaltyFeeTypes.FeeInfoPart[]
            memory feeInfoParts = _royaltyFeeInfoPartsCollection[_collection];
        uint256 numFeeInfoParts = feeInfoParts.length;
        RoyaltyFeeTypes.FeeAmountPart[]
            memory feeAmountParts = new RoyaltyFeeTypes.FeeAmountPart[](
                numFeeInfoParts
            );
        for (uint256 i = 0; i < numFeeInfoParts; i++) {
            RoyaltyFeeTypes.FeeInfoPart memory feeInfoPart = feeInfoParts[i];
            feeAmountParts[i] = RoyaltyFeeTypes.FeeAmountPart({
                receiver: feeInfoPart.receiver,
                amount: (_amount * feeInfoPart.fee) / 10_000
            });
        }
        return feeAmountParts;
    }

    /**
     * @notice View royalty info for a collection address
     * @param collection collection address
     */
    function royaltyFeeInfoCollection(address collection)
        external
        view
        override
        returns (
            address,
            address,
            uint256
        )
    {
        return (
            _royaltyFeeInfoCollection[collection].setter,
            _royaltyFeeInfoCollection[collection].receiver,
            _royaltyFeeInfoCollection[collection].fee
        );
    }

    /**
     * @notice View royalty info for a collection address
     * @param collection collection address
     */
    function royaltyFeeInfoPartsForCollection(address collection)
        external
        view
        override
        returns (address, RoyaltyFeeTypes.FeeInfoPart[] memory)
    {
        if (
            _royaltyFeeInfoPartsCollection[collection].length > 0 &&
            _royaltyFeeInfoPartsCollectionSetter[collection] != address(0)
        ) {
            return (
                _royaltyFeeInfoPartsCollectionSetter[collection],
                _royaltyFeeInfoPartsCollection[collection]
            );
        } else {
            RoyaltyFeeTypes.FeeInfoPart[]
                memory feeInfoParts = new RoyaltyFeeTypes.FeeInfoPart[](1);
            feeInfoParts[0] = RoyaltyFeeTypes.FeeInfoPart({
                receiver: _royaltyFeeInfoCollection[collection].receiver,
                fee: _royaltyFeeInfoCollection[collection].fee
            });
            return (_royaltyFeeInfoCollection[collection].setter, feeInfoParts);
        }
    }
}
