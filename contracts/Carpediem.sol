//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "hardhat/console.sol";
contract CarpeDiem is Ownable {
    mapping(address => mapping(address => StakeInfo[])) public stakes; // token address => user address => UserInfo
    mapping(address => PoolInfo) public pools; // token address => PoolInfo

    struct StakeInfo {
        uint256 amount;
        uint256 term;
        uint256 ts;
        uint256 shares;
        uint256 sharesWithBonuses;
        uint256 lastLambda;
        uint256 assignedReward;   
    }

    struct PoolInfo {
        address token;
        uint256 lambda;
        uint256 totalShares;        // total shares with the bonuses in the pool
        uint256 currentPrice;       // current shares price
        uint256 initialPrice;       // initial shares price
        uint256 bBonusAmount;       // B0 in 0.1*B/B0 formula
        uint256 lBonusPeriod;       // L0 in 2*L/L0 formula
        uint16 bBonusMaxPercent;    // maximum value of Bbonus
        uint16 lBonusMaxPercent;    // maximum value of Lbonus
        uint16[] penaltyPercents;   // percents to distribute
        address[] wallets;          // wallets for penalty distribution. wallet[0] corresponds to reward pool and can be equal any address != address(0)
    }

    uint256 public numberOfPools; // number of existing pools
    
    uint16 constant percentBase = 100;
    uint256 constant MULTIPLIER = 1e18; // used for multiplying numerators in lambda and price calculations
    uint256 constant WEEK = 7 * 86400;
    uint256 constant FREE_LATE_PERIOD = WEEK; // period of free claiming after stake matured
    uint256 constant PENALTY_PERCENT_PER_WEEK = 2; // amount of percents applied to reward every week
    uint256 public constant MAX_PRICE = 1e12 * MULTIPLIER; // max price (1 share for 1 trillion tokens) to prevent overflow


    event NewPool(
        address token,
        uint256 initialPrice,
        uint256 bBonusAmount,
        uint256 lBonusPeriod
    );

    event Deposit(
        address token,
        address depositor,
        uint256 id,
        uint256 amount,
        uint256 term
    );

    event UpgradedStake(
        address token,
        address depositor,
        uint256 id,
        uint256 amount,
        uint256 term
    );

    event Withdraw(
        address token,
        address who,
        uint256 deposit,
        uint256 reward,
        uint256 penalty
    );

    event NewPrice(uint256 oldPrice, uint256 newPrice);

    function createPool(
        address _token,
        uint256 _initialPrice,
        uint256 _bBonusAmount,
        uint256 _lBonusPeriod,
        uint16 _bBonusMaxPercent,   
        uint16 _lBonusMaxPercent, 
        uint16[] calldata _percents,      
        address[] calldata _wallets
    ) external onlyOwner {
        require(pools[_token].token == address(0), "pool already exists");
        require(_token != address(0), "token cannot be zero");
        require(_initialPrice != 0, "price cannot be zero");
        require(_bBonusAmount != 0, "B bonus amount cannot be zero");
        require(_lBonusPeriod != 0, "L bonus period cannot be zero");
        require(_percents.length == _wallets.length, "incorrect input arrays");
        uint256 sum;
        for (uint256 i = 0; i < _percents.length; i++) {
            require(_wallets[i] != address(0), "wallet cannot be == 0");
            sum += _percents[i];
        }
        require(sum == percentBase, "percent sum must be == 100");
        pools[_token] = PoolInfo({
            token: _token,
            lambda: 0,
            totalShares: 0,
            currentPrice: _initialPrice,
            initialPrice: _initialPrice,
            bBonusAmount: _bBonusAmount,
            lBonusPeriod: _lBonusPeriod,
            penaltyPercents: _percents,      
            bBonusMaxPercent: _bBonusMaxPercent,   
            lBonusMaxPercent: _lBonusMaxPercent, 
            wallets: _wallets
        });
        numberOfPools++;
        emit NewPool(_token, _initialPrice, _bBonusAmount, _lBonusPeriod);
    }

    function setWallets(address _token, address[] calldata _newWallets) external onlyOwner {
        require(_newWallets.length == pools[_token].wallets.length, "incorrect data");
        pools[_token].wallets = _newWallets;
    }

    function deposit(
        address _token,
        uint256 _amount,
        uint256 _term
    ) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, "pool doesnt exist");
        require(_amount > 0, "deposit cannot be zero");
        require(_term > 0, "term cannot be zero");
        uint256 shares = _buyShares(_token, _amount, sender);
        uint256 boostedShares = _getBoostedShares(_token, shares, _term, _amount);
        pools[_token].totalShares += boostedShares;

        stakes[_token][sender].push(
            StakeInfo(
                _amount,
                _term,
                block.timestamp,
                shares,
                boostedShares,
                pools[_token].lambda,
                0
            )
        );

        emit Deposit(_token, sender, stakes[_token][sender].length - 1, _amount, _term);
    }

    function upgradeStake(address _token, uint256 _stakeId, uint256 _amount) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, "pool doesnt exist");
        require(_amount > 0, "deposit cannot be zero");
        require(_stakeId < stakes[_token][sender].length, "no such stake id");
        uint256 stakeTerm = stakes[_token][sender][_stakeId].term;
        uint256 stakeTs = stakes[_token][sender][_stakeId].ts;
        require(stakeTs > 0, "stake was deleted");
        require(block.timestamp < stakeTerm + stakeTs, "stake matured");
        uint256 stakeDeposit = stakes[_token][sender][_stakeId].amount;
        uint256 extraShares = _buyShares(_token, _amount, sender);
        uint256 shares = stakes[_token][sender][_stakeId].shares;
        uint256 boostedSharesBefore = stakes[_token][sender][_stakeId].sharesWithBonuses;
        uint256 boostedShares = _getBoostedShares(
            _token,
            shares + extraShares,
            stakeTs + stakeTerm - block.timestamp,
            stakeDeposit + _amount
        );

        pools[_token].totalShares += boostedShares - boostedSharesBefore;
        stakes[_token][sender][_stakeId] = StakeInfo(
            stakeDeposit + _amount,
            stakeTs + stakeTerm - block.timestamp,
            block.timestamp,
            shares + extraShares,
            boostedShares,
            pools[_token].lambda,
            getReward(_token, sender, _stakeId)
        );

        emit UpgradedStake(
            _token,
            sender,
            _stakeId,
            _amount,
            stakeTs + stakeTerm - block.timestamp
        );
    }

    function withdraw(address _token, uint256 _stakeId) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, "pool doesnt exist");
        require(_stakeId < stakes[_token][sender].length, "no such stake id");
        uint256 deposit = stakes[_token][sender][_stakeId].amount;
        require(deposit > 0, "stake was deleted");
        console.log("withdraw: here1");
        uint256 reward = getReward(_token, sender, _stakeId);
        uint256 penalty = _getPenalty(_token, sender, deposit, reward, _stakeId);
                console.log("withdraw: here2");

        uint256 userShares = stakes[_token][sender][_stakeId].shares;
                console.log("withdraw: here3");

        _changeSharesPrice(_token, deposit + reward - penalty, userShares);
                console.log("withdraw: deposit = ", deposit);
                console.log("withdraw: reward  = ", reward);
                console.log("withdraw: penalty = ", penalty);

        _distributePenalty(_token, sender, _stakeId, penalty);
                        console.log("withdraw: here5");

        delete stakes[_token][sender][_stakeId];
                        console.log("withdraw: here6");

        /// TODO CHECK DATA IN ARRAY
        IERC20(_token).transfer(sender, deposit + reward - penalty);
        emit Withdraw(_token, sender, deposit, reward, penalty);
    }

    function getPenalty(address _token, address _user, uint256 _stakeId)
        external
        view
        returns (uint256)
    {
        uint256 deposit = stakes[_token][_user][_stakeId].amount;
        uint256 reward = getReward(_token, _user, _stakeId);
        return _getPenalty(_token, _user, deposit, reward, _stakeId);
    }

    function getReward(address _token, address _user, uint256 _stakeId)
        public
        view
        returns (uint256)
    {
        uint256 lastLambda = stakes[_token][_user][_stakeId].lastLambda;
        uint256 reward = stakes[_token][_user][_stakeId].assignedReward;
        uint256 lambda = pools[_token].lambda;
        if (lambda - lastLambda > 0) {
            reward +=
                ((lambda - lastLambda) *
                    stakes[_token][_user][_stakeId].sharesWithBonuses) /
                (MULTIPLIER * MULTIPLIER);
        }
        return reward;
    }

    //// buys shares for user for current share price
    function _buyShares(
        address _token,
        uint256 _amount,
        address _user
    ) internal returns(uint256){
        IERC20(_token).transferFrom(_user, address(this), _amount); // take tokens
        uint256 sharesToBuy = (_amount * MULTIPLIER) /
            pools[_token].currentPrice; // calculate corresponding amount of shares
        return sharesToBuy * MULTIPLIER;
    }

    // boost user shares for both deposit and extraDeposit
    function _getBoostedShares(
        address _token,
        uint256 _shares,
        uint256 _term,
        uint256 _deposit
    ) internal view returns(uint256) {
        return _shares +
            _getBonusB(_token, _shares, _deposit) +
            _getBonusL(_token, _shares, _term);
        
    }

    function _getBonusB(
        address _token,
        uint256 _shares,
        uint256 _deposit
    ) internal view returns (uint256) {
        uint256 bBonus = pools[_token].bBonusAmount;
        uint16 bBonusMaxPercent = pools[_token].bBonusMaxPercent;
        if (_deposit < bBonus)
            return
                (_shares * uint256(bBonusMaxPercent) * _deposit) /
                (bBonus * uint256(percentBase));
        return (uint256(bBonusMaxPercent) * _shares) / uint256(percentBase);
    }

    function _getBonusL(
        address _token,
        uint256 _shares,
        uint256 _term
    ) internal view returns (uint256) {
        uint256 lBonus = pools[_token].lBonusPeriod;
        uint256 lBonusMaxPercent = pools[_token].lBonusMaxPercent;
        if (_term < lBonus)
            return
                (_shares * uint256(lBonusMaxPercent) * _term) /
                (lBonus * uint256(percentBase));
        return (uint256(lBonusMaxPercent) * _shares) / uint256(percentBase);
    }

    function _getPenalty(
        address _token,
        address _user,
        uint256 _deposit,
        uint256 _reward,
        uint256 _stakeId
    ) internal view returns (uint256) {
        uint256 term = stakes[_token][_user][_stakeId].term;
        uint256 stakeTs = stakes[_token][_user][_stakeId].ts;
        if (stakeTs + term <= block.timestamp) {
            if (stakeTs + term + FREE_LATE_PERIOD > block.timestamp) return 0;
            uint256 lateWeeks = (block.timestamp - (stakeTs + term)) / WEEK;
            if (lateWeeks >= 50) return _reward;
            uint256 latePenalty = (_reward *
                PENALTY_PERCENT_PER_WEEK *
                lateWeeks) / percentBase;
            return latePenalty;
        }
        return
            ((_deposit + _reward) * (term - (block.timestamp - stakeTs))) /
            term;
    }

    function _distributePenalty(
        address _token,
        address _user,
        uint256 _stakeId,
        uint256 _penalty
    ) internal {
        address[] memory wallets = pools[_token].wallets;
        uint16[] memory percents = pools[_token].penaltyPercents;
        for (uint256 i = 1; i < wallets.length; i++) {                  // skip wallets[0]
            if (percents[i] > 0) IERC20(_token).transfer(
                wallets[i],
                (_penalty * uint256(percents[i])) / uint256(percentBase)
            );
        }

        pools[_token].totalShares -= stakes[_token][_user][_stakeId].sharesWithBonuses;
        if(pools[_token].totalShares == 0) {
            pools[_token].lambda = 0;
        } else {
            pools[_token].lambda +=
                (_penalty * MULTIPLIER * MULTIPLIER * uint256(percents[0])) /
                (uint256(percentBase) * pools[_token].totalShares);
        }
    }

    function _changeSharesPrice(
        address _token,
        uint256 _profit,
        uint256 _shares
    ) private {
        uint256 oldPrice = pools[_token].currentPrice;
        console.log("_changeSharesPrice: _shares = ", _shares);
        console.log("_changeSharesPrice: _profit = ", _profit);
        console.log("_changeSharesPrice: _profit > ", (oldPrice * _shares) / (MULTIPLIER * MULTIPLIER) );
        if (_profit > (oldPrice * _shares) / (MULTIPLIER * MULTIPLIER)) { // equivalent to _profit / shares > oldPrice
            uint256 newPrice = (_profit * MULTIPLIER * MULTIPLIER) / _shares;
            if (newPrice > MAX_PRICE ) newPrice = MAX_PRICE;
            pools[_token].currentPrice = newPrice;
            emit NewPrice(oldPrice, newPrice);
        }
    }
}
