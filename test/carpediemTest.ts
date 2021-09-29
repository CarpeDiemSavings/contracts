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
const DEAD_WALLET =  '0x000000000000000000000000000000000000dEaD';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOTALSUPPLY = ethers.utils.parseEther('1000000');
const DAY = 86400;
const WEEK = 7 * 86400;
const YEAR = DAY * 365;
const LBonus = 10 * YEAR;
const LBonusMaxPercent = 200;
const BBonus = ethers.utils.parseEther('100000');
const BBonusMaxPercent = 10;
const PERCENT_BASE = 100;
const INTEREST_PERCENT = 50;
const INITIAL_PRICE = ethers.utils.parseEther('1');

const penaltyPercents = [50, 20, 10, 10, 10];


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
    if (amount.lt(BBonus)) return shares.mul(BBonusMaxPercent).mul(amount).div(BBonus).div(PERCENT_BASE);
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
    const other = accounts[7];

    const wallets = [
        other.address,
        DEAD_WALLET,
        owner.address,
        charity.address,
        community.address
    ];


    describe('incorrect deployment', async () => {
        // it('shouldnt deploy if charityWallet = 0', async() => {
        //     const Token = await ethers.getContractFactory('Token');
        //     const Carpediem = await ethers.getContractFactory('CarpeDiem');
        //     token = await Token.deploy(TOTALSUPPLY);
        //     await expect(Carpediem.deploy()).to.be.revertedWith('charityWallet cannot be zero');
        // })
        // it('shouldnt deploy if communityWallet = 0', async() => {
        //     const Token = await ethers.getContractFactory('Token');
        //     const Carpediem = await ethers.getContractFactory('CarpeDiem');
        //     token = await Token.deploy(TOTALSUPPLY);
        //     await expect(Carpediem.deploy()).to.be.revertedWith('communityWallet cannot be zero');
        // })
        // it('shouldnt deploy if ownerWallet = 0', async() => {
        //     const Token = await ethers.getContractFactory('Token');
        //     const Carpediem = await ethers.getContractFactory('CarpeDiem');
        //     token = await Token.deploy(TOTALSUPPLY);
        //     await expect(Carpediem.deploy()).to.be.revertedWith('ownerWallet cannot be zero');
        // })


    })

    beforeEach('deployment', async() => {
        const Token = await ethers.getContractFactory('Token');
        const Carpediem = await ethers.getContractFactory('CarpeDiem');
        token = await Token.deploy(TOTALSUPPLY);
        carp = await Carpediem.deploy();
        await token.transfer(alice.address, ethers.utils.parseEther('100'))
        await token.transfer(bob.address, ethers.utils.parseEther('100'))
        await token.transfer(charlie.address, ethers.utils.parseEther('100'))
        await token.transfer(darwin.address, ethers.utils.parseEther('100'))
    })
    

    it('shouldnt create pool with zero token address', async() => {
        await expect(carp.createPool(ZERO_ADDRESS, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('token cannot be zero');
    })
    it('shouldnt create pool with zero initial share price', async() => {
        await expect(carp.createPool(token.address, 0, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('price cannot be zero');
    })
    it('shouldnt create pool with zero initial share price', async() => {
        await expect(carp.createPool(token.address, INITIAL_PRICE, 0, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('B bonus amount cannot be zero');
    })
    it('shouldnt create pool with zero initial share price', async() => {
        await expect(carp.createPool(token.address, INITIAL_PRICE, BBonus, 0, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('L bonus period cannot be zero');
    })
    it('shouldnt create pool if pool with this token already exists', async() => {
        await carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
        await expect(carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('pool already exists');
    })

    it('should correctly create pool', async() => {
        const tx = await carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
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
            await carp.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
        })

        it('shouldnt deposit if pool doesnt exist (wrong address)', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            await expect(carp.connect(alice).deposit(other.address, aliceAmount, termAlice)).to.be.revertedWith('pool doesnt exist');
        })

        it('shouldnt deposit if amount is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            await expect(carp.connect(alice).deposit(token.address, 0, termAlice)).to.be.revertedWith('deposit cannot be zero');
        })

        it('shouldnt deposit if term is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            await expect(carp.connect(alice).deposit(token.address, aliceAmount, 0)).to.be.revertedWith('term cannot be zero');
        })

        it('should correct deposit', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            const tx = await carp.connect(alice).deposit(token.address, aliceAmount, termAlice);
            const receipt = await tx.wait();
            // const stakes = await carp.stakes(token.address, alice.address);
            const stakeInfo = await carp.stakes(token.address, alice.address, 0);;
            const shares = stakeInfo.shares;
            const sharesWithBonuses = stakeInfo.sharesWithBonuses;
            const lastLambda = stakeInfo.lastLambda;
            const assignedReward = stakeInfo.assignedReward;
            const amount = stakeInfo.amount;
            const term = stakeInfo.term;

            const pool = await carp.pools(token.address);
            const poolLambda = pool.lambda;
            const poolTotalShares = pool.totalShares;
            const poolCurrentPrice = pool.currentPrice;
            const poolInitialPrice = pool.initialPrice;

            const eventName = receipt.events[2].event;
            const eventToken = receipt.events[2].args.token;
            const eventDepositor = receipt.events[2].args.depositor;
            const eventAmount = receipt.events[2].args.amount;
            const eventTerm = receipt.events[2].args.term;
    

            const s_alice = aliceAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
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

            expect(eventName).to.be.equal('Deposit');
            expect(eventToken).to.be.equal(token.address);
            expect(eventDepositor).to.be.equal(alice.address);
            expect(eventAmount).to.be.equal(aliceAmount);
            expect(eventTerm).to.be.equal(termAlice);

        })

        // it('should correct buy small amount of shares', async() => {
        //     const smallAmount = BigNumber.from('1');
        //     await token.connect(alice).approve(carp.address, smallAmount);
        //     const smallTerm = 1;
        //     await carp.connect(alice).deposit(token.address, smallAmount, smallTerm);

        //     const userInfo = await carp.users(token.address, alice.address);
        //     const userShares = userInfo.shares;
        //     const userSharesWithBonuses = userInfo.sharesWithBonuses;
        //     const userLastLambda = userInfo.lastLambda;
        //     const userAssignedReward = userInfo.assignedReward;

        //     console.log('userShares =            ', userShares.toString());
        //     console.log('userSharesWithBonuses = ', userSharesWithBonuses.toString());

        //     const userStake = userInfo.stake;
        //     const stakeAmount = userStake.amount;
        //     const stakeTerm = userStake.term;
        //     const stakeTs = userStake.ts;



            
        // })

        it('should get maximum L bonus', async() => {
            const smallAmount = BigNumber.from('1');
            await token.connect(alice).approve(carp.address, smallAmount);
            const bigTerm = 10 * YEAR;
            await carp.connect(alice).deposit(token.address, smallAmount, bigTerm);

            const stakeInfo = await carp.stakes(token.address, alice.address, 0);;
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;
            const userLastLambda = stakeInfo.lastLambda;
            const userAssignedReward = stakeInfo.assignedReward;

            expect(userSharesWithBonuses).to.be.equal(userShares.mul(ONE.add(TWO)));

        })

        it('should get maximum B bonus', async() => {
            const bigAmount = ethers.utils.parseEther('100000');
            await token.connect(owner).approve(carp.address, bigAmount);
            const smallTerm = 1;
            await carp.connect(owner).deposit(token.address, bigAmount, smallTerm);

            const stakeInfo = await carp.stakes(token.address, owner.address, 0);;
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;
            const userLastLambda = stakeInfo.lastLambda;
            const userAssignedReward = stakeInfo.assignedReward;

            expect(userSharesWithBonuses.div(LAMBDA_COEF).div(LAMBDA_COEF)).to.be.equal((userShares.add(userShares.mul(TEN).div(HUN))).div(LAMBDA_COEF).div(LAMBDA_COEF));

        })

        it('should get maximum B and L bonuses', async() => {
            const bigAmount = ethers.utils.parseEther('100000');
            await token.connect(owner).approve(carp.address, bigAmount);
            const bigTerm = 10 * YEAR;
            await carp.connect(owner).deposit(token.address, bigAmount, bigTerm);

            const stakeInfo = await carp.stakes(token.address, owner.address, 0);;
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;
            const userLastLambda = stakeInfo.lastLambda;
            const userAssignedReward = stakeInfo.assignedReward;

            expect(userSharesWithBonuses).to.be.equal(userShares.add(userShares.mul(TEN).div(HUN)).add(userShares.mul(TWO)));

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


            const s_alice = aliceAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const s_bob = bobAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const s_charlie = charlieAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, termBob));
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, termCharlie));


            expect(poolLambda).to.be.equal(0);
            expect(poolTotalShares).to.be.equal(S_alice.add(S_bob).add(S_charlie));
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);

        })
        it('shouldnt upgradeStake if there is such id', async() => {
            const termBeforeAliceExtra = 0.1*YEAR;
            await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
            const extraAmount = ethers.utils.parseEther('10');
            await expect(carp.connect(alice).upgradeStake(token.address, extraAmount, 1)).to.be.revertedWith('no such stake id');
        })

        describe('withdraw tests', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const bobAmount = ethers.utils.parseEther('2');
            const charlieAmount = ethers.utils.parseEther('4');
            const termAlice = YEAR;
            const termBob = BigNumber.from(YEAR).mul(TWO);
            const termCharlie = BigNumber.from(YEAR).mul(TWO).mul(TWO);

            const s_alice = aliceAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const s_bob = bobAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const s_charlie = charlieAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const S_alice = s_alice.add(calculateBBonus(s_alice, aliceAmount)).add(calculateLBonus(s_alice, termAlice));
            const S_bob = s_bob.add(calculateBBonus(s_bob, bobAmount)).add(calculateLBonus(s_bob, termBob));
            const S_charlie = s_charlie.add(calculateBBonus(s_charlie, charlieAmount)).add(calculateLBonus(s_charlie, termCharlie));

            let bobTs: any;

            beforeEach('several deposits', async() => {
                await token.connect(alice).approve(carp.address, aliceAmount);
                await token.connect(bob).approve(carp.address, bobAmount);
                await token.connect(charlie).approve(carp.address, charlieAmount);
                await carp.connect(alice).deposit(token.address, aliceAmount, termAlice);
                const tx = await carp.connect(bob).deposit(token.address, bobAmount, termBob);
                const receipt = await tx.wait();
                // console.log(receipt.events[0]);

                const block = await receipt.events[0].getBlock();
                bobTs = BigNumber.from(block.timestamp);
                await carp.connect(charlie).deposit(token.address, charlieAmount, termCharlie);
            })

            it('should correct show users penalty', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(token.address, alice.address, 0);;
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                const penalty = await carp.getPenalty(token.address, bob.address, 0);
                // const amount = stake.amount;
                const stakeTs = stakeInfo.ts;

                const bobBalanceAfter = await token.balanceOf(bob.address);
                const totalPenalty = bobAmount.mul(termBob.sub(bobTs).add(stakeTs)).div(termBob);
                expect(penalty).to.be.equal(totalPenalty);

            })

            it('shouldnt withdraw if pool doesnt exists', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await expect(carp.connect(bob).withdraw(other.address, 0)).to.be.revertedWith('pool doesnt exist');

            })

            it('bob early withdraws', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(token.address, bob.address, 0);;
                const stakeTs = stakeInfo.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                expect(charityBalanceBefore).to.be.equal(0);
                expect(communityBalanceBefore).to.be.equal(0);
                expect(burnBalanceBefore).to.be.equal(0);
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                const tx = await carp.connect(bob).withdraw(token.address, 0);
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
                
                const eventName = receipt.events[receipt.events.length - 1].event;
                const eventToken = receipt.events[receipt.events.length - 1].args.token;
                const eventWho = receipt.events[receipt.events.length - 1].args.who;
                const eventDeposit = receipt.events[receipt.events.length - 1].args.deposit;
                const eventReward = receipt.events[receipt.events.length - 1].args.reward;
                const eventPenalty = receipt.events[receipt.events.length - 1].args.penalty;

                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const totalShares = S_alice.add(S_charlie);

                expect(poolLambda).to.be.equal(penaltyToPool.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(totalShares));
                expect(poolTotalShares).to.be.equal(totalShares);
                expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
                expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);
                
                expect(bobBalanceAfter.sub(bobBalanceBefore)).to.be.equal(bobAmount.sub(totalPenalty));
                expect(charityBalanceAfter.sub(charityBalanceBefore)).to.be.equal(charityPenalty);
                expect(communityBalanceAfter.sub(communityBalanceBefore)).to.be.equal(communityPenalty);
                expect(ownerBalanceAfter.sub(ownerBalanceBefore)).to.be.equal(ownerPenalty);
                expect(burnBalanceAfter.sub(burnBalanceBefore)).to.be.equal(burnPenalty);

                const aliceReward = await carp.getReward(token.address, alice.address, 0);
                const bobReward = await carp.getReward(token.address, bob.address, 0);
                const charlieReward = await carp.getReward(token.address, charlie.address, 0);

                expect(aliceReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares).div(TEN));
                expect(charlieReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_charlie).div(totalShares).div(TEN));
                expect(bobReward.div(TEN)).to.be.equal(0); 

                expect(eventName).to.be.equal('Withdraw');
                expect(eventToken).to.be.equal(token.address);
                expect(eventWho).to.be.equal(bob.address);
                expect(eventDeposit).to.be.equal(bobAmount);
                expect(eventReward).to.be.equal(0);
                expect(eventPenalty).to.be.equal(totalPenalty);

            })

            it('bob withdraw after stake matured', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(token.address, bob.address, 0);;
                const stakeTs = stakeInfo.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                await ethers.provider.send('evm_increaseTime', [+termBob.toString()]); 
                const tx = await carp.connect(bob).withdraw(token.address, 0);
                const receipt = await tx.wait();
                const bobBalanceAfter = await token.balanceOf(bob.address);
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);

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

                const aliceReward = await carp.getReward(token.address, alice.address, 0);
                const bobReward = await carp.getReward(token.address, bob.address, 0);
                const charlieReward = await carp.getReward(token.address, charlie.address, 0);

                expect(aliceReward).to.be.equal(0);
                expect(charlieReward).to.be.equal(0);
                expect(bobReward).to.be.equal(0); 

            })

            it('shouldnt give darwin reward for bobs early withdraw if darwin came after ', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await carp.connect(bob).withdraw(token.address, 0);
                const darwinAmount = ethers.utils.parseEther('1');
                const termDarwin = YEAR;
                await ethers.provider.send('evm_increaseTime', [termDarwin]); 
                await token.connect(darwin).approve(carp.address, darwinAmount);
                await carp.connect(darwin).deposit(token.address, darwinAmount, termDarwin);
                const darwinReward = await carp.getReward(token.address, darwin.address, 0);
                expect(darwinReward.div(TEN)).to.be.equal(0); 
            })

            it('should give darwin reward if bob early withdraws, darwin came after and charlie early withdraw', async() => {
                const stakeInfo = await carp.stakes(token.address, bob.address, 0);;
                // const amount = stake.amount;
                const stakeTs = stakeInfo.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                expect(charityBalanceBefore).to.be.equal(0);
                expect(communityBalanceBefore).to.be.equal(0);
                expect(burnBalanceBefore).to.be.equal(0);
                const termBeforeBobWithdraw = 1.5*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                const tx = await carp.connect(bob).withdraw(token.address, 0);
                
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

                const s_darwin = darwinAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
                const S_darwin = s_darwin.add(calculateBBonus(s_darwin, darwinAmount)).add(calculateLBonus(s_darwin, termDarwin));
                

                const termBeforeCharlieWithdraw = 1*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 


                const charlieBalanceBefore = await token.balanceOf(charlie.address);
                const charlieStake = await carp.stakes(token.address, charlie.address, 0);;
                const charlieStakeTs = charlieStake.ts;

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);


                // await ethers.provider.send('evm_mine');
                const charlieTx = await carp.connect(charlie).withdraw(token.address, 0);

                const charlieTotalShares = S_alice.add(S_darwin);


                const charlieReceipt = await charlieTx.wait();
                const charlieBalanceAfter = await token.balanceOf(charlie.address);
                const charlieBlock = await charlieReceipt.events[0].getBlock();
                const charlieTs = BigNumber.from(charlieBlock.timestamp);

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
                    penaltyToPoolBefore.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(totalShares)).add(
                    charliePenaltyToPool.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(charlieTotalShares)
                ));
                    

                expect(poolTotalSharesAfter).to.be.equal(charlieTotalShares);
                // expect(poolCurrentPriceAfter).to.be.equal(INITIAL_PRICE);
                expect(poolInitialPriceAfter).to.be.equal(INITIAL_PRICE);
                
                expect(charlieCharityBalanceAfter.sub(charityBalanceAfter)).to.be.equal(charlieCharityPenalty);
                expect(charlieCommunityBalanceAfter.sub(communityBalanceAfter)).to.be.equal(charlieCommunityPenalty);
                expect(charlieOwnerBalanceAfter.sub(ownerBalanceAfter)).to.be.equal(charlieOwnerPenalty);
                expect((charlieBurnBalanceAfter.sub(burnBalanceAfter)).div(HUN)).to.be.equal(charlieBurnPenalty.div(HUN));

                const aliceReward = await carp.getReward(token.address, alice.address, 0);
                const bobReward = await carp.getReward(token.address, bob.address, 0);
                const charlieReward = await carp.getReward(token.address, charlie.address, 0);
                const darwinReward = await carp.getReward(token.address, darwin.address, 0);

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
                const stakeInfo = await carp.stakes(token.address, bob.address, 0);;
                const stakeTs = stakeInfo.ts;

                const termBeforeBobWithdraw = 1.5*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                const tx = await carp.connect(bob).withdraw(token.address, 0);
                
                const receipt = await tx.wait();
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                const termBeforeCharlieWithdraw = 2.5*YEAR;

                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 

                const totalShares = S_charlie.add(S_alice);

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);
                const charlieStake = await carp.stakes(token.address, charlie.address, 0);;
                const charlieStakeAmount = charlieStake.amount;

                await carp.connect(charlie).withdraw(token.address, 0);
                const poolAfter = await carp.pools(token.address);
                const poolCurrentPriceAfter = poolAfter.currentPrice;

                expect(poolCurrentPriceAfter.div(HUN)).to.be.equal( (charlieRewardBefore.add(charlieStakeAmount)).mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(s_charlie).div(HUN) );

            })

           

            describe('extra staking tests', async() => {
                const termBeforeBobWithdraw = 0.5*YEAR;
                let totalShares: any;
                let lastLambda: any;
                let penaltyToPool: any;

                beforeEach('bob replenishes the pool', async() => {
                    await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                    const stakeInfo = await carp.stakes(token.address, bob.address, 0);;
    
                    const tx = await carp.connect(bob).withdraw(token.address, 0);
                    totalShares = S_alice.add(S_charlie);
                    const stakeTs = stakeInfo.ts;
    
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const ts = BigNumber.from(block.timestamp);
                    const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);

                    penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                    lastLambda = penaltyToPool.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(totalShares);
    
                })

                it('shouldnt upgrade stake if pool doesnt exist', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await expect(carp.connect(alice).upgradeStake(other.address, 0, extraAmount)).to.be.revertedWith('pool doesnt exist');
                })

                it('shouldnt upgrade stake if extra deposit is zero', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    await expect(carp.connect(alice).upgradeStake(token.address, 0, 0)).to.be.revertedWith('deposit cannot be zero');
                })
                it('shouldnt upgrade stake if stake matured', async() => {
                    const termBeforeAliceExtra = 2 * YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await expect(carp.connect(alice).upgradeStake(token.address, 0, extraAmount)).to.be.revertedWith('stake matured');
                })



                it('should correct upgrade stake', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await token.connect(alice).approve(carp.address, extraAmount);
                    const tx = await carp.connect(alice).upgradeStake(token.address, 0, extraAmount);
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const timestamp = block.timestamp;
                    const stakeInfo = await carp.stakes(token.address, alice.address, 0);;
                    const userShares = stakeInfo.shares;
                    const userSharesWithBonuses = stakeInfo.sharesWithBonuses;
                    const userLastLambda = stakeInfo.lastLambda;
                    const userAssignedReward = stakeInfo.assignedReward;

                    const stakeAmount = stakeInfo.amount;
                    const stakeTerm = stakeInfo.term;
                    const stakeTs = stakeInfo.ts;

                    const pool = await carp.pools(token.address);
                    const poolTotalShares = pool.totalShares;

                    const eventName = receipt.events[receipt.events.length - 1].event;
                    const eventToken = receipt.events[receipt.events.length - 1].args.token;
                    const eventDepositor = receipt.events[receipt.events.length - 1].args.depositor;
                    const eventAmount = receipt.events[receipt.events.length - 1].args.amount;
                    const eventTerm = receipt.events[receipt.events.length - 1].args.term;

                    const shares = extraAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE).add(s_alice);
                    const sharesWithBonuses = shares.add(calculateBBonus(shares, aliceAmount.add(extraAmount))).add(calculateLBonus(shares, stakeTs.add(stakeTerm).sub(timestamp)));

                    
                    expect(userShares).to.be.equal(shares);
                    expect(userSharesWithBonuses).to.be.equal(sharesWithBonuses);
                    expect(userLastLambda).to.be.equal(lastLambda);
                    expect(userAssignedReward.div(HUN)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares).div(HUN));
                    expect(stakeAmount).to.be.equal(aliceAmount.add(extraAmount));
                    expect(stakeTerm).to.be.equal(stakeTs.add(stakeTerm).sub(timestamp));
                    expect(stakeTs).to.be.equal(timestamp);
                    expect(poolTotalShares).to.be.equal(S_charlie.add(sharesWithBonuses));

                    expect(eventName).to.be.equal('UpgradedStake');
                    expect(eventToken).to.be.equal(token.address);
                    expect(eventDepositor).to.be.equal(alice.address);
                    expect(eventAmount).to.be.equal(extraAmount);
                    expect(eventTerm).to.be.equal(stakeTs.add(stakeTerm).sub(timestamp));


                    
                })
                describe('late reward tests', async() => {
                    it('should correct calculate penalty if claimed late ', async() => {

                        const lateWeeks = 2;
                        const bigLateWeeks = BigNumber.from(lateWeeks); 
                        const termBeforeCharlieWithdraw = 3.5*YEAR + lateWeeks*WEEK;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        const tx = await carp.connect(charlie).withdraw(token.address, 0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);

                        const receipt = await tx.wait();
                        const block = await receipt.events[0].getBlock();
                        const timestamp = block.timestamp;
    
                        const pool = await carp.pools(token.address);
                        const poolTotalShares = pool.totalShares;

                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares);
                        const charlieIncome = charlieAmount.add(charlieReward);
                        const latePenalty = charlieReward.mul(PENALTY_PERCENT_PER_WEEK).mul(bigLateWeeks).div(PERCENT_BASE);
                        const charlieProfit = charlieIncome.sub(latePenalty);
    
                        expect(charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN)).to.be.equal(charlieProfit.div(HUN));
            
                    })

                    it('shouldnt take penalty if claimed in free late period (1 week)', async() => {
                
                        const latePeriod = 6*DAY;
                        const bigLateWeeks = BigNumber.from(latePeriod); 
                        const termBeforeCharlieWithdraw = 3.5*YEAR + latePeriod;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        const tx = await carp.connect(charlie).withdraw(token.address, 0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);

                        const receipt = await tx.wait();
                        const block = await receipt.events[0].getBlock();
                        const timestamp = block.timestamp;
    
                        const pool = await carp.pools(token.address);
                        const poolTotalShares = pool.totalShares;

                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares);
                        const charlieIncome = charlieAmount.add(charlieReward);
    

                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieIncome.div(HUN));
            
                    })

                    it('should withdraw only deposit if claim is too late', async() => {

                        const latePeriod = 51*WEEK;
                        const bigLateWeeks = BigNumber.from(latePeriod); 
                        const termBeforeCharlieWithdraw = 3.5*YEAR + latePeriod;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        const tx = await carp.connect(charlie).withdraw(token.address, 0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);

                        const receipt = await tx.wait();
                        const block = await receipt.events[0].getBlock();
                        const timestamp = block.timestamp;
    
                        const pool = await carp.pools(token.address);
                        const poolTotalShares = pool.totalShares;    

                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieAmount.div(HUN));
            
                    })
                })
    
            })

        })
    })

    

})
