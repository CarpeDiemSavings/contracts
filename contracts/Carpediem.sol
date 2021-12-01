//SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Created by Carpe Diem Savings and SFXDX

contract CarpeDiem {
    address constant DEAD_WALLET = 0x000000000000000000000000000000000000dEaD;

    uint256 private constant percentBase = 100;
    uint256 private constant permile = 10000;
    uint256 private constant MULTIPLIER = 1e18; // used for multiplying numerators in lambda and price calculations
    uint256 private constant WEEK = 7 days;

    uint256 public constant PENALTY_PERCENT_PER_WEEK = 2; // amount of penalty percents applied to reward every late week
    uint256 public constant MAX_PENALTY_DURATION = 100 / PENALTY_PERCENT_PER_WEEK;
    uint256 public constant MAX_PRICE = 1e12 * MULTIPLIER; // max price (1 share for 1 trillion tokens) to prevent overflow

    Ownable public immutable factory;
    IERC20 public immutable token;
    uint256 public immutable bBonusMaxPercent; // maximum value of B bonus
    uint256 public immutable lBonusMaxPercent; // maximum value of L bonus
    uint256 public immutable lBonusPeriod; // period for maximum L bonus
    uint256 public immutable initialPrice; // initial shares price
    uint256 public immutable bBonusAmount; // amount for maximum B bonus

    uint256 public totalShares; // total shares with the bonuses in the pool
    uint256 public currentPrice; // current shares price
    uint256 public lambda;
    uint16[] public distributionPercents; // percents to distribute
    address[] public distributionAddresses; // addresses for penalty distribution. wallet[0] corresponds to reward pool and can be equal any address != address(0)

    struct StakeInfo {
        uint256 amount;
        uint32 term;
        uint32 startTs;
        uint32 lastUpdateTs;
        uint256 shares;
        uint256 sharesWithBonuses;
        uint256 lastLambda;
        uint256 assignedReward;
    }
    mapping(address => StakeInfo[]) public stakes; // user address => StakeInfo

    event Deposit(address depositor, uint256 id, uint256 amount, uint32 term);

    event UpgradedStake(
        address depositor,
        uint256 id,
        uint256 amount,
        uint32 term
    );

    event Withdraw(
        address who,
        uint256 id,
        uint256 deposit,
        uint256 reward,
        uint256 penalty
    );

    event NewPrice(uint256 oldPrice, uint256 newPrice);

    constructor(
        address _factory,
        address _token,
        uint256[5] memory _params,
        uint16[] memory _distributionPercents,
        address[] memory _distributionAddresses
    ) {
        factory = Ownable(_factory);
        token = IERC20(_token);
        lambda = 0;
        totalShares = 0;
        currentPrice = _params[0];
        initialPrice = _params[0];
        bBonusAmount = _params[1];
        lBonusPeriod = _params[2];
        bBonusMaxPercent = _params[3];
        lBonusMaxPercent = _params[4];
        distributionPercents = _distributionPercents;
        distributionAddresses = _distributionAddresses;
    }

    function owner() public view virtual returns (address) {
        return factory.owner();
    }

    modifier onlyOwner() {
        require(factory.owner() == msg.sender, "Ownable: caller is not the owner");
        _;
    }

    function getDistributionAddresses()
        external
        view
        returns (address[] memory)
    {
        return distributionAddresses;
    }

    function getDistributionPercents() external view returns (uint16[] memory) {
        return distributionPercents;
    }

    function getUserStakes(address _user)
        external
        view
        returns (StakeInfo[] memory)
    {
        return stakes[_user];
    }

    function setDistributionAddresses(
        address[] calldata _newDistributionAddresses
    ) external onlyOwner {
        require(
            _newDistributionAddresses.length == 3,
            "distributionAddresses length must be == 3"
        );
        distributionAddresses = _newDistributionAddresses;
    }

    function deposit(uint256 _amount, uint32 _term) external {
        require(_amount > 0, "deposit cannot be zero");
        require(_term > 0, "term cannot be zero");
        require(_term <= 5555 days, "huge term");
        uint256 shares = _buyShares(_amount);
        uint256 boostedShares = shares +
            _getBonusB(shares, _amount) +
            _getBonusL(shares, _term);
        totalShares += boostedShares;
        stakes[msg.sender].push(
            StakeInfo(
                _amount,
                _term,
                uint32(block.timestamp),
                uint32(block.timestamp),
                shares,
                boostedShares,
                lambda,
                0
            )
        );

        emit Deposit(msg.sender, stakes[msg.sender].length - 1, _amount, _term);
    }

    function upgradeStake(uint256 _stakeId, uint256 _amount) external {
        require(_amount > 0, "deposit cannot be zero");
        require(_stakeId < stakes[msg.sender].length, "no such stake id");
        uint32 stakeTerm = stakes[msg.sender][_stakeId].term;
        uint32 stakeTs = stakes[msg.sender][_stakeId].startTs;
        uint32 lastTs = stakes[msg.sender][_stakeId].lastUpdateTs;
        require(stakeTs > 0, "stake was deleted");
        require(block.timestamp < stakeTerm + lastTs, "stake matured");
        uint256 stakeDeposit = stakes[msg.sender][_stakeId].amount;
        uint256 extraShares = _buyShares(_amount);
        uint256 shares = stakes[msg.sender][_stakeId].shares;
        uint32 blockTimestamp = uint32(block.timestamp);

        uint256 boostedShares = shares +
            extraShares +
            _getBonusB(shares + extraShares, stakeDeposit + _amount) +
            _getBonusL(shares + extraShares, lastTs + stakeTerm - blockTimestamp);

        totalShares +=
            boostedShares -
            stakes[msg.sender][_stakeId].sharesWithBonuses;
        // update stake info
        stakes[msg.sender][_stakeId] = StakeInfo(
            stakeDeposit + _amount,
            stakeTs + stakeTerm - blockTimestamp,
            stakeTs,
            blockTimestamp,
            shares + extraShares,
            boostedShares,
            lambda,
            getReward(msg.sender, _stakeId)
        );

        emit UpgradedStake(
            msg.sender,
            _stakeId,
            _amount,
            lastTs + stakeTerm - blockTimestamp
        );
    }

    function withdraw(uint256 _stakeId) external {
        require(_stakeId < stakes[msg.sender].length, "no such stake id");
        uint256 depositAmount = stakes[msg.sender][_stakeId].amount;
        require(depositAmount > 0, "stake was deleted");
        uint256 reward = getReward(msg.sender, _stakeId);
        uint256 penalty = _getPenalty(
            msg.sender,
            reward,
            _stakeId
        );
        uint256 userShares = stakes[msg.sender][_stakeId].shares;
        _changeSharesPrice(depositAmount + reward - penalty, userShares);
        _distributePenalty(penalty);
        totalShares -= stakes[msg.sender][_stakeId].sharesWithBonuses;
        if (totalShares == 0) {
            lambda = 0;
        } else {
            lambda +=
                (penalty *
                    MULTIPLIER *
                    uint256(distributionPercents[4])) /
                (percentBase * totalShares);
        }
        delete stakes[msg.sender][_stakeId];
        token.transfer(msg.sender, depositAmount + reward - penalty);
        emit Withdraw(msg.sender, _stakeId, depositAmount, reward, penalty);
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
        uint256 lastLambda = stakes[_user][_stakeId].lastLambda;
        uint256 reward = stakes[_user][_stakeId].assignedReward;
        uint256 poolLambda = lambda;
        if (poolLambda - lastLambda > 0) {
            reward +=
                (poolLambda - lastLambda) *
                    stakes[_user][_stakeId].sharesWithBonuses / MULTIPLIER;
        }
        return reward;
    }

    // buys shares for user for current share price
    function _buyShares(uint256 _amount) internal returns (uint256 sharesToBuy) {
        token.transferFrom(msg.sender, address(this), _amount); // take tokens
        sharesToBuy = _amount * MULTIPLIER / currentPrice; // calculate corresponding amount of shares
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
                (poolBBonus * percentBase);
        return (bBonusMaxPercent * _shares) / percentBase;
    }

    function _getBonusL(uint256 _shares, uint32 _term)
        internal
        view
        returns (uint256)
    {
        uint256 poolLBonus = lBonusPeriod;
        if (_term < poolLBonus)
            return
                (_shares * lBonusMaxPercent * _term) /
                (poolLBonus * percentBase);
        return (lBonusMaxPercent * _shares) / percentBase;
    }

    function _getPenalty(
        address _user,
        uint256 _reward,
        uint256 _stakeId
    ) internal view returns (uint256) {
        uint256 depositAmount = stakes[_user][_stakeId].amount;
        uint32 term = stakes[_user][_stakeId].term;
        uint32 stakeTs = stakes[_user][_stakeId].startTs;
        uint32 blockTimestamp = uint32(block.timestamp);
        if (stakeTs + term <= blockTimestamp) {
            if (stakeTs + term + WEEK > blockTimestamp) return 0;
            uint256 lateWeeks = (blockTimestamp - (stakeTs + term)) / WEEK;
            if (lateWeeks >= MAX_PENALTY_DURATION) return _reward;
            return
                (_reward * PENALTY_PERCENT_PER_WEEK * lateWeeks) / percentBase;
        }
        return
            ((depositAmount + _reward) * (term - (blockTimestamp - stakeTs))) /
            term;
    }

    function _distributePenalty(uint256 _penalty) internal {
        address[] memory addresses = distributionAddresses;
        uint16[] memory poolPercents = distributionPercents;
        uint256 base = percentBase;
        IERC20 poolToken = token;
        for (uint256 i = 0; i < addresses.length; i++) {
            if (poolPercents[i] > 0)
                poolToken.transfer(
                    addresses[i],
                    (_penalty * poolPercents[i]) / base
                );
        }
        if (poolPercents[3] > 0)
            poolToken.transfer(
                DEAD_WALLET,
                (_penalty * poolPercents[3]) / base
            );
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
