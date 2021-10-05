//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./CarpeDiem.sol";

contract CarpediemFactory is Ownable {
    mapping(address => address) public getPool; // token address => pool address

    address[] public allPools;

    uint256 constant percentBase = 100;

    event NewPool(
        address token,
        address poolAddress,
        uint256 initialPrice,
        uint256 bBonusAmount,
        uint256 lBonusPeriod,
        uint256 bBonusMaxPercent,
        uint256 lBonusMaxPercent
    );

    function createPool(
        address _token,
        uint256 _initialPrice,
        uint256 _bBonusAmount,
        uint256 _lBonusPeriod,
        uint256 _bBonusMaxPercent,
        uint256 _lBonusMaxPercent,
        uint16[] memory _percents,
        address[] memory _wallets
    ) external onlyOwner {
        require(getPool[_token] == address(0), "pool already exists");
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

        bytes32 salt = keccak256(abi.encodePacked(_token));
        bytes memory bytecode = abi.encodePacked(
            type(CarpeDiem).creationCode,
            abi.encode(
                _token,
                _initialPrice,
                _bBonusAmount,
                _lBonusPeriod,
                _bBonusMaxPercent,
                _lBonusMaxPercent,
                _percents,
                _wallets
            )
        );
        address pool;
        assembly {
            pool := create2(0, add(bytecode, 32), mload(bytecode), salt)
        }
        CarpeDiem(pool).transferOwnership(msg.sender);
        getPool[_token] = pool;
        allPools.push(pool);
        emit NewPool(
            _token,
            pool,
            _initialPrice,
            _bBonusAmount,
            _lBonusPeriod,
            _bBonusMaxPercent,
            _lBonusMaxPercent
        );
    }
}
