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
const HUN = BigNumber.from('100');
const DEAD_WALLET = '0x000000000000000000000000000000000000dEaD';
const TOTALSUPPLY = ethers.utils.parseEther('1000000');
const DAY = 86400;
const WEEK = 7 * 86400;
const YEAR = DAY * 365;
const LBonus = 10 * YEAR;
const LBonusMaxPercent = 200;
const BBonus = 100000;
const BBonusMaxPercent = 10;
const PERCENT_BASE = 100;
const INTEREST_PERCENT = 50;
const INITIAL_PRICE = BigNumber.from(1);

const FREE_LATE_PERIOD = 7 * 86400;
const PENALTY_PERCENT_PER_WEEK = BigNumber.from(2);

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
    const darwin = accounts[6];
    beforeEach('deployment', async() => {
        const Token = await ethers.getContractFactory('Token');
        const Carpediem = await ethers.getContractFactory('Carpediem');
        token = await Token.deploy(TOTALSUPPLY);
        carp = await Carpediem.deploy(charity.address, community.address, owner.address);
        await token.transfer(alice.address, ethers.utils.parseEther('100'))
        await token.transfer(bob.address, ethers.utils.parseEther('100'))
        await token.transfer(charlie.address, ethers.utils.parseEther('100'))
        await token.transfer(darwin.address, ethers.utils.parseEther('100'))
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
        expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
        expect(poolInitialPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
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
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));

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
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));

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

                console.log('poolLambda BEFORE = ', poolLambda.toString())

                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const totalShares = S_alice.add(S_charlie);

                expect(poolLambda).to.be.equal(penaltyToPool.mul(LAMBDA_COEF).div(totalShares));
                expect(poolTotalShares).to.be.equal(totalShares);
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
                
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

            it('bob withdraw after stake matured', async() => {
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
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
                
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

            it('shouldnt give darwin reward for bobs early withdraw if darwin came after ', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await carp.connect(bob).withdraw(token.address);
                const darwinAmount = ethers.utils.parseEther('1');
                const termDarwin = YEAR;
                await ethers.provider.send('evm_increaseTime', [termDarwin]); 
                await token.connect(darwin).approve(carp.address, darwinAmount);
                await carp.connect(darwin).deposit(token.address, darwinAmount, termDarwin);
                const darwinReward = await carp.getReward(token.address, darwin.address);
                expect(darwinReward.div(TEN)).to.be.equal(0); 
            })

            it('should give darwin reward if bobs early withdraws, darwin came after and charlie early withdraw', async() => {
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
                const termBeforeBobWithdraw = 1.5*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                const tx = await carp.connect(bob).withdraw(token.address);
                
                const receipt = await tx.wait();
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                

                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const totalShares = S_alice.add(S_charlie);
                

                const darwinAmount = ethers.utils.parseEther('1');
                const termDarwin = YEAR;

                await token.connect(darwin).approve(carp.address, darwinAmount);
                await carp.connect(darwin).deposit(token.address, darwinAmount, termDarwin);

                const s_darwin = darwinAmount.div(INITIAL_PRICE);
                const S_darwin = s_darwin.add(calculateBBonus(s_darwin, darwinAmount)).add(calculateLBonus(s_darwin, termDarwin));
                

                const termBeforeCharlieWithdraw = 1*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 


                const charlieBalanceBefore = await token.balanceOf(charlie.address);
                const charlieInfo = await carp.users(token.address, charlie.address);
                const charlieStake = charlieInfo.stake;
                const charlieStakeAmount = charlieStake.amount;
                const charlieStakeTs = charlieStake.ts;

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);


                // await ethers.provider.send('evm_mine');
                const charlieTx = await carp.connect(charlie).withdraw(token.address);

                const charlieTotalShares = S_alice.add(S_darwin);


                const charlieReceipt = await charlieTx.wait();
                const charlieBalanceAfter = await token.balanceOf(charlie.address);
                const charlieBlock = await charlieReceipt.events[0].getBlock();
                const charlieTs = BigNumber.from(charlieBlock.timestamp);


                console.log('charlieStakeAmount + charlieRewardBefore= ', charlieStakeAmount.add(charlieRewardBefore).toString());
                console.log('charlieStakeTs = ', charlieStakeTs.toString());
                console.log('charlieTs = ', charlieTs.toString());
                console.log('charlieTemp = ', termCharlie.toString());
                
                

                const charlieTotalPenalty = (charlieAmount.add(charlieRewardBefore)).mul(termCharlie.sub(charlieTs).add(charlieStakeTs)).div(termCharlie);
                const charlieCharityPenalty = charlieTotalPenalty.mul(CHARITY_PERCENT).div(PERCENT_BASE);
                const charlieCommunityPenalty = charlieTotalPenalty.mul(COMMUNITY_PERCENT).div(PERCENT_BASE);
                const charlieOwnerPenalty = charlieTotalPenalty.mul(OWNER_PERCENT).div(PERCENT_BASE);
                const charlieBurnPenalty = charlieTotalPenalty.mul(BURN_PERCENT).div(PERCENT_BASE);
                const charliePenaltyToPool = charlieTotalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);

                // expect(charlieBalanceAfter.sub(charlieBalanceBefore).add(ONE)).to.be.equal(charlieAmount.add(charlieRewardBefore).sub(charlieTotalPenalty));


                let charlieCharityBalanceAfter = await token.balanceOf(charity.address);
                let charlieCommunityBalanceAfter = await token.balanceOf(community.address);
                let charlieOwnerBalanceAfter = await token.balanceOf(owner.address);
                let charlieBurnBalanceAfter = await token.balanceOf(DEAD_WALLET);


                const poolAfter = await carp.pools(token.address);
                const poolLambdaAfter = poolAfter.lambda;
                const poolTotalSharesAfter = poolAfter.totalShares;
                const poolCurrentPriceAfter = poolAfter.currentPrice;
                const poolInitialPriceAfter = poolAfter.initialPrice;


                expect(poolLambdaAfter).to.be.equal((
                    penaltyToPoolBefore.mul(LAMBDA_COEF).div(totalShares)).add(
                    charliePenaltyToPool.mul(LAMBDA_COEF).div(charlieTotalShares)
                ));
                    
                expect(poolTotalSharesAfter).to.be.equal(charlieTotalShares);
                // expect(poolCurrentPriceAfter).to.be.equal(INITIAL_PRICE);
                expect(poolInitialPriceAfter).to.be.equal(INITIAL_PRICE.mul(LAMBDA_COEF));
                
                expect(charlieCharityBalanceAfter.sub(charityBalanceAfter)).to.be.equal(charlieCharityPenalty);
                expect(charlieCommunityBalanceAfter.sub(communityBalanceAfter)).to.be.equal(charlieCommunityPenalty);
                expect(charlieOwnerBalanceAfter.sub(ownerBalanceAfter)).to.be.equal(charlieOwnerPenalty);
                expect((charlieBurnBalanceAfter.sub(burnBalanceAfter)).div(HUN)).to.be.equal(charlieBurnPenalty.div(HUN));

                const aliceReward = await carp.getReward(token.address, alice.address);
                const bobReward = await carp.getReward(token.address, bob.address);
                const charlieReward = await carp.getReward(token.address, charlie.address);
                const darwinReward = await carp.getReward(token.address, darwin.address);

                console.log('aliceReward =   ', aliceReward.toString());
                console.log('bobReward =     ', bobReward.toString());
                console.log('charlieReward = ', charlieReward.toString());

                expect(aliceReward.div(HUN)).to.be.equal(
                    (penaltyToPoolBefore.mul(S_alice).div(totalShares).add(
                        charliePenaltyToPool.mul(S_alice).div(charlieTotalShares)).div(HUN)
                    ));
                expect(charlieRewardBefore.div(TEN)).to.be.equal(penaltyToPoolBefore.mul(S_charlie).div(totalShares).div(TEN));
                expect(darwinReward.add(ONE)).to.be.equal(charliePenaltyToPool.mul(S_darwin).div(charlieTotalShares));
                expect(bobReward.div(TEN)).to.be.equal(0); 
                expect(charlieReward.div(TEN)).to.be.equal(0); 

            })

            it('should correct calculate new price ', async() => {
                const userInfo = await carp.users(token.address, bob.address);
                const stake = userInfo.stake;
                const stakeTs = stake.ts;

                const termBeforeBobWithdraw = 1.5*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                const tx = await carp.connect(bob).withdraw(token.address);
                
                const receipt = await tx.wait();
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                const termBeforeCharlieWithdraw = 2.5*YEAR;

                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 

                const totalShares = S_charlie.add(S_alice);

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);
                const charlieInfo = await carp.users(token.address, charlie.address);
                const charlieStake = charlieInfo.stake;
                const charlieStakeAmount = charlieStake.amount;

                await carp.connect(charlie).withdraw(token.address);
                const poolAfter = await carp.pools(token.address);
                const poolCurrentPriceAfter = poolAfter.currentPrice;
                expect(poolCurrentPriceAfter).to.be.equal( (charlieRewardBefore.add(charlieStakeAmount)).mul(LAMBDA_COEF).div(s_charlie) );

            })

            describe('extra staking tests', async() => {
                const termBeforeBobWithdraw = 0.5*YEAR;
                let totalShares: any;
                let lastLambda: any;
                let penaltyToPool: any;

                beforeEach('bob replenishes the pool', async() => {
                    await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                    const userInfo = await carp.users(token.address, bob.address);

                    const tx = await carp.connect(bob).withdraw(token.address);
                    totalShares = S_alice.add(S_charlie);
                    const stake = userInfo.stake;
                    const stakeTs = stake.ts;
    
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const ts = BigNumber.from(block.timestamp);
                    console.log('termBob = ', termBob.toString());
                    console.log('ts =      ', ts.toString());
                    console.log('stakeTs = ', stakeTs.toString());
                    const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
    

                    penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                    console.log('penaltyToPool = ', penaltyToPool.toString());
                    console.log('totalShares = ', totalShares.toString());
                    lastLambda = penaltyToPool.mul(LAMBDA_COEF).div(totalShares);
    
                })
                it('should correct extraDeposit', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await token.connect(alice).approve(carp.address, extraAmount);
                    const tx = await carp.connect(alice).extraDeposit(token.address, extraAmount);
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const timestamp = block.timestamp;
                    const userInfo = await carp.users(token.address, alice.address);
                    const userShares = userInfo.shares;
                    const userSharesWithBonuses = userInfo.sharesWithBonuses;
                    const userLastLambda = userInfo.lastLambda;
                    const userAssignedReward = userInfo.assignedReward;

                    const userStake = userInfo.stake;
                    const stakeAmount = userStake.amount;
                    const stakeTerm = userStake.term;
                    const stakeTs = userStake.ts;

                    const pool = await carp.pools(token.address);
                    const poolTotalShares = pool.totalShares;

                    const shares = extraAmount.div(INITIAL_PRICE).add(s_alice);
                    const sharesWithBonuses = shares.add(calculateBBonus(shares, aliceAmount.add(extraAmount))).add(calculateLBonus(shares, stakeTs.add(stakeTerm).sub(timestamp)));

                    
                    expect(userShares).to.be.equal(shares);
                    expect(userSharesWithBonuses).to.be.equal(sharesWithBonuses);
                    expect(userLastLambda).to.be.equal(lastLambda);
                    expect(userAssignedReward.add(ONE)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares));
                    expect(stakeAmount).to.be.equal(aliceAmount.add(extraAmount));
                    expect(stakeTerm).to.be.equal(stakeTs.add(stakeTerm).sub(timestamp));
                    expect(stakeTs).to.be.equal(timestamp);
                    expect(poolTotalShares).to.be.equal(S_charlie.add(sharesWithBonuses));


                    
                })
                describe('late reward tests', async() => {
                    it('should correct calculate penalty if claimed late ', async() => {
                        const userInfo = await carp.users(token.address, charlie.address);
                        const userShares = userInfo.shares;
                        const userSharesWithBonuses = userInfo.sharesWithBonuses;
                        const userLastLambda = userInfo.lastLambda;
                        const userAssignedReward = userInfo.assignedReward;
    
                        const userStake = userInfo.stake;
                        const stakeAmount = userStake.amount;
                        const stakeTerm = userStake.term;
                        const stakeTs = userStake.ts;


                        const lateWeeks = 2;
                        const bigLateWeeks = BigNumber.from(lateWeeks); 
                        const termBeforeCharlieWithdraw = 3.5*YEAR + lateWeeks*WEEK;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        const tx = await carp.connect(charlie).withdraw(token.address);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);

                        const receipt = await tx.wait();
                        const block = await receipt.events[0].getBlock();
                        const timestamp = block.timestamp;
    
                        const pool = await carp.pools(token.address);
                        const poolTotalShares = pool.totalShares;

                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares);
                        const charlieIncome = charlieAmount.add(charlieReward);
                        console.log('charlieReward = ', charlieReward.toString());
                        console.log('charlieAmount = ', charlieAmount.toString());
                        const latePenalty = charlieReward.mul(PENALTY_PERCENT_PER_WEEK).mul(bigLateWeeks).div(PERCENT_BASE);
                        const charlieProfit = charlieIncome.sub(latePenalty);

                        console.log('latePenalty = ', latePenalty.toString());
    
                        expect(charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN)).to.be.equal(charlieProfit.div(HUN));
            
                    })
                })
    
            })

        })
    })

    
// check extraDeposit if price changed



})
