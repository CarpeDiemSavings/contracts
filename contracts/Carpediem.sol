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
        uint256 totalShares;
        uint256 currentPrice;
        uint256 initialPrice;
        uint256 bBonusAmount;
        uint256 lBonusPeriod;
    }

    uint256 public numberOfPools;
    address public immutable charityWallet;
    address public immutable communityWallet;
    address public immutable ownerWallet;

    uint16 constant interestPercent = 50;
    uint16 constant burnPercent = 20;
    uint16 constant charityPercent = 10;
    uint16 constant communityPercent = 10;
    uint16 constant ownerPercent = 10;

    uint16 constant bBonusMaxPercent = 10;
    uint16 constant lBonusMaxPercent = 200;

    uint16 constant percentBase = 100;
    uint256 constant LAMBDA_COEF = 1e18;

    address constant DEAD_WALLET = 0x000000000000000000000000000000000000dEaD;

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
            currentPrice: _initialPrice,
            initialPrice: _initialPrice,
            bBonusAmount: _bBonusAmount,
            lBonusPeriod: _lBonusPeriod
        });
        numberOfPools++;
        emit NewPool(_token, _initialPrice, _bBonusAmount, _lBonusPeriod);
    }
    
    function deposit(address _token, uint256 _amount, uint256 _term) external {
        address sender = _msgSender();
        require(_token != address(0), 'token cannot be zero');
        require(pools[_token].token == _token, 'pool doesnt exist');
        require(users[_token][sender].stake.amount == 0, 'stake already made');
        require(_amount > 0, 'deposit cannot be zero');
        require(_term > 0, 'term cannot be zero');
        uint256 shares = _buySharesForUser(_token, _amount, sender);
        _boostSharesForUser(_token, shares, sender, _term, _amount);
        users[_token][sender].lastLambda = pools[_token].lambda;
        users[_token][sender].stake = StakeInfo(_amount, _term, block.timestamp);
        emit Deposit(_token, sender, _amount, _term);
    }

    function withdraw(address _token) external {
        address sender = _msgSender();
        require(_token != address(0), 'token cannot be zero');
        require(pools[_token].token == _token, 'pool doesnt exist');
        uint256 deposit = users[_token][sender].stake.amount;
        uint256 income = deposit + getReward(_token, sender);
        uint256 penalty = _getPenalty(_token, sender, income);
        console.log('withdraw: income = ', income);
        console.log('withdraw: penalty = ', penalty);
        _distributePenalty(_token, sender, penalty);
        delete users[_token][sender];
        IERC20(_token).transfer(sender, income - penalty);

    }

    function _buySharesForUser(address _token, uint256 _amount, address _user) internal returns(uint256) {
        IERC20(_token).transferFrom(_user, address(this), _amount);
        uint256 sharesToBuy = _amount / pools[_token].currentPrice;
        users[_token][_user].shares += sharesToBuy;
        return sharesToBuy;
    }

    function _boostSharesForUser(
        address _token, 
        uint256 _shares, 
        address _user, 
        uint256 _term, 
        uint256 _deposit
        ) internal {
        uint256 sharesBoosted = _shares +
            _getBonusB(_token, _shares, _deposit) +
            _getBonusL(_token, _shares, _term);
        users[_token][_user].sharesWithBonuses = sharesBoosted;
        pools[_token].totalShares += sharesBoosted;
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

    function _getPenalty(address _token, address _user, uint256 _income) internal view returns(uint256){
        uint256 term =  users[_token][_user].stake.term;
        uint256 stakeTs =  users[_token][_user].stake.ts;
        if(stakeTs + term <= block.timestamp) return 0;
        return (_income) * (term - (block.timestamp - stakeTs )) / (term);

    }

    function getReward(address _token, address _user) public view returns(uint256){
        uint256 lastLambda = users[_token][_user].lastLambda;
        uint256 reward = users[_token][_user].assignedReward;
        uint256 lambda = pools[_token].lambda;
        if (lambda - lastLambda > 0) {
            reward += (lambda - lastLambda) * users[_token][_user].sharesWithBonuses / LAMBDA_COEF;
        }
        return reward;
    }

    function _distributePenalty(address _token, address _user, uint256 _penalty) internal {
        IERC20(_token).transfer(DEAD_WALLET, _penalty * uint256(burnPercent) / uint256(percentBase));
        IERC20(_token).transfer(charityWallet, _penalty * uint256(charityPercent) / uint256(percentBase));
        IERC20(_token).transfer(communityWallet, _penalty * uint256(communityPercent) / uint256(percentBase));
        IERC20(_token).transfer(owner(), _penalty * uint256(ownerPercent) / uint256(percentBase));

        uint256 shares = users[_token][_user].sharesWithBonuses;
        pools[_token].totalShares -= shares;
        pools[_token].lambda += _penalty * LAMBDA_COEF * uint256(interestPercent) / uint256(percentBase) / pools[_token].totalShares;
        console.log("penalty to pool = ", _penalty * uint256(interestPercent) / uint256(percentBase));
    }

    function _changeSharesPrice(address _token, address _user, uint256 _profit) internal {
        uint256 oldPrice = pools[_token].currentPrice;
        uint256 userShares = users[_token][_user].shares;
        if (_profit > oldPrice * userShares) { // _profit / shares > oldPrice
            uint256 newPrice = _profit / userShares;
            pools[_token].currentPrice = newPrice;
            emit NewPrice(oldPrice, newPrice);
        } 
        // event
    }



    
}