import { ethers, waffle } from 'hardhat'
import { BigNumber, BigNumberish, constants, utils } from 'ethers'
import { expect } from 'chai'
import chai  from 'chai'
import { BN } from 'ethereumjs-util';
import { AbiCoder } from 'ethers/lib/utils';
// import time from '@openzeppelin/test-helpers';
// import { time } from "@openzeppelin/test-helpers";
// declare function func1(duration: any): any;

chai.use(require('chai-bignumber')());

const ONE = BigNumber.from('1');
const TWO = BigNumber.from('2');
const TEN = BigNumber.from('10');
const DEAD_WALLET = '0x000000000000000000000000000000000000dEaD';
const TOTALSUPPLY = ethers.utils.parseEther('1000000');
const DAY = 86400;
const YEAR = DAY * 365;
const LBonus = 10 * YEAR;
const LBonusMaxPercent = 200;
const BBonus = 100000;
const BBonusMaxPercent = 10;
const PERCENT_BASE = 100;
const INTEREST_PERCENT = 50;
const INITIAL_PRICE = 1;

const BURN_PERCENT = 20;
const CHARITY_PERCENT = 10;
const COMMUNITY_PERCENT = 10;
const OWNER_PERCENT = 10;

const LAMBDA_COEF = ethers.utils.parseEther('1');



let token: any;
let carp: any;

function calculateBBonus(shares: any, amount: any) {
    if (amount < BBonus) return shares.mul(BBonusMaxPercent).mul(amount).div(BBonus).div(PERCENT_BASE);
    return BigNumber.from(BBonusMaxPercent).mul(shares).div(PERCENT_BASE);
}

function calculateLBonus(shares: any, term: any) {
    if (term < LBonus) return shares.mul(LBonusMaxPercent).mul(term).div(LBonus).div(PERCENT_BASE);
    return BigNumber.from(LBonusMaxPercent).mul(shares).div(PERCENT_BASE);
}


describe('test', async () => {
    const accounts = waffle.provider.getWallets()
    const owner = accounts[0];
    const charity = accounts[1];
    const community = accounts[2];
    const alice = accounts[3];
    const bob = accounts[4];
    const charlie = accounts[5];
    beforeEach('deployment', async() => {
        const Token = await ethers.getContractFactory('Token');
        const Carpediem = await ethers.getContractFactory('Carpediem');
        token = await Token.deploy(TOTALSUPPLY);
        carp = await Carpediem.deploy(charity.address, community.address, owner.address);
        await token.transfer(alice.address, ethers.utils.parseEther('100'))
        await token.transfer(bob.address, ethers.utils.parseEther('100'))
        await token.transfer(charlie.address, ethers.utils.parseEther('100'))
    })
    it('should get wallets', async() => {
        const charityWallet = await carp.charityWallet();
        const communityWallet = await carp.communityWallet();
        const ownerWallet = await carp.ownerWallet();
        expect(charityWallet).to.be.equal(charity.address);
        expect(communityWallet).to.be.equal(community.address);
        expect(ownerWallet).to.be.equal(owner.address);
    })

    it('should correctly create poll', async() => {
        const tx = await carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus);
        const receipt = await tx.wait();
        const numberOfPools = await carp.numberOfPools();
        const pool = await carp.pools(token.address);
        const poolToken = pool.token;
        const poolLambda = pool.lambda;
        const poolTotalShares = pool.totalShares;
        const poolCurrentPrice = pool.currentPrice;
        const poolInitialPrice = pool.initialPrice;
        const poolBBonusAmount = pool.bBonusAmount;
        const poolLBonusPeriod= pool.lBonusPeriod;
        const eventName = receipt.events[0].event;
        const eventToken = receipt.events[0].args.token;
        const eventInitialPrice = receipt.events[0].args.initialPrice;
        const eventbBonusAmount = receipt.events[0].args.bBonusAmount;
        const eventlBonusPeriod = receipt.events[0].args.lBonusPeriod;

        expect(numberOfPools).to.be.equal(1);
        expect(poolToken).to.be.equal(token.address);
        expect(poolLambda).to.be.equal(0);
        expect(poolTotalShares).to.be.equal(0);
        expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
        expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);
        expect(poolBBonusAmount).to.be.equal(BBonus);
        expect(poolLBonusPeriod).to.be.equal(LBonus);
        
        expect(eventToken).to.be.equal(token.address);
        expect(eventInitialPrice).to.be.equal(INITIAL_PRICE);
        expect(eventbBonusAmount).to.be.equal(BBonus);
        expect(eventlBonusPeriod).to.be.equal(LBonus);
        expect(eventName).to.be.equal("NewPool");

    })

    describe('deposit tests', async() => {
        beforeEach('create pool', async() => {
            await carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus);
        })
        it('should correct deposit', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            const tx = await carp.connect(alice).deposit(token.address, aliceAmount, termAlice);
            const receipt = await tx.wait();
            const userInfo = await carp.users(token.address, alice.address);
            const shares = userInfo.shares;
            const sharesWithBonuses = userInfo.sharesWithBonuses;
            const lastLambda = userInfo.lastLambda;
            const assignedReward = userInfo.assignedReward;
            const stake = userInfo.stake;
            const amount = stake.amount;
            const term = stake.term;

            const pool = await carp.pools(token.address);
            const poolLambda = pool.lambda;
            const poolTotalShares = pool.totalShares;
            const poolCurrentPrice = pool.currentPrice;
            const poolInitialPrice = pool.initialPrice;

            const s_alice = aliceAmount.div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
            console.log(S_alice.toString());
            console.log(calculateBBonus(s_alice, aliceAmount).toString());
            console.log(calculateLBonus(s_alice, termAlice).toString());
            expect(shares).to.be.equal(s_alice);
            expect(amount).to.be.equal(aliceAmount);
            expect(sharesWithBonuses).to.be.equal(S_alice);
            expect(lastLambda).to.be.equal(0);
            expect(assignedReward).to.be.equal(0);
            expect(term).to.be.equal(termAlice);

            expect(poolLambda).to.be.equal(0);
            expect(poolTotalShares).to.be.equal(S_alice);
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);

        })

        it('should correct deposit for 3 users', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const bobAmount = ethers.utils.parseEther('2');
            const charlieAmount = ethers.utils.parseEther('4');
            const termAlice = YEAR;
            const termBob = BigNumber.from(YEAR).mul(TWO);
            const termCharlie = BigNumber.from(YEAR).mul(TWO).mul(TWO);
            await token.connect(alice).approve(carp.address, aliceAmount);
            await token.connect(bob).approve(carp.address, bobAmount);
            await token.connect(charlie).approve(carp.address, charlieAmount);
            await carp.connect(alice).deposit(token.address, aliceAmount, termAlice);
            await carp.connect(bob).deposit(token.address, bobAmount, termBob);
            await carp.connect(charlie).deposit(token.address, charlieAmount, termCharlie);

            const pool = await carp.pools(token.address);
            const poolLambda = pool.lambda;
            const poolTotalShares = pool.totalShares;
            const poolCurrentPrice = pool.currentPrice;
            const poolInitialPrice = pool.initialPrice;


            const s_alice = aliceAmount.div(INITIAL_PRICE);
            const s_bob = bobAmount.div(INITIAL_PRICE);
            const s_charlie = charlieAmount.div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, termBob));
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, termCharlie));
            
            console.log("S_alice:   ", S_alice.toString());
            console.log("S_bob:     ", S_bob.toString());
            console.log("S_charlie: ", S_charlie.toString());

            expect(poolLambda).to.be.equal(0);
            expect(poolTotalShares).to.be.equal(S_alice.add(S_bob).add(S_charlie));
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);

        })

        describe('withdraw tests', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const bobAmount = ethers.utils.parseEther('2');
            const charlieAmount = ethers.utils.parseEther('4');
            const termAlice = YEAR;
            const termBob = BigNumber.from(YEAR).mul(TWO);
            const termCharlie = BigNumber.from(YEAR).mul(TWO).mul(TWO);

            const s_alice = aliceAmount.div(INITIAL_PRICE);
            const s_bob = bobAmount.div(INITIAL_PRICE);
            const s_charlie = charlieAmount.div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, termBob));
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, termCharlie));

            beforeEach('several deposits', async() => {
                await token.connect(alice).approve(carp.address, aliceAmount);
                await token.connect(bob).approve(carp.address, bobAmount);
                await token.connect(charlie).approve(carp.address, charlieAmount);
                await carp.connect(alice).deposit(token.address, aliceAmount, termAlice);
                await carp.connect(bob).deposit(token.address, bobAmount, termBob);
                await carp.connect(charlie).deposit(token.address, charlieAmount, termCharlie);
            })
            it('bob early withdraws', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const userInfo = await carp.users(token.address, bob.address);
                const stake = userInfo.stake;
                // const amount = stake.amount;
                const stakeTs = stake.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                expect(charityBalanceBefore).to.be.equal(0);
                expect(communityBalanceBefore).to.be.equal(0);
                expect(burnBalanceBefore).to.be.equal(0);
                // await time.increase(YEAR);
                // const provider = ethers.getDefaultProvider();
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                // await ethers.provider.send('evm_mine');
                const tx = await carp.connect(bob).withdraw(token.address);
                const receipt = await tx.wait();
                const bobBalanceAfter = await token.balanceOf(bob.address);
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const charityPenalty = totalPenalty.mul(CHARITY_PERCENT).div(PERCENT_BASE);
                const communityPenalty = totalPenalty.mul(COMMUNITY_PERCENT).div(PERCENT_BASE);
                const ownerPenalty = totalPenalty.mul(OWNER_PERCENT).div(PERCENT_BASE);
                const burnPenalty = totalPenalty.mul(BURN_PERCENT).div(PERCENT_BASE);
                const penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);

                const pool = await carp.pools(token.address);
                const poolLambda = pool.lambda;
                const poolTotalShares = pool.totalShares;
                const poolCurrentPrice = pool.currentPrice;
                const poolInitialPrice = pool.initialPrice;


                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const totalShares = S_alice.add(S_charlie);

                expect(poolLambda).to.be.equal(penaltyToPool.mul(LAMBDA_COEF).div(totalShares));
                expect(poolTotalShares).to.be.equal(totalShares);
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);
                
                expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.equal(bobAmount.sub(totalPenalty));
                expect(charityBalanceAfter.sub(charityBalanceBefore)).to.be.equal(charityPenalty);
                expect(communityBalanceAfter.sub(communityBalanceBefore)).to.be.equal(communityPenalty);
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.equal(ownerPenalty);
                expect(burnBalanceAfter.sub(burnBalanceBefore)).to.be.equal(burnPenalty);

                const aliceReward = await carp.getReward(token.address, alice.address);
                const bobReward = await carp.getReward(token.address, bob.address);
                const charlieReward = await carp.getReward(token.address, charlie.address);

                console.log('aliceReward =   ', aliceReward.toString());
                console.log('bobReward =     ', bobReward.toString());
                console.log('charlieReward = ', charlieReward.toString());

                expect(aliceReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares).div(TEN));
                expect(charlieReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_charlie).div(totalShares).div(TEN));
                expect(bobReward.div(TEN)).to.be.equal(0); 

            })

            it('bob early after stake matured', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const userInfo = await carp.users(token.address, bob.address);
                const stake = userInfo.stake;
                // const amount = stake.amount;
                const stakeTs = stake.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                // await time.increase(YEAR);
                // const provider = ethers.getDefaultProvider();
                await ethers.provider.send('evm_increaseTime', [+termBob.toString()]); 
                // await ethers.provider.send('evm_mine');
                const tx = await carp.connect(bob).withdraw(token.address);
                const receipt = await tx.wait();
                const bobBalanceAfter = await token.balanceOf(bob.address);
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const charityPenalty = totalPenalty.mul(CHARITY_PERCENT).div(PERCENT_BASE);
                const communityPenalty = totalPenalty.mul(COMMUNITY_PERCENT).div(PERCENT_BASE);
                const ownerPenalty = totalPenalty.mul(OWNER_PERCENT).div(PERCENT_BASE);
                const burnPenalty = totalPenalty.mul(BURN_PERCENT).div(PERCENT_BASE);
                const penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);

                const pool = await carp.pools(token.address);
                const poolLambda = pool.lambda;
                const poolTotalShares = pool.totalShares;
                const poolCurrentPrice = pool.currentPrice;
                const poolInitialPrice = pool.initialPrice;


                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const totalShares = S_alice.add(S_charlie);

                expect(poolLambda).to.be.equal(0);
                expect(poolTotalShares).to.be.equal(totalShares);
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);
                
                expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.equal(bobAmount);
                expect(charityBalanceAfter.sub(charityBalanceBefore)).to.be.equal(0);
                expect(communityBalanceAfter.sub(communityBalanceBefore)).to.be.equal(0);
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.equal(0);
                expect(burnBalanceAfter.sub(burnBalanceBefore)).to.be.equal(0);

                const aliceReward = await carp.getReward(token.address, alice.address);
                const bobReward = await carp.getReward(token.address, bob.address);
                const charlieReward = await carp.getReward(token.address, charlie.address);

                expect(aliceReward).to.be.equal(0);
                expect(charlieReward).to.be.equal(0);
                expect(bobReward).to.be.equal(0); 

            })
        })
    })

    




})
