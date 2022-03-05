//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

// Created by Carpe Diem Savings and SFXDX

contract CarpeDiem is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address constant DEAD_WALLET = 0x000000000000000000000000000000000000dEaD;

    uint256 private constant PERCENT_BASE = 100;
    uint256 private constant MULTIPLIER = 1e18; // used for multiplying numerators in lambda and price calculations
    uint256 private constant WEEK = 7 days;

    uint256 public constant PENALTY_PERCENT_PER_WEEK = 2; // amount of penalty percents applied to reward every late week
    uint256 public constant MAX_PENALTY_DURATION =
        100 / PENALTY_PERCENT_PER_WEEK;
    uint256 public constant MAX_PRICE = 1e12 * MULTIPLIER; // max price (1 share for 1 trillion tokens) to prevent overflow

    IERC20 public immutable token;
    uint256 public immutable bBonusMaxPercent; // maximum value of B bonus
    uint256 public immutable lBonusMaxPercent; // maximum value of L bonus
    uint256 public immutable lBonusPeriod; // period for maximum L bonus
    uint256 public immutable initialPrice; // initial shares price
    uint256 public immutable bBonusAmount; // amount for maximum B bonus
    uint256 public immutable burnPercent;
    uint256 public immutable stakersPercent;

    uint256 public totalShares; // total shares with the bonuses in the pool
    uint256 public currentPrice; // current shares price
    uint256 public lambda;
    uint16[3] public distributionPercents; // percents to distribute
    address[3] public distributionAddresses; // addresses for penalty distribution. wallet[0] corresponds to reward pool and can be equal any address != address(0)
    uint256 public commissionAccumulator;

    struct StakeInfo {
        uint256 amount;
        uint32 duration;
        uint32 startTs;
        uint256 shares;
        uint256 lBonusShares;
        uint256 bBonusShares;
        uint256 lastLambda;
        uint256 assignedReward;
    }

    mapping(address => StakeInfo[]) public stakes; // user address => StakeInfo

    event Deposit(address depositor, uint256 id, uint256 amount, uint32 duration);

    event StakeUpgraded(
        address depositor,
        uint256 id,
        uint256 amount,
        uint32 duration
    );

    event Withdraw(
        address who,
        uint256 id,
        uint256 deposit,
        uint256 reward,
        uint256 penalty
    );

    event StakeRemoved(
        address who,
        uint256 id,
        uint256 deposit
    );

    event NewPrice(uint256 oldPrice, uint256 newPrice);

    constructor(
        address _token,
        uint256[5] memory _params,
        uint16[5] memory _distributionPercents,
        address[3] memory _distributionAddresses
    ) {
        token = IERC20(_token);
        lambda = 0;
        totalShares = 0;
        currentPrice = _params[0];
        initialPrice = _params[0];
        bBonusAmount = _params[1];
        lBonusPeriod = _params[2];
        bBonusMaxPercent = _params[3];
        lBonusMaxPercent = _params[4];
        distributionPercents[0] = _distributionPercents[0];
        distributionPercents[1] = _distributionPercents[1];
        distributionPercents[2] = _distributionPercents[2];
        burnPercent = _distributionPercents[3];
        stakersPercent = _distributionPercents[4];
        distributionAddresses = _distributionAddresses;
    }

    function deposit(uint256 _amount, uint32 _duration) external {
        require(_amount > 0, "deposit cannot be zero");
        require(_duration > 0, "duration cannot be zero");
        require(_duration <= 5555 days, "huge duration");
        uint256 shares = _buyShares(_amount);
        uint256 lBonusShares = _getBonusL(shares, _duration);
        uint256 bBonusShares = _getBonusB(shares, _amount);
        totalShares = totalShares + shares + lBonusShares + bBonusShares;
        stakes[msg.sender].push(
            StakeInfo(
                _amount,
                _duration,
                uint32(block.timestamp),
                shares,
                lBonusShares,
                bBonusShares,
                lambda,
                0
            )
        );

        emit Deposit(msg.sender, stakes[msg.sender].length - 1, _amount, _duration);
    }

    function upgradeStake(uint256 _stakeId, uint256 _amount) external nonReentrant {
        require(_amount > 0, "deposit cannot be zero");
        require(_stakeId < stakes[msg.sender].length, "no such stake id");
        StakeInfo memory stakeInfo = stakes[msg.sender][_stakeId];
        require(stakeInfo.startTs > 0, "stake was deleted");
        require(
            block.timestamp < stakeInfo.duration + stakeInfo.startTs,
            "stake matured"
        );
        uint256 extraShares = _buyShares(_amount);
        uint32 blockTimestamp = uint32(block.timestamp);

        uint256 lBonusShares = _getBonusL(
            extraShares,
            stakeInfo.startTs + stakeInfo.duration - blockTimestamp
        );
        uint256 bBonusShares = _getBonusB(
            stakeInfo.shares + extraShares,
            stakeInfo.amount + _amount
        );

        totalShares =
            totalShares +
            extraShares +
            bBonusShares +
            lBonusShares -
            stakeInfo.bBonusShares;
        // update stake info
        stakes[msg.sender][_stakeId] = StakeInfo(
            stakeInfo.amount + _amount,
            stakeInfo.duration,
            stakeInfo.startTs,
            stakeInfo.shares + extraShares,
            stakeInfo.lBonusShares + lBonusShares,
            bBonusShares,
            lambda,
            getReward(msg.sender, _stakeId)
        );

        emit StakeUpgraded(
            msg.sender,
            _stakeId,
            _amount,
            stakeInfo.startTs + stakeInfo.duration - blockTimestamp
        );
    }

    function withdraw(uint256 _stakeId) external {
        require(_stakeId < stakes[msg.sender].length, "no such stake id");
        StakeInfo memory stakeInfo = stakes[msg.sender][_stakeId];
        require(stakeInfo.amount > 0, "stake was deleted");
        uint256 reward = getReward(msg.sender, _stakeId);
        uint256 penalty = _getPenalty(msg.sender, reward, _stakeId);
        _changeSharesPrice(
            stakeInfo.amount + reward - penalty,
            stakeInfo.shares
        );
        commissionAccumulator +=
            (penalty * (PERCENT_BASE - stakersPercent)) /
            PERCENT_BASE;
        totalShares =
            totalShares -
            stakeInfo.shares -
            stakeInfo.bBonusShares -
            stakeInfo.lBonusShares;
        if (totalShares == 0) {
            lambda = 0;
        } else {
            lambda +=
                (penalty * MULTIPLIER * stakersPercent) /
                PERCENT_BASE /
                totalShares;
        }
        delete stakes[msg.sender][_stakeId];
        token.safeTransfer(msg.sender, stakeInfo.amount + reward - penalty);
        emit Withdraw(msg.sender, _stakeId, stakeInfo.amount, reward, penalty);
    }

    function removeDeadStake(address _user, uint256 _stakeId) external {
        require(_stakeId < stakes[_user].length, "noSuchStake");
        StakeInfo memory stakeInfo = stakes[_user][_stakeId];
        require(stakeInfo.amount > 0, "stakeWithdrawn");
        require(
            uint32(block.timestamp) >= stakeInfo.startTs + stakeInfo.duration + 365 days,
            "stakeAlive"
        );

        _changeSharesPrice(
            stakes[_user][_stakeId].amount,
            stakes[_user][_stakeId].shares
        );
        totalShares -= (
            stakeInfo.shares + stakeInfo.bBonusShares + stakeInfo.lBonusShares
        );
        if (totalShares == 0) {
            lambda = 0;
        }
        delete stakes[_user][_stakeId];
        token.safeTransfer(_user, stakeInfo.amount);
        emit StakeRemoved(_user, _stakeId, stakeInfo.amount);
    }

    function distributePenalty() external nonReentrant {
        address[3] memory addresses = distributionAddresses;
        uint16[3] memory poolPercents = distributionPercents;
        uint256 _commissionAccumulator = commissionAccumulator;
        IERC20 poolToken = token;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (poolPercents[i] > 0)
                poolToken.safeTransfer(
                    addresses[i],
                    (_commissionAccumulator * poolPercents[i]) /
                        (PERCENT_BASE - stakersPercent)
                );
        }
        if (burnPercent > 0)
            poolToken.safeTransfer(
                DEAD_WALLET,
                (_commissionAccumulator * burnPercent) /
                    (PERCENT_BASE - stakersPercent)
            );

        commissionAccumulator = 0;
    }

    function getPenalty(address _user, uint256 _stakeId)
        external
        view
        returns (uint256)
    {
        uint256 reward = getReward(_user, _stakeId);
        return _getPenalty(_user, reward, _stakeId);
    }

    function getReward(address _user, uint256 _stakeId)
        public
        view
        returns (uint256)
    {
        StakeInfo memory stakeInfo = stakes[_user][_stakeId];
        uint256 poolLambda = lambda;
        if (poolLambda - stakeInfo.lastLambda > 0) {
            stakeInfo.assignedReward +=
                ((poolLambda - stakeInfo.lastLambda) *
                    (stakeInfo.shares +
                        stakeInfo.bBonusShares +
                        stakeInfo.lBonusShares)) /
                MULTIPLIER;
        }
        return stakeInfo.assignedReward;
    }

    // buys shares for user for current share price
    function _buyShares(uint256 _amount)
        internal
        returns (uint256 sharesToBuy)
    {
        token.safeTransferFrom(msg.sender, address(this), _amount); // take tokens
        sharesToBuy = (_amount * MULTIPLIER) / currentPrice; // calculate corresponding amount of shares
    }

    function _getBonusB(uint256 _shares, uint256 _deposit)
        internal
        view
        returns (uint256)
    {
        uint256 poolBBonus = bBonusAmount;
        if (_deposit < poolBBonus)
            return
                (_shares * bBonusMaxPercent * _deposit) /
                (poolBBonus * PERCENT_BASE);
        return (bBonusMaxPercent * _shares) / PERCENT_BASE;
    }

    function _getBonusL(uint256 _shares, uint32 _duration)
        internal
        view
        returns (uint256)
    {
        uint256 poolLBonus = lBonusPeriod;
        if (_duration < poolLBonus)
            return
                (_shares * lBonusMaxPercent * _duration) /
                (poolLBonus * PERCENT_BASE);
        return (lBonusMaxPercent * _shares) / PERCENT_BASE;
    }

    function _getPenalty(
        address _user,
        uint256 _reward,
        uint256 _stakeId
    ) internal view returns (uint256) {
        uint256 depositAmount = stakes[_user][_stakeId].amount;
        uint32 duration = stakes[_user][_stakeId].duration;
        uint32 startTs = stakes[_user][_stakeId].startTs;
        uint32 blockTimestamp = uint32(block.timestamp);
        if (startTs + duration <= blockTimestamp) {
            if (startTs + duration + WEEK > blockTimestamp) return 0;
            uint256 lateWeeks = (blockTimestamp - (startTs + duration)) / WEEK;
            if (lateWeeks >= MAX_PENALTY_DURATION) return _reward;
            return
                (_reward * PENALTY_PERCENT_PER_WEEK * lateWeeks) / PERCENT_BASE;
        }
        return
            ((depositAmount + _reward) * (duration - (blockTimestamp - startTs))) /
            duration;
    }

    function _changeSharesPrice(uint256 _profit, uint256 _shares) private {
        uint256 oldPrice = currentPrice;
        if (_profit > (oldPrice * _shares) / (MULTIPLIER)) {
            // equivalent to _profit / shares > oldPrice
            uint256 newPrice = (_profit * MULTIPLIER) / _shares;
            if (newPrice > MAX_PRICE) newPrice = MAX_PRICE;
            currentPrice = newPrice;
            emit NewPrice(oldPrice, newPrice);
        }
    }
}
