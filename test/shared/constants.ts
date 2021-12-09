import {BigNumber} from "ethers" 
import {ethers} from "hardhat" 

export const ONE = BigNumber.from('1') 
export const TWO = BigNumber.from('2') 
export const TEN = BigNumber.from('10') 
export const HUN = BigNumber.from('100') 
export const DEAD_WALLET =  '0x000000000000000000000000000000000000dEaD' 
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' 
export const TOTALSUPPLY = ethers.utils.parseEther('1000000000000000') 
export const DAY = 86400 
export const WEEK = 7 * 86400 
export const YEAR = DAY * 365 
export const LBonus = 10 * YEAR 
export const LBonusMaxPercent = 200 
export const BBonus = ethers.utils.parseEther('100000') 
export const BBonusMaxPercent = 10 
export const PERCENT_BASE = 100 
export const INTEREST_PERCENT = 50 
export const INITIAL_PRICE = ethers.utils.parseEther('1') 

export const penaltyPercents = [10, 10, 10, 20, 50] 

export const FREE_LATE_PERIOD = 7 * 86400 
export const PENALTY_PERCENT_PER_WEEK = BigNumber.from(2) 

export const BURN_PERCENT = 20 
export const CHARITY_PERCENT = 10 
export const COMMUNITY_PERCENT = 10 
export const OWNER_PERCENT = 10 

export const LAMBDA_COEF = ethers.utils.parseEther('1') 

