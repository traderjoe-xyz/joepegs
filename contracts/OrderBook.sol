// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// OpenZeppelin contracts
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20, SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// LooksRare interfaces
import {ICurrencyManager} from "./interfaces/ICurrencyManager.sol";
import {IExecutionManager} from "./interfaces/IExecutionManager.sol";
import {IExecutionStrategy} from "./interfaces/IExecutionStrategy.sol";
import {IRoyaltyFeeManager} from "./interfaces/IRoyaltyFeeManager.sol";
import {ILooksRareExchange} from "./interfaces/ILooksRareExchange.sol";
import {ITransferManagerNFT} from "./interfaces/ITransferManagerNFT.sol";
import {ITransferSelectorNFT} from "./interfaces/ITransferSelectorNFT.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IOrderBook} from "./interfaces/IOrderBook.sol";

// LooksRare libraries
import {OrderTypes} from "./libraries/OrderTypes.sol";
import {SignatureChecker} from "./libraries/SignatureChecker.sol";

/**
 * @title OrderBook
 * @notice Manages and performs validation of orders placed on the exchange
 */
contract OrderBook is IOrderBook, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    using OrderTypes for OrderTypes.MakerOrder;
    using OrderTypes for OrderTypes.TakerOrder;

    ILooksRareExchange public exchange;

    mapping(address => uint256) public userMinOrderNonce;
    mapping(address => mapping(uint256 => bool))
        private _isUserOrderNonceExecutedOrCancelled;

    /// @notice Mapping from user to latest order nonce
    mapping(address => uint256) public userLatestOrderNonce;

    /// @notice Mapping from NFT contract address => NFT token ID => maker orders
    mapping(address => mapping(uint256 => OrderTypes.MakerOrder[]))
        private makerOrders;

    event CancelAllOrders(address indexed user, uint256 newMinNonce);
    event CancelMultipleOrders(address indexed user, uint256[] orderNonces);
    event NewExchange(address indexed user, address newExchange);

    function setExchange(address _exchange) external onlyOwner {
        require(
            _exchange != address(0),
            "OrderBook: Expected non-zero address for exchange"
        );
        exchange = ILooksRareExchange(_exchange);
        emit NewExchange(msg.sender, _exchange);
    }

    function getMakerOrders(address collection, uint256 tokenId)
        external
        view
        override
        returns (OrderTypes.MakerOrder[] memory)
    {
        return makerOrders[collection][tokenId];
    }

    function createMakerOrder(OrderTypes.MakerOrder calldata makerOrder)
        external
        override
    {
        require(
            makerOrder.signer == msg.sender,
            "Expected maker order signer to be msg.sender"
        );
        require(
            makerOrder.nonce == userLatestOrderNonce[msg.sender] + 1,
            "Expected maker order nonce to be one greater than latest user order nonce"
        );

        validateOrder(makerOrder, makerOrder.hash());

        userLatestOrderNonce[msg.sender] += 1;

        address collection = makerOrder.collection;
        uint256 tokenId = makerOrder.tokenId;
        makerOrders[collection][tokenId].push(makerOrder);
    }

    function markMakerOrderAsExecutedOrCancelled(
        address makerOrderSigner,
        uint256 makerOrderNonce
    ) external override onlyOwner {
        _isUserOrderNonceExecutedOrCancelled[makerOrderSigner][
            makerOrderNonce
        ] = true;
    }

    /**
     * @notice Cancel all pending orders for a sender
     * @param minNonce minimum user nonce
     */
    function cancelAllOrdersForSender(uint256 minNonce) external override {
        require(
            minNonce > userMinOrderNonce[msg.sender],
            "Cancel: Order nonce lower than current"
        );
        require(
            minNonce < userMinOrderNonce[msg.sender] + 500000,
            "Cancel: Cannot cancel more orders"
        );
        userMinOrderNonce[msg.sender] = minNonce;

        emit CancelAllOrders(msg.sender, minNonce);
    }

    /**
     * @notice Cancel maker orders
     * @param orderNonces array of order nonces
     */
    function cancelMultipleMakerOrders(uint256[] calldata orderNonces)
        external
        override
    {
        require(orderNonces.length > 0, "Cancel: Cannot be empty");

        for (uint256 i = 0; i < orderNonces.length; i++) {
            require(
                orderNonces[i] >= userMinOrderNonce[msg.sender],
                "Cancel: Order nonce lower than current"
            );
            _isUserOrderNonceExecutedOrCancelled[msg.sender][
                orderNonces[i]
            ] = true;
        }

        emit CancelMultipleOrders(msg.sender, orderNonces);
    }

    /**
     * @notice Check whether user order nonce is executed or cancelled
     * @param user address of user
     * @param orderNonce nonce of the order
     */
    function isUserOrderNonceExecutedOrCancelled(
        address user,
        uint256 orderNonce
    ) external view override returns (bool) {
        return _isUserOrderNonceExecutedOrCancelled[user][orderNonce];
    }

    /**
     * @notice Verify the validity of the maker order
     * @param makerOrder maker order
     * @param orderHash computed hash for the order
     */
    function validateOrder(
        OrderTypes.MakerOrder calldata makerOrder,
        bytes32 orderHash
    ) public view override {
        require(
            address(exchange) != address(0),
            "OrderBook: Expected exchange to be initialized"
        );

        // Verify whether order nonce has expired
        require(
            (
                !_isUserOrderNonceExecutedOrCancelled[makerOrder.signer][
                    makerOrder.nonce
                ]
            ) && (makerOrder.nonce >= userMinOrderNonce[makerOrder.signer]),
            "Order: Matching order expired"
        );

        // Verify the signer is not address(0)
        require(makerOrder.signer != address(0), "Order: Invalid signer");

        // Verify the amount is not 0
        require(makerOrder.amount > 0, "Order: Amount cannot be 0");

        // Verify the validity of the signature
        require(
            SignatureChecker.verify(
                orderHash,
                makerOrder.signer,
                makerOrder.v,
                makerOrder.r,
                makerOrder.s,
                exchange.DOMAIN_SEPARATOR()
            ),
            "Signature: Invalid"
        );

        // Verify whether the currency is whitelisted
        require(
            exchange.currencyManager().isCurrencyWhitelisted(
                makerOrder.currency
            ),
            "Currency: Not whitelisted"
        );

        // Verify whether strategy can be executed
        require(
            exchange.executionManager().isStrategyWhitelisted(
                makerOrder.strategy
            ),
            "Strategy: Not whitelisted"
        );
    }
}
