// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "../openzeppelin/ERC20Upgradeable.sol";
import "../openzeppelin/EnumerableSet.sol";
import "../proxy/Controllable.sol";
import "../interfaces/IControllable.sol";
import "../interfaces/IXMyrd.sol";
import "../interfaces/IAppErrors.sol";
import "../interfaces/IGauge.sol";

/// @title xMyrd token
/// Inspired by XSTBL from Stability codebase
contract XMyrd is Controllable, ERC20Upgradeable, IXMyrd {
    using EnumerableSet for EnumerableSet.AddressSet;

    //region ------------------------ Constants

    /// @inheritdoc IControllable
    string public constant VERSION = "1.0.0";

    /// @inheritdoc IXMyrd
    uint public constant BASIS = 10_000;

    /// @inheritdoc IXMyrd
    uint public constant SLASHING_PENALTY = 5000;

    /// @inheritdoc IXMyrd
    uint public constant MIN_VEST = 14 days;

    /// @inheritdoc IXMyrd
    uint public constant MAX_VEST = 180 days;

    // keccak256(abi.encode(uint256(keccak256("erc7201:myrd.XMyrd")) - 1)) & ~bytes32(uint256(0xff))
    bytes32 internal constant XMYRD_STORAGE_LOCATION = 0xf0ecfc0ccecc6975572b37fa830af6559e5857b63ecd7cc8ae9394138d3fd700; // erc7201:myrd.XMyrd
    //endregion ------------------------ Constants

    //region ------------------------ Data types

    /// @custom:storage-location erc7201:myrd.XMyrd
    struct MainStorage {
        /// @notice Myrd address
        address myrd;
        /// @notice Gauge to distribute rewards and control periods
        address gauge;
        /// @dev stores the addresses that are exempt from transfer limitations when transferring out
        EnumerableSet.AddressSet exempt;
        /// @dev stores the addresses that are exempt from transfer limitations when transferring to them
        EnumerableSet.AddressSet exemptTo;
        /// @notice Amount of pvp rebase penalties accumulated pending to be distributed
        uint pendingRebase;
        /// @notice The last period rebases were distributed
        uint lastDistributedPeriod;
        /// @notice returns info on a user's vests
        mapping(address => VestPosition[]) vestInfo;
    }
    //endregion ------------------------ Data types

    //region ------------------------ Initialization

    function initialize(address controller_, address myrd_, address gauge_) external initializer {
        __Controllable_init(controller_);
        __ERC20_init("xMyrd token", "XMYRD");
        MainStorage storage $ = _S();
        $.myrd = myrd_;
        $.gauge = gauge_;

        $.exempt.add(gauge_);
        $.exemptTo.add(gauge_);
    }
    //endregion ------------------------ Initialization

    //region ------------------------ Restricted actions

    /// @inheritdoc IXMyrd
    function rebase() external {
        MainStorage storage $ = _S();

        address _gauge = $.gauge;

        /// @dev gate to minter and call it on epoch flips
        if (msg.sender != _gauge) revert IAppErrors.NotGauge();

        /// @dev fetch the current period
        uint period = IGauge(_gauge).getPeriod();

        uint _pendingRebase = $.pendingRebase;

        /// @dev if it's a new period (epoch)
        if (
            /// @dev if the rebase is greater than the Basis
            period > $.lastDistributedPeriod && _pendingRebase >= BASIS
        ) {
            $.lastDistributedPeriod = period;

            /// @dev zero it out
            $.pendingRebase = 0;

            /// @dev Transfer MYRD to the gauge
            /// @dev Assume that the gauge expects such transfer and monitors changing of MYRD-balance
            IERC20($.myrd).transfer(_gauge, _pendingRebase);

            emit Rebase(msg.sender, _pendingRebase);
        }
    }

    /// @inheritdoc IXMyrd
    function setExemptionFrom(address[] calldata exemptee, bool[] calldata exempt) external {
        if (! isGovernance(msg.sender)) revert IAppErrors.NotGovernance(); // todo deployer (?)

        /// @dev ensure arrays of same length
        if (exemptee.length != exempt.length) revert IAppErrors.IncorrectArrayLength();

        MainStorage storage $ = _S();
        EnumerableSet.AddressSet storage exemptFrom = $.exempt;

        /// @dev loop through all and attempt add/remove based on status
        uint len = exempt.length;
        for (uint i; i < len; ++i) {
            bool success = exempt[i] ? exemptFrom.add(exemptee[i]) : exemptFrom.remove(exemptee[i]);
            /// @dev emit : (who, status, success)
            emit ExemptionFrom(exemptee[i], exempt[i], success);
        }
    }

    /// @inheritdoc IXMyrd
    function setExemptionTo(address[] calldata exemptee, bool[] calldata exempt) external {
        if (! isGovernance(msg.sender)) revert IAppErrors.NotGovernance(); // todo deployer (?)

        /// @dev ensure arrays of same length
        if (exemptee.length != exempt.length) revert IAppErrors.IncorrectArrayLength();

        MainStorage storage $ = _S();
        EnumerableSet.AddressSet storage exemptTo = $.exemptTo;

        /// @dev loop through all and attempt add/remove based on status
        uint len = exempt.length;
        for (uint i; i < len; ++i) {
            bool success = exempt[i] ? exemptTo.add(exemptee[i]) : exemptTo.remove(exemptee[i]);
            /// @dev emit : (who, status, success)
            emit ExemptionTo(exemptee[i], exempt[i], success);
        }
    }
    //endregion ------------------------ Restricted actions

    //region ------------------------ User actions

    /// @inheritdoc IXMyrd
    function enter(uint amount_) external {
        /// @dev ensure the amount_ is > 0
        if (amount_ == 0) revert IAppErrors.IncorrectZeroArgument();

        /// @dev transfer from the caller to this address
        // slither-disable-next-line unchecked-transfer
        IERC20(myrd()).transferFrom(msg.sender, address(this), amount_);

        /// @dev mint the xMyrd to the caller
        _mint(msg.sender, amount_);

        /// @dev Refresh user balance in the gauge
        IGauge(_S().gauge).handleBalanceChange(msg.sender);

        /// @dev emit an event for conversion
        emit Enter(msg.sender, amount_);
    }

    /// @inheritdoc IXMyrd
    function exit(uint amount_) external returns (uint exitedAmount) {
        /// @dev cannot exit a 0 amount
        if (amount_ == 0) revert IAppErrors.IncorrectZeroArgument();

        /// @dev if it's at least 2 wei it will give a penalty
        uint penalty = amount_ * SLASHING_PENALTY / BASIS;
        uint exitAmount = amount_ - penalty;

        /// @dev burn the xMyrd from the caller's address
        _burn(msg.sender, amount_);

        MainStorage storage $ = _S();

        /// @dev store the rebase earned from the penalty
        $.pendingRebase += penalty;

        /// @dev transfer the exitAmount to the caller
        // slither-disable-next-line unchecked-transfer
        IERC20($.myrd).transfer(msg.sender, exitAmount);

        /// @dev Refresh user balance in the gauge
        IGauge(_S().gauge).handleBalanceChange(msg.sender);

        /// @dev emit actual exited amount
        emit InstantExit(msg.sender, exitAmount);

        return exitAmount;
    }

    /// @inheritdoc IXMyrd
    function createVest(uint amount_) external {
        /// @dev ensure not 0
        if (amount_ == 0) revert IAppErrors.IncorrectZeroArgument();

        /// @dev preemptive burn
        _burn(msg.sender, amount_);

        MainStorage storage $ = _S();

        /// @dev fetch total length of vests
        uint vestLength = $.vestInfo[msg.sender].length;

        /// @dev push new position
        $.vestInfo[msg.sender].push(VestPosition(amount_, block.timestamp, block.timestamp + MAX_VEST, vestLength));

        /// @dev Refresh user balance in the gauge
        IGauge(_S().gauge).handleBalanceChange(msg.sender);

        emit NewVest(msg.sender, vestLength, amount_);
    }

    /// @inheritdoc IXMyrd
    function exitVest(uint vestID_) external {
        MainStorage storage $ = _S();

        VestPosition storage _vest = $.vestInfo[msg.sender][vestID_];
        if (_vest.amount == 0) revert NO_VEST();

        /// @dev store amount in the vest and start time
        uint _amount = _vest.amount;
        uint _start = _vest.start;

        /// @dev zero out the amount before anything else as a safety measure
        _vest.amount = 0;

        if (block.timestamp < _start + MIN_VEST) {
            /// @dev case: vest has not crossed the minimum vesting threshold
            /// @dev mint cancelled xMyrd back to msg.sender
            _mint(msg.sender, _amount);

            /// @dev Refresh user balance in the gauge
            IGauge(_S().gauge).handleBalanceChange(msg.sender);

            emit CancelVesting(msg.sender, vestID_, _amount);
        } else if (_vest.maxEnd <= block.timestamp) {
            /// @dev case: vest is complete
            /// @dev send liquid Myrd to msg.sender
            // slither-disable-next-line unchecked-transfer
            IERC20($.myrd).transfer(msg.sender, _amount);

            emit ExitVesting(msg.sender, vestID_, _amount, _amount);
        } else {
            /// @dev case: vest is in progress
            /// @dev calculate % earned based on length of time that has vested
            /// @dev linear calculations

            /// @dev the base to start at (50%)
            uint base = _amount * SLASHING_PENALTY / BASIS;

            /// @dev calculate the extra earned via vesting
            uint vestEarned = _amount * (BASIS - SLASHING_PENALTY) * (block.timestamp - _start) / MAX_VEST / BASIS;

            uint exitedAmount = base + vestEarned;

            /// @dev add to the existing pendingRebases
            $.pendingRebase += (_amount - exitedAmount);

            /// @dev transfer underlying to the sender after penalties removed
            // slither-disable-next-line unchecked-transfer
            IERC20($.myrd).transfer(msg.sender, exitedAmount);

            emit ExitVesting(msg.sender, vestID_, _amount, exitedAmount);
        }
    }
    //endregion ------------------------ User actions

    //region ------------------------ Views

    /// @inheritdoc IXMyrd
    function myrd() public view returns (address) {
        return _S().myrd;
    }

    /// @inheritdoc IXMyrd
    function gauge() external view returns (address) {
        return _S().gauge;
    }

    /// @inheritdoc IXMyrd
    function vestInfo(address user, uint vestID) external view returns (uint amount, uint start, uint maxEnd) {
        MainStorage storage $ = _S();
        VestPosition memory vestPosition = $.vestInfo[user][vestID];
        amount = vestPosition.amount;
        start = vestPosition.start;
        maxEnd = vestPosition.maxEnd;
    }

    /// @inheritdoc IXMyrd
    function usersTotalVests(address who) external view returns (uint numOfVests) {
        MainStorage storage $ = _S();
        return $.vestInfo[who].length;
    }

    /// @inheritdoc IXMyrd
    function pendingRebase() external view returns (uint) {
        return _S().pendingRebase;
    }

    /// @inheritdoc IXMyrd
    function lastDistributedPeriod() external view returns (uint) {
        return _S().lastDistributedPeriod;
    }
    //endregion ------------------------ Views

    //region ------------------------ Hooks to override

    function _update(address from, address to, uint value) internal override {
        if (!_isExempted(from, to)) revert NOT_WHITELISTED(from, to);

        /// @dev call parent function
        super._update(from, to, value);
    }
    //endregion ------------------------ Hooks to override

    //region ------------------------ Internal logic

    /// @dev internal check for the transfer whitelist
    function _isExempted(address from_, address to_) internal view returns (bool) {
        MainStorage storage $ = _S();
        return (from_ == address(0) || to_ == address(0) || $.exempt.contains(from_) || $.exemptTo.contains(to_));
    }

    function _S() internal pure returns (MainStorage storage $) {
        //slither-disable-next-line assembly
        assembly {
            $.slot := XMYRD_STORAGE_LOCATION
        }
        return $;
    }
    //endregion ------------------------ Internal logic
}
