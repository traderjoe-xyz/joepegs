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

error JoepegAuctionHouse__AuctionAlreadyExists();
error JoepegAuctionHouse__InvalidDuration();
error JoepegAuctionHouse__NoAuctionExists();
error JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
error JoepegAuctionHouse__TransferAVAXFailed();

error JoepegAuctionHouse__EnglishAuctionCannotBidOnEndedAuction();
error JoepegAuctionHouse__EnglishAuctionCannotCancelWithExistingBid();
error JoepegAuctionHouse__EnglishAuctionCannotExecuteBeforeEndTime();
error JoepegAuctionHouse__EnglishAuctionCannotExecuteWithNoBid();
error JoepegAuctionHouse__EnglishAuctionCreatorCannotPlaceBid();
error JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();

error JoepegAuctionHouse__DutchAuctionInsufficientAVAX();
error JoepegAuctionHouse__DutchAuctionInvalidStartEndPrice();

/**
 * @title JoepegAuctionHouse
 * @notice An auction house that supports running English and Dutch auctions on ERC721 tokens
 */
contract JoepegAuctionHouse is
    Initializable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;

    struct DutchAuction {
        address creator;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
    }

    struct EnglishAuction {
        address creator;
        address lastBidder;
        uint256 lastBidPrice;
        uint256 endTime;
        uint256 startPrice;
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
        uint256 _startPrice,
        uint256 _minimumBidIncrement
    ) public {
        if (_duration == 0) {
            revert JoepegAuctionHouse__InvalidDuration();
        }
        if (englishAuctions[_collection][_tokenId].creator != address(0)) {
            revert JoepegAuctionHouse__AuctionAlreadyExists();
        }

        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: msg.sender,
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: block.timestamp + _duration,
            startPrice: _startPrice,
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
        EnglishAuction memory auction = englishAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (auction.lastBidPrice == 0) {
            revert JoepegAuctionHouse__EnglishAuctionCannotExecuteWithNoBid();
        }
        if (msg.sender != auction.creator) {
            if (block.timestamp < auction.endTime) {
                revert JoepegAuctionHouse__EnglishAuctionCannotExecuteBeforeEndTime();
            }
        }

        _clearEnglishAuction(_collection, _tokenId);

        // Execute sale using latest highest bid
        _transferFeesAndFunds(
            _collection,
            _tokenId,
            auction.creator,
            auction.lastBidPrice
        );

        IERC721(_collection).safeTransferFrom(
            address(this),
            auction.lastBidder,
            _tokenId
        );
    }

    function cancelEnglishAuction(address _collection, uint256 _tokenId)
        public
    {
        EnglishAuction memory auction = englishAuctions[_collection][_tokenId];
        if (msg.sender != auction.creator) {
            revert JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
        }
        if (auction.lastBidder != address(0)) {
            revert JoepegAuctionHouse__EnglishAuctionCannotCancelWithExistingBid();
        }

        _clearEnglishAuction(_collection, _tokenId);

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
        uint256 _startPrice,
        uint256 _endPrice
    ) public {
        if (_duration == 0) {
            revert JoepegAuctionHouse__InvalidDuration();
        }
        if (dutchAuctions[_collection][_tokenId].creator != address(0)) {
            revert JoepegAuctionHouse__AuctionAlreadyExists();
        }
        if (_startPrice <= _endPrice || _endPrice == 0) {
            revert JoepegAuctionHouse__DutchAuctionInvalidStartEndPrice();
        }

        dutchAuctions[_collection][_tokenId] = DutchAuction({
            creator: msg.sender,
            startPrice: _startPrice,
            endPrice: _endPrice,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration
        });

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    function executeDutchAuction(address _collection, uint256 _tokenId)
        public
        payable
    {
        _executeDutchAuction(_collection, _tokenId, msg.value);
    }

    function executeDutchAuctionWithAVAXAndWAVAX(
        address _collection,
        uint256 _tokenId,
        uint256 _wavaxAmount
    ) public payable {
        if (_wavaxAmount > 0) {
            IERC20(WAVAX).safeTransferFrom(
                msg.sender,
                address(this),
                _wavaxAmount
            );
            // Unwrap WAVAX
            IWAVAX(WAVAX).withdraw(_wavaxAmount);
        }
        _executeDutchAuction(_collection, _tokenId, msg.value + _wavaxAmount);
    }

    function getDutchAuctionSalePrice(address _collection, uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        DutchAuction memory auction = dutchAuctions[_collection][_tokenId];
        if (block.timestamp >= auction.endTime) {
            return auction.endPrice;
        }
        uint256 timeElapsed = block.timestamp - auction.startTime;
        uint256 elapsedSteps = timeElapsed / dutchAuctionDropInterval;
        uint256 totalPossibleSteps = (auction.endTime - auction.startTime) /
            dutchAuctionDropInterval;

        uint256 priceDifference = auction.startPrice - auction.endPrice;
        uint256 priceDropPerStep = priceDifference / totalPossibleSteps;

        return auction.startPrice - elapsedSteps * priceDropPerStep;
    }

    function cancelDutchAuction(address _collection, uint256 _tokenId) public {
        DutchAuction memory auction = dutchAuctions[_collection][_tokenId];
        if (msg.sender != auction.creator) {
            revert JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
        }

        _clearDutchAuction(_collection, _tokenId);

        IERC721(_collection).safeTransferFrom(
            address(this),
            auction.creator,
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
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (msg.sender == auction.creator) {
            revert JoepegAuctionHouse__EnglishAuctionCreatorCannotPlaceBid();
        }
        if (block.timestamp >= auction.endTime) {
            revert JoepegAuctionHouse__EnglishAuctionCannotBidOnEndedAuction();
        }

        if (auction.endTime - block.timestamp <= englishAuctionRefreshTime) {
            auction.endTime += englishAuctionRefreshTime;
        }

        if (auction.lastBidPrice == 0) {
            if (_bidAmount < auction.startPrice) {
                revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
            }
            auction.lastBidder = msg.sender;
            auction.lastBidPrice = _bidAmount;
        } else {
            if (msg.sender == auction.lastBidder) {
                if (msg.value < auction.minimumBidIncrement) {
                    revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
                }
                auction.lastBidPrice += _bidAmount;
            } else {
                if (
                    _bidAmount <
                    auction.lastBidPrice + auction.minimumBidIncrement
                ) {
                    revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
                }

                address previousBidder = auction.lastBidder;
                uint256 previousBidPrice = auction.lastBidPrice;

                auction.lastBidder = msg.sender;
                auction.lastBidPrice = _bidAmount;

                _transferAVAX(previousBidder, previousBidPrice);
            }
        }
    }

    function _executeDutchAuction(
        address _collection,
        uint256 _tokenId,
        uint256 _avaxAmount
    ) private {
        DutchAuction memory auction = dutchAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }

        // Get auction sale price
        uint256 salePrice = getDutchAuctionSalePrice(_collection, _tokenId);
        if (_avaxAmount < salePrice) {
            revert JoepegAuctionHouse__DutchAuctionInsufficientAVAX();
        }

        _clearDutchAuction(_collection, _tokenId);

        _transferFeesAndFunds(
            _collection,
            _tokenId,
            auction.creator,
            salePrice
        );

        IERC721(_collection).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );

        if (_avaxAmount > salePrice) {
            _transferAVAX(msg.sender, _avaxAmount - salePrice);
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

    function _clearEnglishAuction(address _collection, uint256 _tokenId)
        private
    {
        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: address(0),
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: 0,
            startPrice: 0,
            minimumBidIncrement: 0
        });
    }

    function _clearDutchAuction(address _collection, uint256 _tokenId) private {
        dutchAuctions[_collection][_tokenId] = DutchAuction({
            creator: address(0),
            startPrice: 0,
            endPrice: 0,
            startTime: 0,
            endTime: 0
        });
    }

    function _transferAVAX(address _to, uint256 _amount) private {
        (bool sent, ) = _to.call{value: _amount}("");
        if (!sent) {
            revert JoepegAuctionHouse__TransferAVAXFailed();
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
