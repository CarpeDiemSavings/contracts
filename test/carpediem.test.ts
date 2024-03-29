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
import {calculateBBonus, calculateLBonus} from "./shared/calculates"
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

describe('incorrect deployment', async() => {
    let token: any
    let factory: any
    let wallets: any

    beforeEach('deploy factory and token', async() => {
        const Token = await ethers.getContractFactory('Token')
        const Factory = await ethers.getContractFactory('CarpediemFactory')
        token = await Token.deploy(TOTALSUPPLY)
        factory = await Factory.deploy()
        wallets = [
            owner.address,
            charity.address,
            community.address
        ]
    })

    it('should deploy token correctly', async() => {
        expect(await token.balanceOf(owner.address)).to.be.equal(TOTALSUPPLY)
    })
    it('shouldnt deploy pool with zero token address', async() => {
        await expect(factory.createPool(ZERO_ADDRESS, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('token cannot be zero')
    })
    it('shouldnt create pool with zero initial share price', async() => {
        await expect(factory.createPool(token.address, 0, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('price cannot be zero')
    })
    it('shouldnt create pool with zero BBonus', async() => {
        await expect(factory.createPool(token.address, INITIAL_PRICE, 0, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('B bonus amount cannot be zero')
    })
    it('shouldnt create pool with zero LBonus', async() => {
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, 0, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('L bonus period cannot be zero')
    })

    it('shouldnt create pool with incorrect addresses array length', async() => {
        const wrongWallets = [
            other.address,
            DEAD_WALLET,
            owner.address,
            charity.address,
        ]
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wrongWallets)).to.be.reverted
    })

    it('shouldnt create pool with incorrect percents array length', async() => {
        const wrongPercents = [
            25,
            25,
            10,
            40
        ]
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, wrongPercents, wallets)).to.be.reverted
    })

    it('shouldnt create pool if at least one wallet is zero', async() => {
        const wrongWallets = [
            ZERO_ADDRESS,
            charity.address,
            community.address
        ]
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wrongWallets)).to.be.revertedWith('wallet cannot be == 0')
    })

    it('shouldnt create pool if percent sum != 100', async() => {
        const wrongPenaltyPercents = [50, 20, 10, 10, 9]

        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, wrongPenaltyPercents, wallets)).to.be.revertedWith('percent sum must be == 100')
    })
})

describe('test', async () => {
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

    describe('deployment through factory', async () => {
        beforeEach('deploy token and factory', async() => {
            ({factory, carp, token} = await loadFixture(fixture))
        })

        it('should correct create pool through factory', async() => {
            const poolAddress = await factory.allPools(0)
            expect(poolAddress).to.not.be.equal(ZERO_ADDRESS)
            const aliceBalance = await token.balanceOf(alice.address)

            const poolToken = await carp.token()
            expect(poolToken).to.be.equal(token.address)

            const factoryOwner = await factory.owner()

            const poolLambda = await carp.lambda()
            const poolTotalShares = await carp.totalShares()
            const poolCurrentPrice = await carp.currentPrice()
            const poolInitialPrice = await carp.initialPrice()
            const poolBBonusAmount = await carp.bBonusAmount()
            const poolLBonusPeriod = await carp.lBonusPeriod()
            const poolbBonusMaxPercent = await carp.bBonusMaxPercent()
            const poollBonusMaxPercent = await carp.lBonusMaxPercent()

            // const eventName = receipt.events[receipt.events.length - 1].event
            // const eventToken = receipt.events[receipt.events.length - 1].args.token
            // const eventPoolAddress = receipt.events[receipt.events.length - 1].args.poolAddress
            // const eventInitialPrice = receipt.events[receipt.events.length - 1].args.initialPrice
            // const eventBBonusAmount = receipt.events[receipt.events.length - 1].args.bBonusAmount
            // const eventLBonusPeriod = receipt.events[receipt.events.length - 1].args.lBonusPeriod
            // const eventBBonusMaxPercent = receipt.events[receipt.events.length - 1].args.bBonusMaxPercent
            // const eventLBonusMaxPercent = receipt.events[receipt.events.length - 1].args.lBonusMaxPercent


            expect(poolToken).to.be.equal(token.address)
            expect(poolLambda).to.be.equal(0)
            expect(poolTotalShares).to.be.equal(0)
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE)
            expect(poolBBonusAmount).to.be.equal(BBonus)
            expect(poolLBonusPeriod).to.be.equal(LBonus)
            expect(poollBonusMaxPercent).to.be.equal(LBonusMaxPercent)
            expect(poolbBonusMaxPercent).to.be.equal(BBonusMaxPercent)

            // expect(eventName).to.be.equal("NewPool")
            // expect(eventToken).to.be.equal(token.address)
            // expect(eventPoolAddress).to.be.equal(poolAddress)
            // expect(eventBBonusAmount).to.be.equal(BBonus)
            // expect(eventLBonusPeriod).to.be.equal(LBonus)
            // expect(eventInitialPrice).to.be.equal(INITIAL_PRICE)
            // expect(eventBBonusMaxPercent).to.be.equal(BBonusMaxPercent)
            // expect(eventLBonusMaxPercent).to.be.equal(LBonusMaxPercent)
        })

        it('should create several identical pools', async() => {
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)
            const pool0 = await factory.allPools(0)
            const pool1 = await factory.allPools(1)
            const pool2 = await factory.allPools(2)
            const pool3 = await factory.allPools(3)
            expect(pool0).to.not.be.equal(ZERO_ADDRESS)
            expect(pool1).to.not.be.equal(ZERO_ADDRESS)
            expect(pool2).to.not.be.equal(ZERO_ADDRESS)
            expect(pool3).to.not.be.equal(ZERO_ADDRESS)
            expect(await factory.allPoolsLength()).to.be.equal(4)
            expect(await factory.poolsByTokenLength(token.address)).to.be.equal(4)
            await expect(factory.allPools(4)).to.be.reverted
        })

    })

    describe('deposit tests', async() => {
        beforeEach('create pool', async() => {
            await loadFixture(fixture)
        })

        it('shouldnt deposit if amount is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1')
            const durationAlice = YEAR
            await token.connect(alice).approve(carp.address, aliceAmount)
            await expect(carp.connect(alice).deposit(0, durationAlice)).to.be.revertedWith('deposit cannot be zero')
        })

        it('shouldnt deposit if duration is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1')
            const durationAlice = YEAR
            await token.connect(alice).approve(carp.address, aliceAmount)
            await expect(carp.connect(alice).deposit(aliceAmount, 0)).to.be.revertedWith('duration cannot be zero')
        })

        it('should correct deposit', async() => {
            const poolAddress = await factory.allPools(0)
            expect(poolAddress).to.not.be.equal(ZERO_ADDRESS)

            const aliceAmount = ethers.utils.parseEther('1')
            const durationAlice = YEAR
            const aliceBalance = await token.balanceOf(alice.address)
            await token.connect(alice).approve(carp.address, aliceAmount)
            const tx = await carp.connect(alice).deposit(aliceAmount, durationAlice, {gasLimit: 1e6})
            const receipt = await tx.wait()
            const stakeInfo = await carp.stakes(alice.address, 0)
            const shares = stakeInfo.shares
            const lBonusShares = stakeInfo.lBonusShares
            const bBonusShares = stakeInfo.bBonusShares
            const lastLambda = stakeInfo.lastLambda
            const assignedReward = stakeInfo.assignedReward
            const amount = stakeInfo.amount
            const duration = stakeInfo.duration

            const poolLambda = await carp.lambda()
            const poolTotalShares = await carp.totalShares()
            const poolCurrentPrice = await carp.currentPrice()
            const poolInitialPrice = await carp.initialPrice()

            const eventName = receipt.events[receipt.events.length - 1].event
            const eventDepositor = receipt.events[receipt.events.length - 1].args.depositor
            const eventAmount = receipt.events[receipt.events.length - 1].args.amount
            const eventduration = receipt.events[receipt.events.length - 1].args.duration


            const s_alice = aliceAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, durationAlice))
            expect(shares).to.be.equal(s_alice)
            expect(amount).to.be.equal(aliceAmount)
            expect(lBonusShares).to.be.equal(calculateLBonus(s_alice, durationAlice))
            expect(bBonusShares).to.be.equal(calculateBBonus(s_alice, aliceAmount))
            expect(lastLambda).to.be.equal(0)
            expect(assignedReward).to.be.equal(0)
            expect(duration).to.be.equal(durationAlice)

            expect(poolLambda).to.be.equal(0)
            expect(poolTotalShares).to.be.equal(S_alice)
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE)

            expect(eventName).to.be.equal('Deposit')
            expect(eventDepositor).to.be.equal(alice.address)
            expect(eventAmount).to.be.equal(aliceAmount)
            expect(eventduration).to.be.equal(durationAlice)
        })

        it('should get maximum L bonus', async() => {
            const smallAmount = BigNumber.from('1')
            await token.connect(alice).approve(carp.address, smallAmount)
            const bigduration = 10 * YEAR
            await carp.connect(alice).deposit(smallAmount, bigduration)

            const stakeInfo = await carp.stakes(alice.address, 0)
            const userShares = stakeInfo.shares
            const lBonusShares = stakeInfo.lBonusShares
            const bBonusShares = stakeInfo.bBonusShares

            expect(userShares.add(lBonusShares).add(bBonusShares)).to.be.equal(userShares.mul(ONE.add(TWO)))
        })

        it('should get maximum B bonus', async() => {
            const bigAmount = ethers.utils.parseEther('100000')
            await token.connect(owner).approve(carp.address, bigAmount)
            const smallduration = 1
            await carp.connect(owner).deposit(bigAmount, smallduration)

            const stakeInfo = await carp.stakes(owner.address, 0)
            const userShares = stakeInfo.shares
            const lBonusShares = stakeInfo.lBonusShares
            const bBonusShares = stakeInfo.bBonusShares
            const userSharesWithBonuses = userShares.add(lBonusShares).add(bBonusShares)

            expect(userSharesWithBonuses.div(LAMBDA_COEF).div(LAMBDA_COEF)).to.be.equal((userShares.add(userShares.mul(TEN).div(HUN))).div(LAMBDA_COEF).div(LAMBDA_COEF))
        })

        it('should get maximum B and L bonuses', async() => {
            const bigAmount = ethers.utils.parseEther('100000')
            await token.connect(owner).approve(carp.address, bigAmount)
            const bigduration = 10 * YEAR
            await carp.connect(owner).deposit(bigAmount, bigduration)

            const stakeInfo = await carp.stakes(owner.address, 0)
            const userShares = stakeInfo.shares
            const lBonusShares = stakeInfo.lBonusShares
            const bBonusShares = stakeInfo.bBonusShares

            expect(lBonusShares.add(bBonusShares)).to.be.equal((userShares.mul(TEN).div(HUN)).add(userShares.mul(TWO)))
        })

        it('should correct calculate enormous new price', async() => {
            const withdrawer = accounts[10]
            const raiser = accounts[11]
            const amountWithdrawer = ethers.utils.parseEther('20000000000000')
            const amountRaiser = ethers.utils.parseEther('1')
            const durationWithdrawer = BigNumber.from(10 * YEAR)
            const durationRaiser = YEAR
            await token.transfer(withdrawer.address, amountWithdrawer)
            await token.transfer(raiser.address, amountRaiser)
            await token.connect(withdrawer).approve(carp.address, amountWithdrawer)
            await token.connect(raiser).approve(carp.address, amountRaiser)
            const txDeposit = await carp.connect(withdrawer).deposit(amountWithdrawer, durationWithdrawer)
            const shares_withdrawer = amountWithdrawer.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const Shares_withdrawer = shares_withdrawer.add(calculateBBonus(shares_withdrawer, amountWithdrawer)).add(calculateLBonus(shares_withdrawer, durationWithdrawer))

            const receiptDeposit = await txDeposit.wait()
            const depositBlock = await receiptDeposit.events[receiptDeposit.events.length - 1].getBlock()
            const timestampDeposit = depositBlock.timestamp
            await carp.connect(raiser).deposit(amountRaiser, durationRaiser)
            const shares_raiser = amountRaiser.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const Shares_raiser = shares_raiser.add(calculateBBonus(shares_raiser, amountRaiser)).add(calculateLBonus(shares_raiser, durationRaiser))
            const txWithdraw = await carp.connect(withdrawer).withdraw(0)
            const receiptWithdraw = await txDeposit.wait()
            const withdrawBlock = await receiptWithdraw.events[receiptWithdraw.events.length - 1].getBlock()
            const timestampWithdraw = withdrawBlock.timestamp
            const penalty = amountWithdrawer.mul(durationWithdrawer.sub(timestampWithdraw).add(timestampDeposit)).div(durationWithdrawer).mul(INTEREST_PERCENT).div(HUN)
            await ethers.provider.send('evm_increaseTime', [durationRaiser])

            await carp.connect(raiser).withdraw(0)
            const raiserIncome = penalty.add(amountRaiser)

            const newPrice = await carp.currentPrice()
            expect(newPrice).to.be.equal(BigNumber.from('1000000000000').mul(LAMBDA_COEF))
        })

        it('should correct deposit for 3 users', async() => {
            const aliceAmount = ethers.utils.parseEther('1')
            const bobAmount = ethers.utils.parseEther('2')
            const charlieAmount = ethers.utils.parseEther('4')
            const durationAlice = YEAR
            const durationBob = BigNumber.from(YEAR).mul(TWO)
            const durationCharlie = BigNumber.from(YEAR).mul(TWO).mul(TWO)
            await token.connect(alice).approve(carp.address, aliceAmount)
            await token.connect(bob).approve(carp.address, bobAmount)
            await token.connect(charlie).approve(carp.address, charlieAmount)
            await carp.connect(alice).deposit(aliceAmount, durationAlice)
            await carp.connect(bob).deposit(bobAmount, durationBob)
            await carp.connect(charlie).deposit(charlieAmount, durationCharlie)

            const poolLambda = await carp.lambda()
            const poolTotalShares = await carp.totalShares()
            const poolCurrentPrice = await carp.currentPrice()
            const poolInitialPrice = await carp.initialPrice()


            const s_alice = aliceAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const s_bob = bobAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const s_charlie = charlieAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, durationAlice))
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, durationBob))
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, durationCharlie))


            expect(poolLambda).to.be.equal(0)
            expect(poolTotalShares).to.be.equal(S_alice.add(S_bob).add(S_charlie))
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE)
        })

        it('shouldnt upgradeStake if there is such id', async() => {
            const durationBeforeAliceExtra = 0.1*YEAR
            await ethers.provider.send('evm_increaseTime', [durationBeforeAliceExtra])
            const extraAmount = ethers.utils.parseEther('10')
            await expect(carp.connect(alice).upgradeStake(extraAmount, 1)).to.be.revertedWith('no such stake id')
        })

        describe('withdraw tests', async() => {
            const aliceAmount = ethers.utils.parseEther('1')
            const bobAmount = ethers.utils.parseEther('2')
            const charlieAmount = ethers.utils.parseEther('4')
            const durationAlice = YEAR
            const durationBob = BigNumber.from(YEAR).mul(TWO)
            const durationCharlie = BigNumber.from(YEAR).mul(TWO).mul(TWO)

            const s_alice = aliceAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const s_bob = bobAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const s_charlie = charlieAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, durationAlice))
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, durationBob))
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, durationCharlie))

            let bobTs: any

            beforeEach('several deposits', async() => {
                await token.connect(alice).approve(carp.address, aliceAmount)
                await token.connect(bob).approve(carp.address, bobAmount)
                await token.connect(charlie).approve(carp.address, charlieAmount)
                await carp.connect(alice).deposit(aliceAmount, durationAlice)
                const tx = await carp.connect(bob).deposit(bobAmount, durationBob)
                const receipt = await tx.wait()

                const block = await receipt.events[0].getBlock()
                bobTs = BigNumber.from(block.timestamp)
                await carp.connect(charlie).deposit(charlieAmount, durationCharlie)
            })

            it('should correct show users penalty', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address)
                const stakeInfo = await carp.stakes(bob.address, 0)
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR])
                const penalty = await carp.getPenalty(bob.address, 0)
                const stakeTs = stakeInfo.startTs

                const bobBalanceAfter = await token.balanceOf(bob.address)
                const totalPenalty = bobAmount.mul(durationBob.sub(bobTs.add(ONE)).add(stakeTs)).div(durationBob)
                expect(penalty).to.be.equal(totalPenalty)
            })

            it('shouldnt withdraw if already withdrawn', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR])
                await carp.connect(bob).withdraw(0)
                await expect(carp.connect(bob).withdraw(0)).to.be.revertedWith('stake was deleted')
            })

            it('shouldnt withdraw unexisting stake', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR])
                await expect(carp.connect(bob).withdraw(1)).to.be.revertedWith('no such stake id')
            })

            it('bob early withdraws', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address)
                const stakeInfo = await carp.stakes(bob.address, 0)
                const stakeTs = stakeInfo.startTs
                let charityBalanceBefore = await token.balanceOf(charity.address)
                let communityBalanceBefore = await token.balanceOf(community.address)
                let ownerBalanceBefore = await token.balanceOf(owner.address)
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET)
                let contractBalanceBefore = await token.balanceOf(carp.address)
                expect(charityBalanceBefore).to.be.equal(0)
                expect(communityBalanceBefore).to.be.equal(0)
                expect(burnBalanceBefore).to.be.equal(0)
                expect(contractBalanceBefore).to.be.equal(aliceAmount.add(bobAmount).add(charlieAmount))
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR])
                const tx = await carp.connect(bob).withdraw(0)
                const receipt = await tx.wait()
                const bobBalanceAfter = await token.balanceOf(bob.address)
                const block = await receipt.events[0].getBlock()
                const ts = BigNumber.from(block.timestamp)
                const totalPenalty = bobAmount.mul(durationBob.sub(ts).add(stakeTs)).div(durationBob)
                const charityPenalty = totalPenalty.mul(CHARITY_PERCENT).div(PERCENT_BASE)
                const communityPenalty = totalPenalty.mul(COMMUNITY_PERCENT).div(PERCENT_BASE)
                const ownerPenalty = totalPenalty.mul(OWNER_PERCENT).div(PERCENT_BASE)
                const burnPenalty = totalPenalty.mul(BURN_PERCENT).div(PERCENT_BASE)
                const penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE)

                const poolLambda = await carp.lambda()
                const poolTotalShares = await carp.totalShares()
                const poolCurrentPrice = await carp.currentPrice()
                const poolInitialPrice = await carp.initialPrice()

                const eventName = receipt.events[receipt.events.length - 1].event
                const eventWho = receipt.events[receipt.events.length - 1].args.who
                const eventDeposit = receipt.events[receipt.events.length - 1].args.deposit
                const eventReward = receipt.events[receipt.events.length - 1].args.reward
                const eventPenalty = receipt.events[receipt.events.length - 1].args.penalty

                await carp.connect(owner).distributePenalty()

                let charityBalanceAfter = await token.balanceOf(charity.address)
                let communityBalanceAfter = await token.balanceOf(community.address)
                let ownerBalanceAfter = await token.balanceOf(owner.address)
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET)
                let contractBalanceAfter = await token.balanceOf(carp.address)

                const totalShares = S_alice.add(S_charlie)

                expect(poolLambda).to.be.equal(penaltyToPool.mul(LAMBDA_COEF).div(totalShares))
                expect(poolTotalShares).to.be.equal(totalShares)
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE)

                expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.equal(bobAmount.sub(totalPenalty))
                expect(charityBalanceAfter.sub(charityBalanceBefore)).to.be.equal(charityPenalty)
                expect(communityBalanceAfter.sub(communityBalanceBefore)).to.be.equal(communityPenalty)
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.equal(ownerPenalty)
                expect(burnBalanceAfter.sub(burnBalanceBefore)).to.be.equal(burnPenalty)
                expect(contractBalanceBefore.sub(contractBalanceAfter).div(HUN)).to.be.equal(bobAmount.sub(penaltyToPool).div(HUN))

                const aliceReward = await carp.getReward(alice.address, 0)
                const bobReward = await carp.getReward(bob.address, 0)
                const charlieReward = await carp.getReward(charlie.address, 0)

                expect(aliceReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares).div(TEN))
                expect(charlieReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_charlie).div(totalShares).div(TEN))
                expect(bobReward.div(TEN)).to.be.equal(0)

                expect(eventName).to.be.equal('Withdraw')
                expect(eventWho).to.be.equal(bob.address)
                expect(eventDeposit).to.be.equal(bobAmount)
                expect(eventReward).to.be.equal(0)
                expect(eventPenalty).to.be.equal(totalPenalty)
            })

            it('bob withdraw after stake matured', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address)
                const stakeInfo = await carp.stakes(bob.address, 0)
                const stakeTs = stakeInfo.startTs
                let charityBalanceBefore = await token.balanceOf(charity.address)
                let communityBalanceBefore = await token.balanceOf(community.address)
                let ownerBalanceBefore = await token.balanceOf(owner.address)
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET)
                await ethers.provider.send('evm_increaseTime', [+durationBob.toString()])
                const tx = await carp.connect(bob).withdraw(0)
                const receipt = await tx.wait()
                const bobBalanceAfter = await token.balanceOf(bob.address)
                const block = await receipt.events[0].getBlock()
                const ts = BigNumber.from(block.timestamp)

                const poolLambda = await carp.lambda()
                const poolTotalShares = await carp.totalShares()
                const poolCurrentPrice = await carp.currentPrice()
                const poolInitialPrice = await carp.initialPrice()


                let charityBalanceAfter = await token.balanceOf(charity.address)
                let communityBalanceAfter = await token.balanceOf(community.address)
                let ownerBalanceAfter = await token.balanceOf(owner.address)
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET)

                const totalShares = S_alice.add(S_charlie)

                expect(poolLambda).to.be.equal(0)
                expect(poolTotalShares).to.be.equal(totalShares)
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE)
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE)

                expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.equal(bobAmount)
                expect(charityBalanceAfter.sub(charityBalanceBefore)).to.be.equal(0)
                expect(communityBalanceAfter.sub(communityBalanceBefore)).to.be.equal(0)
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.equal(0)
                expect(burnBalanceAfter.sub(burnBalanceBefore)).to.be.equal(0)

                const aliceReward = await carp.getReward(alice.address, 0)
                const bobReward = await carp.getReward(bob.address, 0)
                const charlieReward = await carp.getReward(charlie.address, 0)

                expect(aliceReward).to.be.equal(0)
                expect(charlieReward).to.be.equal(0)
                expect(bobReward).to.be.equal(0)
            })

            it('shouldnt give darwin reward for bobs early withdraw if darwin came after ', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR])
                await carp.connect(bob).withdraw(0)
                const darwinAmount = ethers.utils.parseEther('1')
                const durationDarwin = YEAR
                await ethers.provider.send('evm_increaseTime', [durationDarwin])
                await token.connect(darwin).approve(carp.address, darwinAmount)
                await carp.connect(darwin).deposit(darwinAmount, durationDarwin)
                const darwinReward = await carp.getReward(darwin.address, 0)
                expect(darwinReward.div(TEN)).to.be.equal(0)
            })

            it('should give darwin reward if bob early withdraws, darwin came after and charlie early withdraw', async() => {
                const stakeInfo = await carp.stakes(bob.address, 0)
                // const amount = stake.amount
                const stakeTs = stakeInfo.startTs
                let charityBalanceBefore = await token.balanceOf(charity.address)
                let communityBalanceBefore = await token.balanceOf(community.address)
                let ownerBalanceBefore = await token.balanceOf(owner.address)
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET)
                expect(charityBalanceBefore).to.be.equal(0)
                expect(communityBalanceBefore).to.be.equal(0)
                expect(burnBalanceBefore).to.be.equal(0)
                const durationBeforeBobWithdraw = 1.5*YEAR
                await ethers.provider.send('evm_increaseTime', [durationBeforeBobWithdraw])
                const tx = await carp.connect(bob).withdraw(0)
                await carp.connect(owner).distributePenalty()

                const receipt = await tx.wait()
                const block = await receipt.events[0].getBlock()
                const ts = BigNumber.from(block.timestamp)
                const totalPenalty = bobAmount.mul(durationBob.sub(ts).add(stakeTs)).div(durationBob)
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE)


                let charityBalanceAfter = await token.balanceOf(charity.address)
                let communityBalanceAfter = await token.balanceOf(community.address)
                let ownerBalanceAfter = await token.balanceOf(owner.address)
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET)

                const totalShares = S_alice.add(S_charlie)


                const darwinAmount = ethers.utils.parseEther('1')
                const durationDarwin = YEAR

                await token.connect(darwin).approve(carp.address, darwinAmount)
                await carp.connect(darwin).deposit(darwinAmount, durationDarwin)

                const s_darwin = darwinAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE)
                const S_darwin = s_darwin.add(calculateBBonus(s_darwin, darwinAmount)).add(calculateLBonus(s_darwin, durationDarwin))


                const durationBeforeCharlieWithdraw = YEAR
                await ethers.provider.send('evm_increaseTime', [durationBeforeCharlieWithdraw])


                const charlieBalanceBefore = await token.balanceOf(charlie.address)
                const charlieStake = await carp.stakes(charlie.address, 0)
                const charlieStakeTs = charlieStake.startTs

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares)

                const charlieTx = await carp.connect(charlie).withdraw(0)

                const charlieTotalShares = S_alice.add(S_darwin)

                const charlieReceipt = await charlieTx.wait()
                const charlieBalanceAfter = await token.balanceOf(charlie.address)
                const charlieBlock = await charlieReceipt.events[0].getBlock()
                const charlieTs = BigNumber.from(charlieBlock.timestamp)

                const charlieTotalPenalty = (charlieAmount.add(charlieRewardBefore)).mul(durationCharlie.sub(charlieTs).add(charlieStakeTs)).div(durationCharlie)
                const charlieCharityPenalty = charlieTotalPenalty.mul(CHARITY_PERCENT).div(PERCENT_BASE)
                const charlieCommunityPenalty = charlieTotalPenalty.mul(COMMUNITY_PERCENT).div(PERCENT_BASE)
                const charlieOwnerPenalty = charlieTotalPenalty.mul(OWNER_PERCENT).div(PERCENT_BASE)
                const charlieBurnPenalty = charlieTotalPenalty.mul(BURN_PERCENT).div(PERCENT_BASE)
                const charliePenaltyToPool = charlieTotalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE)

                await carp.connect(owner).distributePenalty()

                let charlieCharityBalanceAfter = await token.balanceOf(charity.address)
                let charlieCommunityBalanceAfter = await token.balanceOf(community.address)
                let charlieOwnerBalanceAfter = await token.balanceOf(owner.address)
                let charlieBurnBalanceAfter = await token.balanceOf(DEAD_WALLET)

                const poolLambdaAfter = await carp.lambda()
                const poolTotalSharesAfter = await carp.totalShares()
                const poolCurrentPriceAfter = await carp.currentPrice()
                const poolInitialPriceAfter = await carp.initialPrice()

                expect(poolLambdaAfter).to.be.equal((
                    penaltyToPoolBefore.mul(LAMBDA_COEF).div(totalShares)).add(
                    charliePenaltyToPool.mul(LAMBDA_COEF).div(charlieTotalShares)
                ))

                expect(poolTotalSharesAfter).to.be.equal(charlieTotalShares)
                expect(poolInitialPriceAfter).to.be.equal(INITIAL_PRICE)

                expect(charlieCharityBalanceAfter.sub(charityBalanceAfter)).to.be.equal(charlieCharityPenalty)
                expect(charlieCommunityBalanceAfter.sub(communityBalanceAfter)).to.be.equal(charlieCommunityPenalty)
                expect(charlieOwnerBalanceAfter.sub(ownerBalanceAfter)).to.be.equal(charlieOwnerPenalty)
                expect((charlieBurnBalanceAfter.sub(burnBalanceAfter)).div(HUN)).to.be.equal(charlieBurnPenalty.div(HUN))

                const aliceReward = await carp.getReward(alice.address, 0)
                const bobReward = await carp.getReward(bob.address, 0)
                const charlieReward = await carp.getReward(charlie.address, 0)
                const darwinReward = await carp.getReward(darwin.address, 0)

                expect(aliceReward.div(HUN)).to.be.equal(
                    (penaltyToPoolBefore.mul(S_alice).div(totalShares).add(
                        charliePenaltyToPool.mul(S_alice).div(charlieTotalShares)).div(HUN)
                    ))
                expect(charlieRewardBefore.div(TEN)).to.be.equal(penaltyToPoolBefore.mul(S_charlie).div(totalShares).div(TEN))
                expect(darwinReward.div(HUN)).to.be.equal(charliePenaltyToPool.mul(S_darwin).div(charlieTotalShares).div(HUN))
                expect(bobReward.div(TEN)).to.be.equal(0)
                expect(charlieReward.div(TEN)).to.be.equal(0)
            })

            it('should correct calculate new price ', async() => {
                const stakeInfo = await carp.stakes(bob.address, 0)
                const stakeTs = stakeInfo.startTs

                const durationBeforeBobWithdraw = 1.5*YEAR
                await ethers.provider.send('evm_increaseTime', [durationBeforeBobWithdraw])
                const tx = await carp.connect(bob).withdraw(0)

                const receipt = await tx.wait()
                const block = await receipt.events[0].getBlock()
                const ts = BigNumber.from(block.timestamp)
                const totalPenalty = bobAmount.mul(durationBob.sub(ts).add(stakeTs)).div(durationBob)
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE)
                const durationBeforeCharlieWithdraw = 2.5*YEAR

                await ethers.provider.send('evm_increaseTime', [durationBeforeCharlieWithdraw])

                const totalShares = S_charlie.add(S_alice)

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares)
                const charlieStake = await carp.stakes(charlie.address, 0)
                const charlieStakeAmount = charlieStake.amount

                await carp.connect(charlie).withdraw(0)
                const poolCurrentPriceAfter = await carp.currentPrice()

                const ecpectedPriceAfter = (charlieRewardBefore.add(charlieStakeAmount)).mul(LAMBDA_COEF).div(s_charlie)
                expect(poolCurrentPriceAfter).to.be.gte(ecpectedPriceAfter.sub(1))
                expect(poolCurrentPriceAfter).to.be.lte(ecpectedPriceAfter.add(1))
            })

            describe('upgradeStake tests', async() => {
                const durationBeforeBobWithdraw = 0.5*YEAR
                let totalShares: any
                let lastLambda: any
                let penaltyToPool: any

                beforeEach('bob replenishes the pool', async() => {
                    await ethers.provider.send('evm_increaseTime', [durationBeforeBobWithdraw])
                    const stakeInfo = await carp.stakes(bob.address, 0)

                    const tx = await carp.connect(bob).withdraw(0)
                    totalShares = S_alice.add(S_charlie)
                    const stakeTs = stakeInfo.startTs

                    const receipt = await tx.wait()
                    const block = await receipt.events[0].getBlock()
                    const ts = BigNumber.from(block.timestamp)
                    const totalPenalty = bobAmount.mul(durationBob.sub(ts).add(stakeTs)).div(durationBob)

                    penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE)
                    lastLambda = penaltyToPool.mul(LAMBDA_COEF).div(totalShares)

                })

                it('shouldnt upgrade stake if extra deposit is zero', async() => {
                    const durationBeforeAliceExtra = 0.1*YEAR
                    await ethers.provider.send('evm_increaseTime', [durationBeforeAliceExtra])
                    await expect(carp.connect(alice).upgradeStake(0, 0)).to.be.revertedWith('deposit cannot be zero')
                })
                it('shouldnt upgrade stake if stake matured', async() => {
                    const durationBeforeAliceExtra = 2 * YEAR
                    await ethers.provider.send('evm_increaseTime', [durationBeforeAliceExtra])
                    const extraAmount = ethers.utils.parseEther('10')
                    await expect(carp.connect(alice).upgradeStake(0, extraAmount)).to.be.revertedWith('stake matured')
                })
                it('shouldnt upgrade stake if stake was deleted (withdraw)', async() => {
                    const durationBeforeAliceExtra = 2 * YEAR
                    await ethers.provider.send('evm_increaseTime', [durationBeforeAliceExtra])
                    const extraAmount = ethers.utils.parseEther('10')
                    await carp.connect(alice).withdraw(0)

                    await expect(carp.connect(alice).upgradeStake(0, extraAmount)).to.be.revertedWith('stake was deleted')
                })

                it('should correct upgrade stake', async() => {
                    const stakeInfoBefore = await carp.stakes(alice.address, 0)
                    const sharesWithBonusesBefore = (stakeInfoBefore.shares).add(
                        stakeInfoBefore.lBonusShares
                    ).add(
                        stakeInfoBefore.bBonusShares
                    )
                    const oldPoolTotalShares = await carp.totalShares()
                    const durationBeforeAliceExtra = 0.1*YEAR
                    await ethers.provider.send('evm_increaseTime', [durationBeforeAliceExtra])
                    const extraAmount = ethers.utils.parseEther('10')
                    await token.connect(alice).approve(carp.address, extraAmount)
                    const tx = await carp.connect(alice).upgradeStake(0, extraAmount)
                    const receipt = await tx.wait()
                    const block = await receipt.events[0].getBlock()
                    const timestamp = block.timestamp
                    const stakeInfo = await carp.stakes(alice.address, 0)
                    const userShares = stakeInfo.shares
                    const lBonusShares = stakeInfo.lBonusShares
                    const bBonusShares = stakeInfo.bBonusShares
                    const userSharesWithBonuses = userShares.add(lBonusShares).add(bBonusShares)
                    const userLastLambda = stakeInfo.lastLambda
                    const userAssignedReward = stakeInfo.assignedReward

                    const stakeAmount = stakeInfo.amount
                    const stakeduration = stakeInfo.duration
                    const stakeTs = BigNumber.from(stakeInfo.startTs)

                    const poolTotalShares = await carp.totalShares()

                    const eventName = receipt.events[receipt.events.length - 1].event
                    const eventDepositor = receipt.events[receipt.events.length - 1].args.depositor
                    const eventAmount = receipt.events[receipt.events.length - 1].args.amount
                    const eventduration = receipt.events[receipt.events.length - 1].args.duration

                    const shares = extraAmount.mul(LAMBDA_COEF).div(INITIAL_PRICE).add(s_alice)
                    const sharesWithBonuses = shares.add(
                        calculateBBonus(shares, aliceAmount.add(extraAmount))
                    ).add(
                        calculateLBonus(extraAmount, stakeTs.add(stakeduration).sub(timestamp))
                    ).add(stakeInfoBefore.lBonusShares)
                    const calculatedUserAssignedReward = penaltyToPool
                        .mul(sharesWithBonusesBefore)
                        .div(oldPoolTotalShares)

                    expect(userShares).to.be.equal(shares)
                    expect(userSharesWithBonuses).to.be.equal(sharesWithBonuses)
                    expect(userLastLambda).to.be.equal(lastLambda)
                    expect(userAssignedReward).to.be.gte(calculatedUserAssignedReward.sub(1))
                    expect(userAssignedReward).to.be.lte(calculatedUserAssignedReward.add(1))
                    expect(stakeAmount).to.be.equal(aliceAmount.add(extraAmount))
                    expect(poolTotalShares).to.be.equal(S_charlie.add(sharesWithBonuses))

                    expect(eventName).to.be.equal('StakeUpgraded')
                    expect(eventDepositor).to.be.equal(alice.address)
                    expect(eventAmount).to.be.equal(extraAmount)
                    expect(eventduration).to.be.equal(stakeTs.add(stakeduration).sub(timestamp))
                })

                describe('late reward tests', async() => {
                    it('should correct calculate penalty if claimed late ', async() => {
                        const lateWeeks = 2
                        const bigLateWeeks = BigNumber.from(lateWeeks)
                        const durationBeforeCharlieWithdraw = 3.5*YEAR + lateWeeks*WEEK
                        await ethers.provider.send('evm_increaseTime', [durationBeforeCharlieWithdraw])
                        const charlieBalanceBefore = await token.balanceOf(charlie.address)
                        const tx = await carp.connect(charlie).withdraw(0)
                        const charlieBalanceAfter = await token.balanceOf(charlie.address)

                        const receipt = await tx.wait()
                        const block = await receipt.events[0].getBlock()

                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares)
                        const charlieIncome = charlieAmount.add(charlieReward)
                        const latePenalty = charlieReward.mul(PENALTY_PERCENT_PER_WEEK).mul(bigLateWeeks).div(PERCENT_BASE)
                        const charlieProfit = charlieIncome.sub(latePenalty)

                        expect(charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN)).to.be.equal(charlieProfit.div(HUN))
                    })

                    it('shouldnt take penalty if claimed in free late period (1 week)', async() => {

                        const latePeriod = 6*DAY
                        const durationBeforeCharlieWithdraw = 3.5*YEAR + latePeriod
                        await ethers.provider.send('evm_increaseTime', [durationBeforeCharlieWithdraw])
                        const charlieBalanceBefore = await token.balanceOf(charlie.address)
                        await carp.connect(charlie).withdraw(0)
                        const charlieBalanceAfter = await token.balanceOf(charlie.address)
                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares)
                        const charlieIncome = charlieAmount.add(charlieReward)

                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieIncome.div(HUN))
                    })

                    it('should withdraw only deposit if claim is too late', async() => {
                        const latePeriod = 51*WEEK
                        const durationBeforeCharlieWithdraw = 3.5*YEAR + latePeriod
                        await ethers.provider.send('evm_increaseTime', [durationBeforeCharlieWithdraw])
                        const charlieBalanceBefore = await token.balanceOf(charlie.address)
                        await carp.connect(charlie).withdraw(0)
                        const charlieBalanceAfter = await token.balanceOf(charlie.address)

                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieAmount.div(HUN))
                    })

                    describe("dead stake tests", async() => {
                        const mike = accounts[8]
                        const simon = accounts[9]
                        const mikeAmount = ethers.utils.parseEther('1')
                        const mikeDuration = YEAR
                        const simonAmount = ethers.utils.parseEther('1')
                        const simonDuration = YEAR
                        let mikeBalanceBefore = BigNumber.from('0')
                        let totalSharesBefore = BigNumber.from('0')

                        beforeEach('mike deposits', async() => {
                            mikeBalanceBefore = await token.balanceOf(mike.address)
                            totalSharesBefore = await carp.totalShares()
                            await token.connect(mike).approve(carp.address, mikeAmount)
                            await token.connect(simon).approve(carp.address, simonAmount)
                            await carp.connect(mike).deposit(mikeAmount, mikeDuration)
                            await carp.connect(simon).deposit(simonAmount, simonDuration)
                            let simonLambdaBefore = await carp.lambda()
                            await carp.connect(simon).withdraw(0)
                            let simonLambdaAfter = await carp.lambda()

                            // Lambda should grow before removing dead stake
                            expect(simonLambdaAfter.gt(simonLambdaBefore)).to.be.true
                        })

                        it('shouldn\'t remove stake before it\'s dead', async() => {
                            await expect(carp.connect(simon).removeDeadStake(mike.address, 0)).to.be.revertedWith('stakeAlive')
                        })

                        it('should remove stake after it\'s dead', async() => {
                            let mikeLambdaBefore = await carp.lambda()
                            await ethers.provider.send('evm_increaseTime', [3 * YEAR])
                            await carp.connect(simon).removeDeadStake(mike.address, 0)
                            let mikeTotalShares = await carp.totalShares()
                            let mikeLambdaAfter = await carp.lambda()

                            expect(await token.balanceOf(mike.address)).to.be.equal(mikeBalanceBefore)
                            expect(mikeTotalShares).to.be.equal(totalSharesBefore)
                            expect((await carp.stakes(mike.address, 0)).amount).to.be.equal(0)
                            expect(mikeLambdaAfter.gt(mikeLambdaBefore)).to.be.true
                        })
                    })
                })
            })
        })
    })
})
