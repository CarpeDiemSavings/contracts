pragma solidity 0.8.7;

import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

import 'hardhat/console.sol';

// Only one pool for one token

contract Carpediem is Ownable {
    
    mapping(address => mapping(address => UserInfo)) public users;          // token address => user address => UserInfo
    mapping(address => PoolInfo) public pools;                              // token address => PoolInfo

    struct StakeInfo {
        uint256 amount;
        uint256 term;
        uint256 ts;
    }

    struct UserInfo {
        uint256 shares;
        uint256 sharesWithBonuses;
        uint256 lastLambda;
        uint256 assignedReward;
        StakeInfo stake;
    }

    struct PoolInfo {
        address token;
        uint256 lambda;                 
        uint256 totalShares;                        // total shares with the bonuses in the pool
        uint256 currentPrice;                       // current shares price
        uint256 initialPrice;                       // initial shares price
        uint256 bBonusAmount;                       // B0 in 0.1*B/B0 formula
        uint256 lBonusPeriod;                       // L0 in 2*L/L0 formula
    }

    uint256 public numberOfPools;                   // number of existing pools
    address public immutable charityWallet;         // charity wallet address
    address public immutable communityWallet;       // community wallet address
    address public immutable ownerWallet;           // owner's wallet address (can differ from deployer address)

    uint16 constant interestPercent = 50;           // penalty percent to reward pool
    uint16 constant burnPercent = 20;               // penalty percent to dead wallet
    uint16 constant charityPercent = 10;            // penalty percent to charity wallet
    uint16 constant communityPercent = 10;          // penalty percent to community wallet
    uint16 constant ownerPercent = 10;              // penalty percent to owner wallet

    uint16 constant bBonusMaxPercent = 10;          // maximum value of Bbonus
    uint16 constant lBonusMaxPercent = 200;         // maximum value of Lbonus

    uint16 constant percentBase = 100;              
    uint256 constant MULTIPLIER = 1e18;             // used for multiplying numerators in lambda and price calculations
    uint256 constant WEEK = 7 * 86400;
    uint256 constant FREE_LATE_PERIOD = WEEK;       // period of free claiming after stake matured
    uint256 constant PENALTY_PERCENT_PER_WEEK = 2;  // amount of percents applied to reward every week

    address constant DEAD_WALLET = 0x000000000000000000000000000000000000dEaD;  // address forr burning

    event NewPool(
        address token,
        uint256 initialPrice,
        uint256 bBonusAmount,
        uint256 lBonusPeriod
    );

    event Deposit(
        address token,
        address depositor,
        uint256 amount,
        uint256 term
    );

    event ExtraDeposit(
        address token,
        address depositor,
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

    event NewPrice(
        uint256 oldPrice,
        uint256 newPrice
    );


    constructor(
        address _charityWallet,
        address _communityWallet,
        address _ownerWallet
    ) {
        require(_charityWallet != address(0), 'charityWallet cannot be zero');
        require(_communityWallet != address(0), 'communityWallet cannot be zero');
        require(_ownerWallet != address(0), 'ownerWallet cannot be zero');
        charityWallet = _charityWallet;
        communityWallet = _communityWallet;
        ownerWallet = _ownerWallet;
    }

    function createPool(
        address _token, 
        uint256 _initialPrice, 
        uint256 _bBonusAmount, 
        uint256 _lBonusPeriod
    ) external onlyOwner {
        require(pools[_token].token == address(0), 'pool already exists');
        require(_token != address(0), 'token cannot be zero');
        require(_initialPrice != 0, 'price cannot be zero');
        require(_bBonusAmount != 0, 'B bonus amount cannot be zero');
        require(_lBonusPeriod != 0, 'L bonus period cannot be zero');
        pools[_token] = PoolInfo({
            token: _token,
            lambda: 0,
            totalShares: 0,
            currentPrice: _initialPrice * MULTIPLIER,
            initialPrice: _initialPrice * MULTIPLIER,
            bBonusAmount: _bBonusAmount,
            lBonusPeriod: _lBonusPeriod
        });
        numberOfPools++;
        emit NewPool(_token, _initialPrice, _bBonusAmount, _lBonusPeriod);
    }
    
    function deposit(address _token, uint256 _amount, uint256 _term) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, 'pool doesnt exist');
        require(_amount > 0, 'deposit cannot be zero');
        require(_term > 0, 'term cannot be zero');
        require(users[_token][sender].stake.amount == 0, 'stake already made');
        _buySharesForUser(_token, _amount, sender);
        _boostSharesForUser(_token, sender, _term, _amount);
        users[_token][sender].lastLambda = pools[_token].lambda;
        users[_token][sender].stake = StakeInfo(_amount, _term, block.timestamp);
        emit Deposit(_token, sender, _amount, _term);
    }

    function extraDeposit(address _token, uint256 _amount) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, 'pool doesnt exist');
        require(_amount > 0, 'deposit cannot be zero');
        require(users[_token][sender].stake.amount != 0, 'no stake yet');
        uint256 stakeTerm = users[_token][sender].stake.term;   
        uint256 stakeTs = users[_token][sender].stake.ts;  
        require(block.timestamp < stakeTerm + stakeTs, 'stake matured');
        users[_token][sender].assignedReward += getReward(_token, sender);
        uint256 stakeDeposit = users[_token][sender].stake.amount;       
        _buySharesForUser(_token, _amount, sender);
        _boostSharesForUser(_token, sender, stakeTs + stakeTerm - block.timestamp, stakeDeposit + _amount);
        users[_token][sender].lastLambda = pools[_token].lambda;
        users[_token][sender].stake = StakeInfo(stakeDeposit + _amount, stakeTs + stakeTerm - block.timestamp, block.timestamp);
        emit ExtraDeposit(_token, sender, _amount, stakeTs + stakeTerm - block.timestamp);
    }

    function withdraw(address _token) external {
        address sender = _msgSender();
        require(pools[_token].token == _token, 'pool doesnt exist');
        uint256 deposit = users[_token][sender].stake.amount;
        uint256 reward = getReward(_token, sender);
        uint256 penalty = _getPenalty(_token, sender, deposit, reward);
        _changeSharesPrice(_token, sender, deposit + reward - penalty);
        _distributePenalty(_token, sender, penalty);
        delete users[_token][sender];
        IERC20(_token).transfer(sender, deposit + reward - penalty);
        emit Withdraw(_token, sender, deposit, reward, penalty);

    }

    function getPenalty(address _token, address _user) external view returns(uint256) {
        uint256 deposit = users[_token][_user].stake.amount;
        uint256 reward = getReward(_token, _user);
        return _getPenalty(_token, _user, deposit, reward);
    }


     function getReward(address _token, address _user) public view returns(uint256){
        uint256 lastLambda = users[_token][_user].lastLambda;
        uint256 reward = users[_token][_user].assignedReward;
        uint256 lambda = pools[_token].lambda;
        if (lambda - lastLambda > 0) {
            reward += (lambda - lastLambda) * users[_token][_user].sharesWithBonuses / MULTIPLIER;
        }
        return reward;
    }


    //// buys shares for user for current share price
    function _buySharesForUser(address _token, uint256 _amount, address _user) internal {
        IERC20(_token).transferFrom(_user, address(this), _amount);                         // take tokens
        uint256 sharesToBuy = _amount * MULTIPLIER / pools[_token].currentPrice;              // calculate corresponding amount of shares
        users[_token][_user].shares += sharesToBuy;                                           
    }

    // boost user shares for both deposit and extraDeposit
    function _boostSharesForUser(
        address _token, 
        address _user, 
        uint256 _term, 
        uint256 _deposit
        ) internal {
        uint256 sharesBoostedBefore = users[_token][_user].sharesWithBonuses;
        uint256 shares = users[_token][_user].shares;
        uint256 sharesBoosted = shares +
            _getBonusB(_token, shares, _deposit) +
            _getBonusL(_token, shares, _term);
        users[_token][_user].sharesWithBonuses = sharesBoosted;
        pools[_token].totalShares += sharesBoosted - sharesBoostedBefore;
    }

    function _getBonusB(address _token, uint256 _shares, uint256 _deposit) internal view returns(uint256){
        uint256 bBonus = pools[_token].bBonusAmount;
        if(_deposit < bBonus) return _shares * uint256(bBonusMaxPercent) * _deposit / (bBonus * uint256(percentBase)); 
        return uint256(bBonusMaxPercent) * _shares / uint256(percentBase);
    }

    function _getBonusL(address _token, uint256 _shares, uint256 _term) internal view returns(uint256){
        uint256 lBonus = pools[_token].lBonusPeriod;
        if(_term < lBonus) return _shares * uint256(lBonusMaxPercent) * _term / (lBonus * uint256(percentBase)); 
        return uint256(lBonusMaxPercent) * _shares / uint256(percentBase);
    }

    function _getPenalty(address _token, address _user, uint256 _deposit, uint256 _reward) internal view returns(uint256){
        uint256 term =  users[_token][_user].stake.term;
        uint256 stakeTs =  users[_token][_user].stake.ts;
        if(stakeTs + term <= block.timestamp) {
            if(stakeTs + term + FREE_LATE_PERIOD > block.timestamp) return 0;
            uint256 lateWeeks = (block.timestamp - (stakeTs + term ))/ WEEK;      
            if (lateWeeks >= 50) return _reward;
            uint256 latePenalty = _reward * PENALTY_PERCENT_PER_WEEK * lateWeeks / percentBase;
            return latePenalty;
        }   
        return (_deposit + _reward) * (term - (block.timestamp - stakeTs) ) / term;
    }

    function _distributePenalty(address _token, address _user, uint256 _penalty) internal {
        IERC20(_token).transfer(DEAD_WALLET, _penalty * uint256(burnPercent) / uint256(percentBase));
        IERC20(_token).transfer(charityWallet, _penalty * uint256(charityPercent) / uint256(percentBase));
        IERC20(_token).transfer(communityWallet, _penalty * uint256(communityPercent) / uint256(percentBase));
        IERC20(_token).transfer(owner(), _penalty * uint256(ownerPercent) / uint256(percentBase));
        pools[_token].totalShares -= users[_token][_user].sharesWithBonuses;
        pools[_token].lambda += _penalty * MULTIPLIER * uint256(interestPercent) / (uint256(percentBase) * pools[_token].totalShares);
    }

    function _changeSharesPrice(address _token, address _user, uint256 _profit) private {
        uint256 oldPrice = pools[_token].currentPrice;
        uint256 userShares = users[_token][_user].shares;
        if (_profit > oldPrice * userShares / MULTIPLIER) {     // equivalent to _profit / shares > oldPrice
            uint256 newPrice = _profit * MULTIPLIER / userShares;
            pools[_token].currentPrice = newPrice;
            emit NewPrice(oldPrice, newPrice);
            console.log('new price EMITTED');
        } 
    }



    
}