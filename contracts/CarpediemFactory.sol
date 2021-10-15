//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./Carpediem.sol";

// Created by Carpe Diem Savings and SFXDX

contract CarpediemFactory is Ownable {

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
        uint16[] memory _distributionPercents,
        address[] memory _distributionAddresses
    ) external onlyOwner {
        require(_token != address(0), "token cannot be zero");
        require(_initialPrice != 0, "price cannot be zero");
        require(_bBonusAmount != 0, "B bonus amount cannot be zero");
        require(_lBonusPeriod != 0, "L bonus period cannot be zero");
        require(_distributionPercents.length == 5, "distributionPercents length must be == 5");
        require(_distributionAddresses.length == 3, "distributionAddresses length must be == 3");
        uint256 sum;
        for (uint256 i = 0; i < _distributionPercents.length; i++) {
            sum += _distributionPercents[i];
        }
        require(sum == percentBase, "percent sum must be == 100");
        for (uint256 i = 0; i < _distributionAddresses.length; i++) {
            require(_distributionAddresses[i] != address(0), "wallet cannot be == 0");
        }
        CarpeDiem pool = new CarpeDiem(address(this),
                _token,
                [_initialPrice,
                _bBonusAmount,
                _lBonusPeriod,
                _bBonusMaxPercent,
                _lBonusMaxPercent],
                _distributionPercents,
                _distributionAddresses);
        allPools.push(address(pool));
        emit NewPool(
            _token,
            address(pool),
            _initialPrice,
            _bBonusAmount,
            _lBonusPeriod,
            _bBonusMaxPercent,
            _lBonusMaxPercent
        );
    }
}
