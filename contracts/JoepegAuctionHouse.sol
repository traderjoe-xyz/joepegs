// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
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
error JoepegAuctionHouse__ExpectedNonNullAddress();
error JoepegAuctionHouse__ExpectedNonZeroFinalSellerAmount();
error JoepegAuctionHouse__InvalidDuration();
error JoepegAuctionHouse__NoAuctionExists();
error JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
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
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    struct DutchAuction {
        address creator;
        uint96 startTime;
        address currency;
        uint96 endTime;
        uint256 startPrice;
        uint256 endPrice;
        uint256 dropInterval;
    }

    struct EnglishAuction {
        address creator;
        address currency;
        address lastBidder;
        uint96 endTime;
        uint256 lastBidPrice;
        uint256 startPrice;
    }

    uint256 public constant PERCENTAGE_PRECISION = 10000;

    address public immutable WAVAX;

    ICurrencyManager public currencyManager;
    IProtocolFeeManager public protocolFeeManager;
    IRoyaltyFeeManager public royaltyFeeManager;

    address public protocolFeeRecipient;

    /// @notice Stores Dutch Auction data for NFTs
    /// @dev (collection address => token id => dutch auction)
    mapping(address => mapping(uint256 => DutchAuction)) public dutchAuctions;

    /// @notice Stores English Auction data for NFTs
    /// @dev (collection address => token id => english auction)
    mapping(address => mapping(uint256 => EnglishAuction))
        public englishAuctions;

    /// @notice Required minimum percent increase from last bid in order to
    /// place a new bid on an English Auction
    uint256 public englishAuctionMinBidIncrementPct;

    /// @notice Represents both:
    /// - Number of seconds before an English Auction ends where any new
    ///   bid will extend the auction's end time
    /// - Number of seconds to extend an English Auction's end time by
    uint96 public englishAuctionRefreshTime;

    event DutchAuctionStart(
        address indexed creator,
        address currency,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 startPrice,
        uint256 endPrice,
        uint96 startTime,
        uint96 endTime,
        uint256 dropInterval
    );
    event DutchAuctionSettle(
        address indexed creator,
        address indexed buyer,
        address indexed currency,
        address collection,
        uint256 tokenId,
        uint256 price
    );
    event DutchAuctionCancel(
        address indexed creator,
        address indexed collection,
        uint256 indexed tokenId
    );

    event EnglishAuctionStart(
        address indexed creator,
        address currency,
        address indexed collection,
        uint256 indexed tokenId,
        uint256 startPrice,
        uint96 startTime,
        uint96 endTime
    );
    event EnglishAuctionPlaceBid(
        address indexed creator,
        address indexed bidder,
        address indexed currency,
        address collection,
        uint256 tokenId,
        uint256 bidAmount,
        uint96 endTime
    );
    event EnglishAuctionSettle(
        address indexed creator,
        address indexed bidder,
        address indexed currency,
        address collection,
        uint256 tokenId,
        uint256 price
    );
    event EnglishAuctionCancel(
        address indexed creator,
        address indexed collection,
        uint256 indexed tokenId
    );

    event CurrencyManagerSet(
        address indexed oldCurrencyManager,
        address indexed newCurrencyManager
    );
    event EnglishAuctionMinBidIncrementPctSet(
        uint256 oldEnglishAuctionMinBidIncrementPct,
        uint256 newEnglishAuctionMinBidIncrementPct
    );
    event EnglishAuctionRefreshTimeSet(
        uint96 oldEnglishAuctionRefreshTime,
        uint96 newEnglishAuctionRefreshTime
    );
    event ProtocolFeeManagerSet(
        address indexed oldProtocolFeeManager,
        address indexed newProtocolFeeManager
    );
    event ProtocolFeeRecipientSet(
        address indexed oldProtocolFeeRecipient,
        address indexed newProtocolFeeRecipient
    );
    event RoyaltyFeeManagerSet(
        address indexed oldRoyaltyFeeManager,
        address indexed newRoyaltyFeeManager
    );

    event RoyaltyPayment(
        address indexed collection,
        uint256 indexed tokenId,
        address indexed royaltyRecipient,
        address currency,
        uint256 amount
    );

    modifier isSupportedCurrency(IERC20 _currency) {
        if (!currencyManager.isCurrencyWhitelisted(address(_currency))) {
            revert JoepegAuctionHouse__UnsupportedCurrency();
        } else {
            _;
        }
    }

    ///  @notice Constructor
    ///  @param _wavax address of WAVAX
    constructor(address _wavax) {
        WAVAX = _wavax;
    }

    ///  @notice Initializer
    ///  @param _englishAuctionMinBidIncrementPct minimum bid increment percentage for English Auctions
    ///  @param _englishAuctionRefreshTime refresh time for English auctions
    ///  @param _currencyManager currency manager address
    ///  @param _protocolFeeManager protocol fee manager address
    ///  @param _royaltyFeeManager royalty fee manager address
    ///  @param _protocolFeeRecipient protocol fee recipient
    function initialize(
        uint256 _englishAuctionMinBidIncrementPct,
        uint96 _englishAuctionRefreshTime,
        address _currencyManager,
        address _protocolFeeManager,
        address _royaltyFeeManager,
        address _protocolFeeRecipient
    ) public initializer {
        __Ownable_init();
        __ReentrancyGuard_init();

        _updateEnglishAuctionMinBidIncrementPct(
            _englishAuctionMinBidIncrementPct
        );
        _updateEnglishAuctionRefreshTime(_englishAuctionRefreshTime);
        _updateCurrencyManager(_currencyManager);
        _updateProtocolFeeManager(_protocolFeeManager);
        _updateRoyaltyFeeManager(_royaltyFeeManager);
        _updateProtocolFeeRecipient(_protocolFeeRecipient);
    }

    /// @notice Starts an English Auction for an ERC721 token
    /// @dev Note this requires the auction house to hold the ERC721 token in escrow
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _currency address of currency to sell ERC721 token for
    /// @param _duration number of seconds for English Auction to run
    /// @param _startPrice minimum starting bid price
    function startEnglishAuction(
        IERC721 _collection,
        uint256 _tokenId,
        IERC20 _currency,
        uint96 _duration,
        uint256 _startPrice
    ) external isSupportedCurrency(_currency) nonReentrant {
        if (_duration == 0) {
            revert JoepegAuctionHouse__InvalidDuration();
        }
        address collectionAddress = address(_collection);
        if (
            englishAuctions[collectionAddress][_tokenId].creator != address(0)
        ) {
            revert JoepegAuctionHouse__AuctionAlreadyExists();
        }

        uint96 timestamp = block.timestamp.toUint96();
        EnglishAuction memory auction = EnglishAuction({
            creator: msg.sender,
            currency: address(_currency),
            lastBidder: address(0),
            lastBidPrice: 0,
            endTime: timestamp + _duration,
            startPrice: _startPrice
        });
        englishAuctions[collectionAddress][_tokenId] = auction;

        // Hold ERC721 token in escrow
        _collection.safeTransferFrom(msg.sender, address(this), _tokenId);

        emit EnglishAuctionStart(
            auction.creator,
            auction.currency,
            collectionAddress,
            _tokenId,
            auction.startPrice,
            timestamp,
            auction.endTime
        );
    }

    /// @notice Place bid on a running English Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _amount amount of currency to bid
    function placeEnglishAuctionBid(
        IERC721 _collection,
        uint256 _tokenId,
        uint256 _amount
    ) external nonReentrant {
        EnglishAuction memory auction = englishAuctions[address(_collection)][
            _tokenId
        ];
        address currency = auction.currency;
        if (currency == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }

        IERC20(currency).safeTransferFrom(msg.sender, address(this), _amount);
        _placeEnglishAuctionBid(_collection, _tokenId, _amount, auction);
    }

    /// @notice Place bid on a running English Auction using AVAX and/or WAVAX
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _wavaxAmount amount of WAVAX to bid
    function placeEnglishAuctionBidWithAVAXAndWAVAX(
        IERC721 _collection,
        uint256 _tokenId,
        uint256 _wavaxAmount
    ) external payable nonReentrant {
        EnglishAuction memory auction = englishAuctions[address(_collection)][
            _tokenId
        ];
        address currency = auction.currency;
        if (currency != WAVAX) {
            revert JoepegAuctionHouse__CurrencyMismatch();
        }

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
            msg.value + _wavaxAmount,
            auction
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
    function settleEnglishAuction(IERC721 _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        address collectionAddress = address(_collection);
        EnglishAuction memory auction = englishAuctions[collectionAddress][
            _tokenId
        ];
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

        delete englishAuctions[collectionAddress][_tokenId];

        // Settle auction using latest bid
        if (auction.currency == WAVAX) {
            _transferFeesAndFundsWithWAVAX(
                collectionAddress,
                _tokenId,
                auction.creator,
                auction.lastBidPrice
            );
        } else {
            _transferFeesAndFunds(
                collectionAddress,
                _tokenId,
                IERC20(auction.currency),
                address(this),
                auction.creator,
                auction.lastBidPrice
            );
        }

        _collection.safeTransferFrom(
            address(this),
            auction.lastBidder,
            _tokenId
        );

        emit EnglishAuctionSettle(
            auction.creator,
            auction.lastBidder,
            auction.currency,
            collectionAddress,
            _tokenId,
            auction.lastBidPrice
        );
    }

    /// @notice Cancels an English Auction
    /// @dev Note:
    /// - Can only be called by auction creator
    /// - Can only be cancelled if no bids have been placed
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function cancelEnglishAuction(IERC721 _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        address collectionAddress = address(_collection);
        EnglishAuction memory auction = englishAuctions[collectionAddress][
            _tokenId
        ];
        if (msg.sender != auction.creator) {
            revert JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
        }
        if (auction.lastBidder != address(0)) {
            revert JoepegAuctionHouse__EnglishAuctionCannotCancelWithExistingBid();
        }

        delete englishAuctions[collectionAddress][_tokenId];

        _collection.safeTransferFrom(address(this), auction.creator, _tokenId);

        emit EnglishAuctionCancel(auction.creator, collectionAddress, _tokenId);
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
        IERC721 _collection,
        uint256 _tokenId,
        IERC20 _currency,
        uint96 _duration,
        uint256 _dropInterval,
        uint256 _startPrice,
        uint256 _endPrice
    ) external isSupportedCurrency(_currency) nonReentrant {
        if (_duration == 0 || _duration < _dropInterval) {
            revert JoepegAuctionHouse__InvalidDuration();
        }
        address collectionAddress = address(_collection);
        if (dutchAuctions[collectionAddress][_tokenId].creator != address(0)) {
            revert JoepegAuctionHouse__AuctionAlreadyExists();
        }
        if (_startPrice <= _endPrice || _endPrice == 0) {
            revert JoepegAuctionHouse__DutchAuctionInvalidStartEndPrice();
        }

        uint96 timestamp = block.timestamp.toUint96();
        DutchAuction memory auction = DutchAuction({
            creator: msg.sender,
            currency: address(_currency),
            startPrice: _startPrice,
            endPrice: _endPrice,
            startTime: timestamp,
            endTime: timestamp + _duration,
            dropInterval: _dropInterval
        });
        dutchAuctions[collectionAddress][_tokenId] = auction;

        _collection.safeTransferFrom(msg.sender, address(this), _tokenId);

        emit DutchAuctionStart(
            auction.creator,
            auction.currency,
            collectionAddress,
            _tokenId,
            auction.startPrice,
            auction.endPrice,
            auction.startTime,
            auction.endTime,
            auction.dropInterval
        );
    }

    /// @notice Settles a Dutch Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function settleDutchAuction(IERC721 _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        _settleDutchAuction(_collection, _tokenId);
    }

    /// @notice Settles a Dutch Auction with AVAX and/or WAVAX
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function settleDutchAuctionWithAVAXAndWAVAX(
        IERC721 _collection,
        uint256 _tokenId
    ) external payable nonReentrant {
        _settleDutchAuction(_collection, _tokenId);
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

        return
            auction.startPrice -
            (elapsedSteps * priceDifference) /
            totalPossibleSteps;
    }

    /// @notice Cancels a running Dutch Auction
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function cancelDutchAuction(IERC721 _collection, uint256 _tokenId)
        external
        nonReentrant
    {
        address collectionAddress = address(_collection);
        DutchAuction memory auction = dutchAuctions[collectionAddress][
            _tokenId
        ];
        if (msg.sender != auction.creator) {
            revert JoepegAuctionHouse__OnlyAuctionCreatorCanCancel();
        }

        delete dutchAuctions[collectionAddress][_tokenId];

        _collection.safeTransferFrom(address(this), auction.creator, _tokenId);

        emit DutchAuctionCancel(auction.creator, collectionAddress, _tokenId);
    }

    /// @notice Update `englishAuctionMinBidIncrementPct`
    /// @param _englishAuctionMinBidIncrementPct new minimum bid increment percetange for English auctions
    function updateEnglishAuctionMinBidIncrementPct(
        uint256 _englishAuctionMinBidIncrementPct
    ) external onlyOwner {
        _updateEnglishAuctionMinBidIncrementPct(
            _englishAuctionMinBidIncrementPct
        );
    }

    /// @notice Update `englishAuctionMinBidIncrementPct`
    /// @param _englishAuctionMinBidIncrementPct new minimum bid increment percetange for English auctions
    function _updateEnglishAuctionMinBidIncrementPct(
        uint256 _englishAuctionMinBidIncrementPct
    ) private {
        if (
            _englishAuctionMinBidIncrementPct == 0 ||
            _englishAuctionMinBidIncrementPct > PERCENTAGE_PRECISION
        ) {
            revert JoepegAuctionHouse__EnglishAuctionInvalidMinBidIncrementPct();
        }

        uint256 oldEnglishAuctionMinBidIncrementPct = englishAuctionMinBidIncrementPct;
        englishAuctionMinBidIncrementPct = _englishAuctionMinBidIncrementPct;
        emit EnglishAuctionMinBidIncrementPctSet(
            oldEnglishAuctionMinBidIncrementPct,
            _englishAuctionMinBidIncrementPct
        );
    }

    /// @notice Update `englishAuctionRefreshTime`
    /// @param _englishAuctionRefreshTime new refresh time for English auctions
    function updateEnglishAuctionRefreshTime(uint96 _englishAuctionRefreshTime)
        external
        onlyOwner
    {
        _updateEnglishAuctionRefreshTime(_englishAuctionRefreshTime);
    }

    /// @notice Update `englishAuctionRefreshTime`
    /// @param _englishAuctionRefreshTime new refresh time for English auctions
    function _updateEnglishAuctionRefreshTime(uint96 _englishAuctionRefreshTime)
        private
    {
        if (englishAuctionRefreshTime == 0) {
            revert JoepegAuctionHouse__EnglishAuctionInvalidRefreshTime();
        }
        uint96 oldEnglishAuctionRefreshTime = englishAuctionRefreshTime;
        englishAuctionRefreshTime = _englishAuctionRefreshTime;
        emit EnglishAuctionRefreshTimeSet(
            oldEnglishAuctionRefreshTime,
            englishAuctionRefreshTime
        );
    }

    /// @notice Update currency manager
    /// @param _currencyManager new currency manager address
    function updateCurrencyManager(address _currencyManager)
        external
        onlyOwner
    {
        _updateCurrencyManager(_currencyManager);
    }

    /// @notice Update currency manager
    /// @param _currencyManager new currency manager address
    function _updateCurrencyManager(address _currencyManager) private {
        if (_currencyManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonNullAddress();
        }
        address oldCurrencyManagerAddress = address(currencyManager);
        currencyManager = ICurrencyManager(_currencyManager);
        emit CurrencyManagerSet(oldCurrencyManagerAddress, _currencyManager);
    }

    /// @notice Update protocol fee manager
    /// @param _protocolFeeManager new protocol fee manager address
    function updateProtocolFeeManager(address _protocolFeeManager)
        external
        onlyOwner
    {
        _updateProtocolFeeManager(_protocolFeeManager);
    }

    /// @notice Update protocol fee manager
    /// @param _protocolFeeManager new protocol fee manager address
    function _updateProtocolFeeManager(address _protocolFeeManager) private {
        if (_protocolFeeManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonNullAddress();
        }
        address oldProtocolFeeManagerAddress = address(protocolFeeManager);
        protocolFeeManager = IProtocolFeeManager(_protocolFeeManager);
        emit ProtocolFeeManagerSet(
            oldProtocolFeeManagerAddress,
            _protocolFeeManager
        );
    }

    /// @notice Update protocol fee recipient
    /// @param _protocolFeeRecipient new recipient for protocol fees
    function updateProtocolFeeRecipient(address _protocolFeeRecipient)
        external
        onlyOwner
    {
        _updateProtocolFeeRecipient(_protocolFeeRecipient);
    }

    /// @notice Update protocol fee recipient
    /// @param _protocolFeeRecipient new recipient for protocol fees
    function _updateProtocolFeeRecipient(address _protocolFeeRecipient)
        private
    {
        address oldProtocolFeeRecipient = protocolFeeRecipient;
        protocolFeeRecipient = _protocolFeeRecipient;
        emit ProtocolFeeRecipientSet(
            oldProtocolFeeRecipient,
            _protocolFeeRecipient
        );
    }

    /// @notice Update royalty fee manager
    /// @param _royaltyFeeManager new fee manager address
    function updateRoyaltyFeeManager(address _royaltyFeeManager)
        external
        onlyOwner
    {
        _updateRoyaltyFeeManager(_royaltyFeeManager);
    }

    /// @notice Update royalty fee manager
    /// @param _royaltyFeeManager new fee manager address
    function _updateRoyaltyFeeManager(address _royaltyFeeManager) private {
        if (_royaltyFeeManager == address(0)) {
            revert JoepegAuctionHouse__ExpectedNonNullAddress();
        }
        address oldRoyaltyFeeManagerAddress = address(royaltyFeeManager);
        royaltyFeeManager = IRoyaltyFeeManager(_royaltyFeeManager);
        emit RoyaltyFeeManagerSet(
            oldRoyaltyFeeManagerAddress,
            _royaltyFeeManager
        );
    }

    /// @notice Place bid on a running English Auction
    /// @dev Note:
    /// - Requires holding the bid in escrow until either a higher bid is placed
    ///   or the auction is settled
    /// - If a bid already exists, only bids at least `englishAuctionMinBidIncrementPct`
    ///   percent higher can be placed
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    /// @param _bidAmount amount of currency to bid
    function _placeEnglishAuctionBid(
        IERC721 _collection,
        uint256 _tokenId,
        uint256 _bidAmount,
        EnglishAuction memory auction
    ) private {
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (_bidAmount == 0) {
            revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
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
                    _bidAmount * PERCENTAGE_PRECISION <
                    auction.lastBidPrice * englishAuctionMinBidIncrementPct
                ) {
                    revert JoepegAuctionHouse__EnglishAuctionInsufficientBidAmount();
                }
                auction.lastBidPrice += _bidAmount;
            } else {
                // Ensure bid is at least `englishAuctionMinBidIncrementPct` percent greater
                // than last bid
                if (
                    _bidAmount * PERCENTAGE_PRECISION <
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
                IERC20(auction.currency).safeTransfer(
                    previousBidder,
                    previousBidPrice
                );
            }
        }

        address collectionAddress = address(_collection);
        englishAuctions[collectionAddress][_tokenId] = auction;

        emit EnglishAuctionPlaceBid(
            auction.creator,
            auction.lastBidder,
            auction.currency,
            collectionAddress,
            _tokenId,
            auction.lastBidPrice,
            auction.endTime
        );
    }

    /// @notice Settles a Dutch Auction
    /// @dev Note:
    /// - Transfers funds and fees appropriately to seller, royalty receiver, and protocol fee recipient
    /// - Transfers ERC721 token to buyer
    /// @param _collection address of ERC721 token
    /// @param _tokenId token id of ERC721 token
    function _settleDutchAuction(IERC721 _collection, uint256 _tokenId)
        private
    {
        address collectionAddress = address(_collection);
        DutchAuction memory auction = dutchAuctions[collectionAddress][
            _tokenId
        ];
        if (auction.creator == address(0)) {
            revert JoepegAuctionHouse__NoAuctionExists();
        }
        if (msg.sender == auction.creator) {
            revert JoepegAuctionHouse__DutchAuctionCreatorCannotSettle();
        }

        // Get auction sale price
        uint256 salePrice = getDutchAuctionSalePrice(
            collectionAddress,
            _tokenId
        );

        delete dutchAuctions[collectionAddress][_tokenId];

        if (auction.currency == WAVAX) {
            // Transfer WAVAX if needed
            if (salePrice > msg.value) {
                IERC20(WAVAX).safeTransferFrom(
                    msg.sender,
                    address(this),
                    salePrice - msg.value
                );
            }

            // Wrap AVAX if needed
            if (msg.value > 0) {
                IWAVAX(WAVAX).deposit{value: msg.value}();
            }

            // Refund excess AVAX if needed
            if (salePrice < msg.value) {
                IERC20(WAVAX).safeTransfer(msg.sender, msg.value - salePrice);
            }

            _transferFeesAndFundsWithWAVAX(
                collectionAddress,
                _tokenId,
                auction.creator,
                salePrice
            );
        } else {
            _transferFeesAndFunds(
                collectionAddress,
                _tokenId,
                IERC20(auction.currency),
                msg.sender,
                auction.creator,
                salePrice
            );
        }

        _collection.safeTransferFrom(address(this), msg.sender, _tokenId);

        emit DutchAuctionSettle(
            auction.creator,
            msg.sender,
            auction.currency,
            collectionAddress,
            _tokenId,
            salePrice
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
        IERC20 _currency,
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
            address _protocolFeeRecipient = protocolFeeRecipient;

            // Check if the protocol fee is different than 0 for this strategy
            if (
                (_protocolFeeRecipient != address(0)) &&
                (protocolFeeAmount != 0)
            ) {
                _currency.safeTransferFrom(
                    _from,
                    _protocolFeeRecipient,
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
                _currency.safeTransferFrom(
                    _from,
                    royaltyFeeRecipient,
                    royaltyFeeAmount
                );
                finalSellerAmount -= royaltyFeeAmount;

                emit RoyaltyPayment(
                    _collection,
                    _tokenId,
                    royaltyFeeRecipient,
                    address(_currency),
                    royaltyFeeAmount
                );
            }
        }

        if (finalSellerAmount == 0) {
            revert JoepegAuctionHouse__ExpectedNonZeroFinalSellerAmount();
        }

        // 3. Transfer final amount (post-fees) to seller
        {
            _currency.safeTransferFrom(_from, _to, finalSellerAmount);
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
        // Initialize the final amount that is transferred to seller
        uint256 finalSellerAmount = _amount;

        // 1. Protocol fee
        {
            uint256 protocolFeeAmount = _calculateProtocolFee(
                _collection,
                _amount
            );
            address _protocolFeeRecipient = protocolFeeRecipient;

            // Check if the protocol fee is different than 0 for this strategy
            if (
                (_protocolFeeRecipient != address(0)) &&
                (protocolFeeAmount != 0)
            ) {
                IERC20(WAVAX).safeTransfer(
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
                IERC20(WAVAX).safeTransfer(
                    royaltyFeeRecipient,
                    royaltyFeeAmount
                );
                finalSellerAmount -= royaltyFeeAmount;

                emit RoyaltyPayment(
                    _collection,
                    _tokenId,
                    royaltyFeeRecipient,
                    address(WAVAX),
                    royaltyFeeAmount
                );
            }
        }

        if (finalSellerAmount == 0) {
            revert JoepegAuctionHouse__ExpectedNonZeroFinalSellerAmount();
        }

        // 3. Transfer final amount (post-fees) to seller
        {
            IERC20(WAVAX).safeTransfer(_to, finalSellerAmount);
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
