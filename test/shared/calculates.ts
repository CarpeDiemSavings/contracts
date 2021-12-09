import {BigNumber} from "ethers" 
import {BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, PERCENT_BASE} from "./constants" 

export function calculateBBonus(shares: any, amount: any) {
    if (amount.lt(BBonus)) return shares.mul(BBonusMaxPercent).mul(amount).div(BBonus).div(PERCENT_BASE) 
    return BigNumber.from(BBonusMaxPercent).mul(shares).div(PERCENT_BASE) 
}

export function calculateLBonus(shares: any, term: any) {
    if (term < LBonus) return shares.mul(LBonusMaxPercent).mul(term).div(LBonus).div(PERCENT_BASE) 
    return BigNumber.from(LBonusMaxPercent).mul(shares).div(PERCENT_BASE) 
}
