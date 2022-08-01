// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import {ICurrencyManager} from "./interfaces/ICurrencyManager.sol";
import {IProtocolFeeManager} from "./interfaces/IProtocolFeeManager.sol";
import {IRoyaltyFeeManager} from "./interfaces/IRoyaltyFeeManager.sol";
import {IWAVAX} from "./interfaces/IWAVAX.sol";

error JoepegAuctionHouse__AuctionAlreadyExists();
error JoepegAuctionHouse__CurrencyMismatch();
error JoepegAuctionHouse__ExpectedNonnullAddress();
error JoepegAuctionHouse__InvalidDuration();
error JoepegAuctionHouse__NoAuctionExists();
error JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
error JoepegAuctionHouse__TransferAVAXFailed();
error JoepegAuctionHouse__UnsupportedCurrency();

error JoepegAuctionHouse__EnglishAuctionCannotBidOnEndedAuction();
error JoepegAuctionHouse__EnglishAuctionCannotCancelWithExistingBid();
error JoepegAuctionHouse__EnglishAuctionCannotSettleWithoutBid();
error JoepegAuctionHouse__EnglishAuctionCreatorCannotPlaceBid();
error JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
error JoepegAuctionHouse__EnglishAuctionInvalidMinBidIncrementPct();
error JoepegAuctionHouse__EnglishAuctionInvalidRefreshTime();
error JoepegAuctionHouse__EnglishAuctionOnlyCreatorCanSettleBeforeEndTime();

error JoepegAuctionHouse__DutchAuctionCreatorCannotSettle();
error JoepegAuctionHouse__DutchAuctionInsufficientAmountToSettle();
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
        address currency;
        uint256 startPrice;
        uint256 endPrice;
        uint256 startTime;
        uint256 endTime;
        uint256 dropInterval;
    }

    struct EnglishAuction {
        address creator;
        address currency;
        address lastBidder;
        uint256 lastBidPrice;
        uint256 endTime;
        uint256 startPrice;
    }

    uint256 public immutable PERCENTAGE_PRECISION = 10000;

    address public WAVAX;
    ICurrencyManager public currencyManager;
    IProtocolFeeManager public protocolFeeManager;
    IRoyaltyFeeManager public royaltyFeeManager;

    address public protocolFeeRecipient;

    mapping(address => mapping(uint256 => DutchAuction)) public dutchAuctions;
    mapping(address => mapping(uint256 => EnglishAuction))
        public englishAuctions;

    uint256 public englishAuctionMinBidIncrementPct;
    uint256 public englishAuctionRefreshTime;

    event NewCurrencyManager(address indexed currencyManager);
    event NewProtocolFeeManager(address indexed protocolFeeManager);
    event NewProtocolFeeRecipient(address indexed protocolFeeRecipient);
    event NewRoyaltyFeeManager(address indexed royaltyFeeManager);

    event NewEnglishAuctionMinBidIncrementPct(
        uint256 englishAuctionMinBidIncrementPct
    );
    event NewEnglishAuctionRefreshTime(uint256 englishAuctionRefreshTime);

    modifier isSupportedCurrency(address _currency) {
        if (!currencyManager.isCurrencyWhitelisted(_currency)) {
            revert JoepegAuctionHouse__UnsupportedCurrency();
        } else {
            _;
        }
    }

    function initialize(
        uint256 _englishAuctionMinBidIncrementPct,
        uint256 _englishAuctionRefreshTime,
        address _currencyManager,
        address _protocolFeeManager,
        address _royaltyFeeManager,
        address _wavax,
        address _protocolFeeRecipient
    ) public initializer {
        if (_englishAuctionMinBidIncrementPct > PERCENTAGE_PRECISION) {
            revert JoepegAuctionHouse__EnglishAuctionInvalidMinBidIncrementPct();
        }

        __Ownable_init();

        englishAuctionMinBidIncrementPct = _englishAuctionMinBidIncrementPct;
        englishAuctionRefreshTime = _englishAuctionRefreshTime;
        currencyManager = ICurrencyManager(_currencyManager);
        protocolFeeManager = IProtocolFeeManager(_protocolFeeManager);
        royaltyFeeManager = IRoyaltyFeeManager(_royaltyFeeManager);
        protocolFeeRecipient = _protocolFeeRecipient;
        WAVAX = _wavax;
    }

    /// @notice Starts an English Auction for an ERC721 token
    /// @dev Note this requires the auction house to hold the ERC721 token in escrow
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to sell ERC721 token for
    /// @param _duration number of seconds for English Auction to run
    /// @param _startPrice minimum starting bid price
    function startEnglishAuction(
        address _collection,
        uint256 _tokenId,
        address _currency,
        uint256 _duration,
        uint256 _startPrice
    ) public isSupportedCurrency(_currency) {
        if (_duration == 0) {
            revert JoepegAuctionHouse__InvalidDuration();
        }
        if (englishAuctions[_collection][_tokenId].creator != address(0)) {
            revert JoepegAuctionHouse__AuctionAlreadyExists();
        }

        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: msg.sender,
            currency: _currency,
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: block.timestamp + _duration,
            startPrice: _startPrice
        });

        // Hold ERC721 token in escrow
        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    /// @notice Place bid on a running English Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to bid
    /// @param _amount amount of currency to bid
    function placeEnglishAuctionBid(
        address _collection,
        uint256 _tokenId,
        address _currency,
        uint256 _amount
    ) public nonReentrant {
        IERC20(_currency).safeTransferFrom(msg.sender, address(this), _amount);
        _placeEnglishAuctionBid(_collection, _tokenId, _currency, _amount);
    }

    /// @notice Place bid on a running English Auction using AVAX/WAVAX
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _wavaxAmount amount of WAVAX to bid
    function placeEnglishAuctionBidWithAVAXAndWAVAX(
        address _collection,
        uint256 _tokenId,
        uint256 _wavaxAmount
    ) public payable nonReentrant {
        if (msg.value > 0) {
            // Wrap AVAX into WAVAX
            IWAVAX(WAVAX).deposit{value: msg.value}();
        }
        if (_wavaxAmount > 0) {
            IERC20(WAVAX).safeTransferFrom(
                msg.sender,
                address(this),
                _wavaxAmount
            );
        }
        _placeEnglishAuctionBid(
            _collection,
            _tokenId,
            WAVAX,
            msg.value + _wavaxAmount
        );
    }

    /// @notice Settles an English Auction
    /// @dev Note:
    /// - Can be called by creator at any time (including before the auction's end time to accept the
    ///   current latest bid)
    /// - Can be called by anyone after the auction ends
    /// - Transfers funds and fees appropriately to seller, royalty receiver, and protocol fee recipient
    /// - Transfers ERC721 token to last highest bidder
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function settleEnglishAuction(address _collection, uint256 _tokenId)
        public
    {
        EnglishAuction memory auction = englishAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (auction.lastBidPrice == 0) {
            revert JoepegAuctionHouse__EnglishAuctionCannotSettleWithoutBid();
        }
        if (
            msg.sender != auction.creator && block.timestamp < auction.endTime
        ) {
            revert JoepegAuctionHouse__EnglishAuctionOnlyCreatorCanSettleBeforeEndTime();
        }

        _clearEnglishAuction(_collection, _tokenId);

        // Settle auction using latest bid
        if (auction.currency == WAVAX) {
            _transferFeesAndFundsWithWAVAX(
                _collection,
                _tokenId,
                auction.creator,
                auction.lastBidPrice
            );
        } else {
            _transferFeesAndFunds(
                _collection,
                _tokenId,
                auction.currency,
                address(this),
                auction.creator,
                auction.lastBidPrice
            );
        }

        IERC721(_collection).safeTransferFrom(
            address(this),
            auction.lastBidder,
            _tokenId
        );
    }

    /// @notice Cancels an English Auction
    /// @dev Note:
    /// - Can only be called by auction creator
    /// - Can only be cancelled if no bids have been placed
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
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

    /// @notice Starts a Dutch Auction for an ERC721 token
    /// @dev Note:
    /// - Requires the auction house to hold the ERC721 token in escrow
    /// - Drops in price every `dutchAuctionDropInterval` seconds in equal
    ///   amounts
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to sell ERC721 token for
    /// @param _duration number of seconds for Dutch Auction to run
    /// @param _dropInterval number of seconds between each drop in price
    /// @param _startPrice starting sell price
    /// @param _endPrice ending sell price
    function startDutchAuction(
        address _collection,
        uint256 _tokenId,
        address _currency,
        uint256 _duration,
        uint256 _dropInterval,
        uint256 _startPrice,
        uint256 _endPrice
    ) public isSupportedCurrency(_currency) {
        if (_duration == 0 || _duration < _dropInterval) {
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
            currency: _currency,
            startPrice: _startPrice,
            endPrice: _endPrice,
            startTime: block.timestamp,
            endTime: block.timestamp + _duration,
            dropInterval: _dropInterval
        });

        IERC721(_collection).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );
    }

    /// @notice Settles a Dutch Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to buy ERC721 token with
    function settleDutchAuction(
        address _collection,
        uint256 _tokenId,
        address _currency
    ) public {
        _settleDutchAuction(_collection, _tokenId, _currency);
    }

    /// @notice Settles a Dutch Auction with AVAX and/or WAVAX
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function settleDutchAuctionWithAVAXAndWAVAX(
        address _collection,
        uint256 _tokenId
    ) public payable {
        _settleDutchAuction(_collection, _tokenId, WAVAX);
    }

    /// @notice Calculates current Dutch Auction sale price for an ERC721 token
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @return current Dutch Auction sale price for specified ERC721 token
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
        uint256 elapsedSteps = timeElapsed / auction.dropInterval;
        uint256 totalPossibleSteps = (auction.endTime - auction.startTime) /
            auction.dropInterval;

        uint256 priceDifference = auction.startPrice - auction.endPrice;
        uint256 priceDropPerStep = priceDifference / totalPossibleSteps;

        return auction.startPrice - elapsedSteps * priceDropPerStep;
    }

    /// @notice Cancels a running Dutch Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
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

    /// @notice Update `englishAuctionMinBidIncrementPct`
    /// @param _englishAuctionMinBidIncrementPct new minimum bid increment percetange for English auctions
    function updateEnglishAuctionMinBidIncrementPct(
        uint256 _englishAuctionMinBidIncrementPct
    ) external onlyOwner {
        if (_englishAuctionMinBidIncrementPct > PERCENTAGE_PRECISION) {
            revert JoepegAuctionHouse__EnglishAuctionInvalidMinBidIncrementPct();
        }

        englishAuctionMinBidIncrementPct = _englishAuctionMinBidIncrementPct;
        emit NewEnglishAuctionMinBidIncrementPct(
            _englishAuctionMinBidIncrementPct
        );
    }

    /// @notice Update `englishAuctionRefreshTime`
    /// @param _englishAuctionRefreshTime new refresh time for English auctions
    function updateEnglishAuctionRefreshTime(uint256 _englishAuctionRefreshTime)
        external
        onlyOwner
    {
        englishAuctionRefreshTime = _englishAuctionRefreshTime;
        emit NewEnglishAuctionRefreshTime(englishAuctionRefreshTime);
    }

    /// @notice Update currency manager
    /// @param _currencyManager new currency manager address
    function updateCurrencyManager(address _currencyManager)
        external
        onlyOwner
    {
        if (_currencyManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonnullAddress();
        }
        currencyManager = ICurrencyManager(_currencyManager);
        emit NewCurrencyManager(_currencyManager);
    }

    /// @notice Update protocol fee manager
    /// @param _protocolFeeManager new protocol fee manager address
    function updateProtocolFeeManager(address _protocolFeeManager)
        external
        onlyOwner
    {
        if (_protocolFeeManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonnullAddress();
        }
        protocolFeeManager = IProtocolFeeManager(_protocolFeeManager);
        emit NewProtocolFeeManager(_protocolFeeManager);
    }

    /// @notice Update protocol fee recipient
    /// @param _protocolFeeRecipient new recipient for protocol fees
    function updateProtocolFeeRecipient(address _protocolFeeRecipient)
        external
        onlyOwner
    {
        protocolFeeRecipient = _protocolFeeRecipient;
        emit NewProtocolFeeRecipient(_protocolFeeRecipient);
    }

    /// @notice Update royalty fee manager
    /// @param _royaltyFeeManager new fee manager address
    function updateRoyaltyFeeManager(address _royaltyFeeManager)
        external
        onlyOwner
    {
        if (_royaltyFeeManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonnullAddress();
        }
        royaltyFeeManager = IRoyaltyFeeManager(_royaltyFeeManager);
        emit NewRoyaltyFeeManager(_royaltyFeeManager);
    }

    /// @notice Place bid on a running English Auction
    /// @dev Note:
    /// - Requires holding the bid in escrow until either a higher bid is placed
    ///   or the auction is settled
    /// - If a bid already exists, only bids at least `englishAuctionMinBidIncrementPct`
    ///   percent higher can be placed
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to bid
    /// @param _bidAmount amount of currency to bid
    function _placeEnglishAuctionBid(
        address _collection,
        uint256 _tokenId,
        address _currency,
        uint256 _bidAmount
    ) private {
        EnglishAuction storage auction = englishAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (auction.currency != _currency) {
            revert JoepegAuctionHouse__CurrencyMismatch();
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
                // If bidder is same as last bidder, ensure their bid is at least
                // `englishAuctionMinBidIncrementPct` percent of their previous bid
                if (
                    _bidAmount * PERCENTAGE_PRECISION >=
                    auction.lastBidPrice * englishAuctionMinBidIncrementPct
                ) {
                    revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
                }
                auction.lastBidPrice += _bidAmount;
            } else {
                // Ensure bid is at least `englishAuctionMinBidIncrementPct` percent greater
                // than last bid
                if (
                    _bidAmount * PERCENTAGE_PRECISION >=
                    auction.lastBidPrice *
                        (PERCENTAGE_PRECISION +
                            englishAuctionMinBidIncrementPct)
                ) {
                    revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
                }

                address previousBidder = auction.lastBidder;
                uint256 previousBidPrice = auction.lastBidPrice;

                auction.lastBidder = msg.sender;
                auction.lastBidPrice = _bidAmount;

                // Transfer previous bid back to bidder
                IERC20(_currency).safeTransfer(
                    previousBidder,
                    previousBidPrice
                );
            }
        }
    }

    /// @notice Settles a Dutch Auction
    /// @dev Note:
    /// - Transfers funds and fees appropriately to seller, royalty receiver, and protocol fee recipient
    /// - Transfers ERC721 token to buyer
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to buy ERC721 token with
    function _settleDutchAuction(
        address _collection,
        uint256 _tokenId,
        address _currency
    ) private {
        DutchAuction memory auction = dutchAuctions[_collection][_tokenId];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (msg.sender == auction.creator) {
            revert JoepegAuctionHouse__DutchAuctionCreatorCannotSettle();
        }
        if (auction.currency != _currency) {
            revert JoepegAuctionHouse__CurrencyMismatch();
        }

        // Get auction sale price
        uint256 salePrice = getDutchAuctionSalePrice(_collection, _tokenId);

        _clearDutchAuction(_collection, _tokenId);

        if (_currency == WAVAX) {
            uint256 avaxAmountToWrap;
            if (salePrice > msg.value) {
                avaxAmountToWrap = msg.value;
                IERC20(WAVAX).safeTransferFrom(
                    msg.sender,
                    address(this),
                    salePrice - msg.value
                );
            } else if (salePrice == msg.value) {
                avaxAmountToWrap = msg.value;
            } else {
                avaxAmountToWrap = salePrice;
                _transferAVAX(msg.sender, msg.value - salePrice);
            }

            // Wrap AVAX if needed
            if (avaxAmountToWrap > 0) {
                IWAVAX(WAVAX).deposit{value: avaxAmountToWrap}();
            }

            _transferFeesAndFundsWithWAVAX(
                _collection,
                _tokenId,
                auction.creator,
                salePrice
            );
        } else {
            _transferFeesAndFunds(
                _collection,
                _tokenId,
                _currency,
                msg.sender,
                auction.creator,
                salePrice
            );
        }

        IERC721(_collection).safeTransferFrom(
            address(this),
            msg.sender,
            _tokenId
        );
    }

    /// @notice Transfer fees and funds to royalty recipient, protocol, and seller
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of token being used for the purchase (e.g. USDC)
    /// @param _from sender of the funds
    /// @param _to seller's recipient
    /// @param _amount amount being transferred (in currency)
    function _transferFeesAndFunds(
        address _collection,
        uint256 _tokenId,
        address _currency,
        address _from,
        address _to,
        uint256 _amount
    ) private {
        // Initialize the final amount that is transferred to seller
        uint256 finalSellerAmount = _amount;

        // 1. Protocol fee
        {
            uint256 protocolFeeAmount = _calculateProtocolFee(
                _collection,
                _amount
            );

            // Check if the protocol fee is different than 0 for this strategy
            if (
                (protocolFeeRecipient != address(0)) && (protocolFeeAmount != 0)
            ) {
                IERC20(_currency).safeTransferFrom(
                    _from,
                    protocolFeeRecipient,
                    protocolFeeAmount
                );
                finalSellerAmount -= protocolFeeAmount;
            }
        }

        // 2. Royalty fee
        {
            (
                address royaltyFeeRecipient,
                uint256 royaltyFeeAmount
            ) = royaltyFeeManager.calculateRoyaltyFeeAndGetRecipient(
                    _collection,
                    _tokenId,
                    _amount
                );

            // Check if there is a royalty fee and that it is different to 0
            if (
                (royaltyFeeRecipient != address(0)) && (royaltyFeeAmount != 0)
            ) {
                IERC20(_currency).safeTransferFrom(
                    _from,
                    royaltyFeeRecipient,
                    royaltyFeeAmount
                );
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
            IERC20(_currency).safeTransferFrom(_from, _to, finalSellerAmount);
        }
    }

    /// @notice Transfer fees and funds in AVAX using WAVAX to royalty recipient,
    /// protocol, and seller
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _to seller's recipient
    /// @param _amount amount of WAVAX being transferred
    function _transferFeesAndFundsWithWAVAX(
        address _collection,
        uint256 _tokenId,
        address _to,
        uint256 _amount
    ) private {
        // Unwrap WAVAX
        IWAVAX(WAVAX).withdraw(_amount);

        // Initialize the final amount that is transferred to seller
        uint256 finalSellerAmount = _amount;

        // 1. Protocol fee
        {
            uint256 protocolFeeAmount = _calculateProtocolFee(
                _collection,
                _amount
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
                    _collection,
                    _tokenId,
                    _amount
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
            _transferAVAX(_to, finalSellerAmount);
        }
    }

    /// @notice Clears English Auction data for a given NFT
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function _clearEnglishAuction(address _collection, uint256 _tokenId)
        private
    {
        englishAuctions[_collection][_tokenId] = EnglishAuction({
            creator: address(0),
            currency: address(0),
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: 0,
            startPrice: 0
        });
    }

    /// @notice Clears Dutch Auction data for a given NFT
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function _clearDutchAuction(address _collection, uint256 _tokenId) private {
        dutchAuctions[_collection][_tokenId] = DutchAuction({
            creator: address(0),
            currency: address(0),
            startPrice: 0,
            endPrice: 0,
            startTime: 0,
            endTime: 0,
            dropInterval: 0
        });
    }

    /// @notice Transfer AVAX to specified address
    /// @param _to address to send AVAX to
    /// @param _amount amount of AVAX to send
    function _transferAVAX(address _to, uint256 _amount) private {
        (bool sent, ) = _to.call{value: _amount}("");
        if (!sent) {
            revert JoepegAuctionHouse__TransferAVAXFailed();
        }
    }

    /// @notice Calculate protocol fee for a given collection
    /// @param _collection address of collection
    /// @param _amount amount to transfer
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
