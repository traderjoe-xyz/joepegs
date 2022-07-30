// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import {IProtocolFeeManager} from "./interfaces/IProtocolFeeManager.sol";
import {IRoyaltyFeeManager} from "./interfaces/IRoyaltyFeeManager.sol";
import {IWAVAX} from "./interfaces/IWAVAX.sol";

error AuctionManager__AuctionAlreadyExists();
error AuctionManager__InvalidDuration();
error AuctionManager__OnlyAuctionCreatorCanCancel();
error AuctionManager__CannotCancelAuctionWithBid();
error AuctionManager__NoAuctionExists();
error AuctionManager__InsufficientBidPrice();
error AuctionManager__AuctionCreatorCannotPlaceBid();
error AuctionManager__TransferAVAXFailed();
error AuctionManager__CannotBidOnEndedAuction();
error AuctionManager__CannotExecuteAuctionWithNoBid();
error AuctionManager__CannotExecuteAuctionBeforeEndTime();

/**
 * @title AuctionManager
 * @notice Runs english auctions
 */
contract AuctionManager is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    struct DutchAuction {
        address creator;
        uint256 startingPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 duration;
    }

    struct EnglishAuction {
        address creator;
        address lastBidder;
        uint256 lastBidPrice;
        uint256 endTime;
        uint256 startingPrice;
        uint256 minimumBidIncrement;
    }

    uint256 public immutable PERCENTAGE_PRECISION = 10000;

    address public WAVAX;
    IProtocolFeeManager public protocolFeeManager;
    IRoyaltyFeeManager public royaltyFeeManager;

    address public protocolFeeRecipient;

    mapping(address => mapping(uint256 => DutchAuction)) public dutchAuctions;
    mapping(address => mapping(uint256 => EnglishAuction))
        public englishAuctions;

    uint256 public dutchAuctionDropInterval;
    uint256 public englishAuctionRefreshTime;

    function initialize(
        uint256 _englishAuctionRefreshTime,
        address _protocolFeeManager,
        address _royaltyFeeManager,
        address _wavax,
        address _protocolFeeRecipient
    ) public initializer {
        __Ownable_init();

        englishAuctionRefreshTime = _englishAuctionRefreshTime;
        protocolFeeManager = IProtocolFeeManager(_protocolFeeManager);
        royaltyFeeManager = IRoyaltyFeeManager(_royaltyFeeManager);
        protocolFeeRecipient = _protocolFeeRecipient;
        WAVAX = _wavax;
    }

    function startEnglishAuction(
        address _collection,
        uint256 _tokenId,
        uint256 _duration,
        uint256 _startingPrice,
        uint256 _minimumBidIncrement
    ) public {
        if (_duration == 0) {
            revert AuctionManager__InvalidDuration();
        }
        if (englishAuctions[_collection][_tokenId].creator != address(0)) {
            revert AuctionManager__AuctionAlreadyExists();
        }

        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: msg.sender,
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: block.timestamp + _duration,
            startingPrice: _startingPrice,
            minimumBidIncrement: _minimumBidIncrement
        });

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    function placeBid(address _collection, uint256 _tokenId)
        public
        payable
        nonReentrant
    {
        _placeBid(_collection, _tokenId, msg.value);
    }

    function placeBidWithAVAXAndWAVAX(
        address _collection,
        uint256 _tokenId,
        uint256 _wavaxAmount
    ) public payable nonReentrant {
        if (_wavaxAmount > 0) {
            IERC20(WAVAX).safeTransferFrom(
                msg.sender,
                address(this),
                _wavaxAmount
            );
            // Unwrap WAVAX
            IWAVAX(WAVAX).withdraw(_wavaxAmount);
        }
        _placeBid(_collection, _tokenId, msg.value + _wavaxAmount);
    }

    function executeEnglishAuction(address _collection, uint256 _tokenId)
        public
    {
        EnglishAuction storage auction = englishAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert AuctionManager__NoAuctionExists();
        }
        if (auction.lastBidPrice == 0) {
            revert AuctionManager__CannotExecuteAuctionWithNoBid();
        }
        if (msg.sender != auction.creator) {
            if (block.timestamp < auction.endTime) {
                revert AuctionManager__CannotExecuteAuctionBeforeEndTime();
            }
        }

        address creator = auction.creator;
        address lastBidder = auction.lastBidder;
        uint256 lastBidPrice = auction.lastBidPrice;

        _clearAuction(_collection, _tokenId);

        // Execute sale using latest highest bid
        _transferFeesAndFunds(_collection, _tokenId, creator, lastBidPrice);

        IERC721(_collection).safeTransferFrom(
            address(this),
            lastBidder,
            _tokenId
        );
    }

    function cancelEnglishAuction(address _collection, uint256 _tokenId)
        public
    {
        EnglishAuction memory auction = englishAuctions[_collection][_tokenId];
        if (msg.sender != auction.creator) {
            revert AuctionManager__OnlyAuctionCreatorCanCancel();
        }
        if (auction.lastBidder != address(0)) {
            revert AuctionManager__CannotCancelAuctionWithBid();
        }

        _clearAuction(_collection, _tokenId);

        IERC721(_collection).safeTransferFrom(
            address(this),
            auction.creator,
            _tokenId
        );
    }

    function startDutchAuction(
        address _collection,
        uint256 _tokenId,
        uint256 _duration,
        uint256 _startingPrice,
        uint256 _endPrice
    ) public {
        if (_duration == 0) {
            revert AuctionManager__InvalidDuration();
        }
        if (dutchAuctions[_collection][_tokenId].creator != address(0)) {
            revert AuctionManager__AuctionAlreadyExists();
        }

        dutchAuctions[_collection][_tokenId] = DutchAuction({
            creator: msg.sender,
            startingPrice: _startingPrice,
            endPrice: _endPrice,
            startTime: block.timestamp,
            duration: _duration
        });

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    function _placeBid(
        address _collection,
        uint256 _tokenId,
        uint256 _bidAmount
    ) private {
        EnglishAuction storage auction = englishAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert AuctionManager__NoAuctionExists();
        }
        if (msg.sender == auction.creator) {
            revert AuctionManager__AuctionCreatorCannotPlaceBid();
        }
        if (block.timestamp >= auction.endTime) {
            revert AuctionManager__CannotBidOnEndedAuction();
        }

        if (auction.endTime - block.timestamp <= englishAuctionRefreshTime) {
            auction.endTime += englishAuctionRefreshTime;
        }

        if (auction.lastBidPrice == 0) {
            if (_bidAmount < auction.startingPrice) {
                revert AuctionManager__InsufficientBidPrice();
            }
            auction.lastBidder = msg.sender;
            auction.lastBidPrice = _bidAmount;
        } else {
            if (msg.sender == auction.lastBidder) {
                if (msg.value < auction.minimumBidIncrement) {
                    revert AuctionManager__InsufficientBidPrice();
                }
                auction.lastBidPrice += _bidAmount;
            } else {
                if (
                    _bidAmount <
                    auction.lastBidPrice + auction.minimumBidIncrement
                ) {
                    revert AuctionManager__InsufficientBidPrice();
                }

                address previousBidder = auction.lastBidder;
                uint256 previousBidPrice = auction.lastBidPrice;

                auction.lastBidder = msg.sender;
                auction.lastBidPrice = _bidAmount;

                _transferAVAX(previousBidder, previousBidPrice);
            }
        }
    }

    function _transferFeesAndFunds(
        address collection,
        uint256 tokenId,
        address to,
        uint256 amount
    ) private {
        // Initialize the final amount that is transferred to seller
        uint256 finalSellerAmount = amount;

        // 1. Protocol fee
        {
            uint256 protocolFeeAmount = _calculateProtocolFee(
                collection,
                amount
            );

            // Check if the protocol fee is different than 0 for this strategy
            if (
                (protocolFeeRecipient != address(0)) && (protocolFeeAmount != 0)
            ) {
                _transferAVAX(protocolFeeRecipient, protocolFeeAmount);
                finalSellerAmount -= protocolFeeAmount;
            }
        }

        // 2. Royalty fee
        {
            (
                address royaltyFeeRecipient,
                uint256 royaltyFeeAmount
            ) = royaltyFeeManager.calculateRoyaltyFeeAndGetRecipient(
                    collection,
                    tokenId,
                    amount
                );

            // Check if there is a royalty fee and that it is different to 0
            if (
                (royaltyFeeRecipient != address(0)) && (royaltyFeeAmount != 0)
            ) {
                _transferAVAX(royaltyFeeRecipient, royaltyFeeAmount);
                finalSellerAmount -= royaltyFeeAmount;

                // emit RoyaltyPayment(
                //     collection,
                //     tokenId,
                //     royaltyFeeRecipient,
                //     address(WAVAX),
                //     royaltyFeeAmount
                // );
            }
        }

        // 3. Transfer final amount (post-fees) to seller
        {
            _transferAVAX(to, finalSellerAmount);
        }
    }

    function _clearAuction(address _collection, uint256 _tokenId) private {
        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: address(0),
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: 0,
            startingPrice: 0,
            minimumBidIncrement: 0
        });
    }

    function _transferAVAX(address _to, uint256 _amount) private {
        (bool sent, ) = _to.call{value: _amount}("");
        if (!sent) {
            revert AuctionManager__TransferAVAXFailed();
        }
    }

    /**
     * @notice Calculate protocol fee for a given collection
     * @param _collection address of collection
     * @param _amount amount to transfer
     */
    function _calculateProtocolFee(address _collection, uint256 _amount)
        private
        view
        returns (uint256)
    {
        uint256 protocolFee = protocolFeeManager.protocolFeeForCollection(
            _collection
        );
        return (protocolFee * _amount) / PERCENTAGE_PRECISION;
    }
}
