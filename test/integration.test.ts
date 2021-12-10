import { ethers, waffle } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'

import {
    BBonus,
    BBonusMaxPercent, BURN_PERCENT, CHARITY_PERCENT, COMMUNITY_PERCENT, DAY, DEAD_WALLET, HUN,
    INITIAL_PRICE, INTEREST_PERCENT, LAMBDA_COEF,
    LBonus,
    LBonusMaxPercent, ONE, OWNER_PERCENT, PENALTY_PERCENT_PER_WEEK,
    penaltyPercents, PERCENT_BASE, TEN,
    TOTALSUPPLY, TWO, WEEK, YEAR, ZERO_ADDRESS
} from "./shared/constants"
import {fixture} from "./shared/fixtures"

const createFixtureLoader = waffle.createFixtureLoader

const accounts = waffle.provider.getWallets()
const owner = accounts[0]
const charity = accounts[1]
const community = accounts[2]
const alice = accounts[3]
const bob = accounts[4]
const charlie = accounts[5]
const darwin = accounts[6]
const other = accounts[7]

function assertRoughlyEqualValues (expected: any, actual: any, relativeDiff: any) {
    const expectedBN = BigNumber.from(expected);
    const actualBN = BigNumber.from(actual);

    let multiplerNumerator = relativeDiff;
    let multiplerDenominator = BigNumber.from('1');
    while (!Number.isInteger(multiplerNumerator)) {
        multiplerDenominator = multiplerDenominator.mul(BigNumber.from('10'));
        multiplerNumerator *= 10;
    }
    const diff = expectedBN.sub(actualBN).abs();
    const treshold = expectedBN.mul(BigNumber.from(multiplerNumerator.toString())).div(multiplerDenominator);
    if (!diff.lte(treshold)) {
        expect(actualBN).to.be.equal(expectedBN, `${actualBN} != ${expectedBN} with ${relativeDiff} precision`);
    }
}

describe('integration tests', async () => {
    let token: any
    let carp: any
    let factory: any
    let wallets: any

    let loadFixture: ReturnType<typeof createFixtureLoader>
    before('create fixture loader', async () => {
        const signers = waffle.provider.getWallets()
        loadFixture = createFixtureLoader(signers)
        wallets = [
            owner.address,
            charity.address,
            community.address
        ]
    })

    beforeEach('deploy token and factory', async() => {
        ({factory, carp, token} = await loadFixture(fixture))
    })

    it('should correct penalty calculation for deposits of various sizes', async() => {
        const poolCurrentPrice = await carp.currentPrice()

        expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
        const startAmount = ethers.utils.parseEther('100')
        const tinyAmount = ethers.utils.parseEther('0.001')
        const hugeAmount = ethers.utils.parseEther('1000000')

        await token.connect(alice).approve(carp.address, TOTALSUPPLY)
        await token.connect(bob).approve(carp.address, TOTALSUPPLY)
        await token.connect(charlie).approve(carp.address, TOTALSUPPLY)
        await token.connect(darwin).approve(carp.address, TOTALSUPPLY)

        // deposits
        await carp.connect(alice).deposit(startAmount, 10 * YEAR)
        await carp.connect(bob).deposit(hugeAmount, YEAR)
        await carp.connect(charlie).deposit(tinyAmount, YEAR)
        await carp.connect(darwin).deposit(startAmount, YEAR)

        // remove huge deposit
        const depositIndex = 0
        const penalty1 = await carp.getPenalty(bob.address, depositIndex)
        await carp.connect(bob).withdraw(depositIndex)
        let poolLambda = await carp.lambda()
        let poolTotalShares = await carp.totalShares()
        let penalty = penalty1;
        assertRoughlyEqualValues(
            penalty,
            poolLambda.mul(poolTotalShares).mul(PERCENT_BASE).div(INTEREST_PERCENT).div(LAMBDA_COEF),
            1e-6)

        // remove tiny deposit
        const reward2 = await carp.getReward(charlie.address, depositIndex)
        const penalty2 = await carp.getPenalty(charlie.address, depositIndex)
        await carp.connect(charlie).withdraw(depositIndex)
        poolLambda = await carp.lambda()
        poolTotalShares = await carp.totalShares()
        penalty = penalty.add(penalty2).sub(reward2)
        assertRoughlyEqualValues(
            penalty,
            poolLambda.mul(poolTotalShares).mul(PERCENT_BASE).div(INTEREST_PERCENT).div(LAMBDA_COEF),
            1e-5)

        // remove standard deposit
        await carp.connect(darwin).withdraw(depositIndex)

        // wait end of period for alice
        await ethers.provider.send('evm_increaseTime', [10 * YEAR])
        await ethers.provider.send('evm_mine', [])

        // remove last deposit
        await carp.connect(alice).withdraw(depositIndex)

        // get all commissions from carp
        await carp.connect(owner).distributePenalty()

        // check carp balance after all clear
        const balance = await token.balanceOf(carp.address)
        expect(balance).to.be.lte('1000') // less that 1e-15 tokens
    })

    it('should correct penalty calculation after multiple stakes upgrades', async() => {
        const poolCurrentPrice = await carp.currentPrice()

        expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
        const startAmount = ethers.utils.parseEther('100')

        await token.connect(alice).approve(carp.address, TOTALSUPPLY)
        await token.connect(bob).approve(carp.address, TOTALSUPPLY)
        await token.connect(darwin).approve(carp.address, TOTALSUPPLY)

        // deposits
        await carp.connect(alice).deposit(startAmount, 2 * YEAR)
        await carp.connect(bob).deposit(startAmount, 2 * YEAR)
        await carp.connect(darwin).deposit(startAmount, YEAR) // index 0
        await carp.connect(darwin).deposit(startAmount, YEAR) // index 1
        await carp.connect(darwin).deposit(startAmount, YEAR) // index 2
        await carp.connect(darwin).deposit(startAmount, YEAR) // index 3

        // init reward for accounts
        let removedDepositIndex = 3
        await carp.connect(darwin).withdraw(removedDepositIndex)
        // wait
        await ethers.provider.send('evm_increaseTime', [YEAR / 2])
        await ethers.provider.send('evm_mine', [])

        // Alice's and Bob's rewards should be an equal
        const depositIndex = 0
        const rewardAlice = await carp.getReward(alice.address, depositIndex)
        const rewardBob = await carp.getReward(bob.address, depositIndex)
        assertRoughlyEqualValues(rewardAlice, rewardBob, 1e-18)

        // alice doubles stake
        await carp.connect(alice).upgradeStake(depositIndex, startAmount)

        // add reward
        removedDepositIndex = 2
        await carp.connect(darwin).withdraw(removedDepositIndex)

        // Alice's reward growth should be great that Bob's reward growth, but less that double Bob's reward growth
        const rewardAlice2 = await carp.getReward(alice.address, depositIndex)
        const rewardBob2 = await carp.getReward(bob.address, depositIndex)
        let growthAlice = rewardAlice2.sub(rewardAlice)
        let growthBob = rewardBob2.sub(rewardBob)
        expect(growthAlice).to.be.gte(growthBob)
        expect(growthAlice).to.be.lte(growthBob.mul(2))

        // wait
        await ethers.provider.send('evm_increaseTime', [YEAR / 2])
        await ethers.provider.send('evm_mine', [])

        // bob doubles stake
        await carp.connect(bob).upgradeStake(depositIndex, startAmount)

        // Bob's reward growth should be an equal Alice's reward growth
        const rewardAlice3 = await carp.getReward(alice.address, depositIndex)
        const rewardBob3 = await carp.getReward(bob.address, depositIndex)
        growthAlice = rewardAlice3.sub(rewardAlice2)
        growthBob = rewardBob3.sub(rewardBob2)
        expect(growthAlice).to.be.equal(growthBob)
    })
})
