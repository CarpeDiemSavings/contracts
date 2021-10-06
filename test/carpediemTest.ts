import { ethers, waffle, artifacts } from 'hardhat'
import {Wallet} from "ethers";
import {MockProvider} from "ethereum-waffle";
import { BigNumber } from 'ethers'
const {deployContract} = waffle
import { expect } from 'chai'
import chai  from 'chai'
import * as FactoryABI from "../artifacts/contracts/CarpediemFactory.sol/CarpediemFactory.json";

chai.use(require('chai-bignumber')());

const createFixtureLoader = waffle.createFixtureLoader

const ONE = BigNumber.from('1');
const TWO = BigNumber.from('2');
const TEN = BigNumber.from('10');
const HUN = BigNumber.from('100');
const DEAD_WALLET =  '0x000000000000000000000000000000000000dEaD';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const TOTALSUPPLY = ethers.utils.parseEther('1000000000000000');
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
let factory: any;
let wallets: any;

const accounts = waffle.provider.getWallets()
const owner = accounts[0];
const charity = accounts[1];
const community = accounts[2];
const alice = accounts[3];
const bob = accounts[4];
const charlie = accounts[5];
const darwin = accounts[6];
const other = accounts[7];

function calculateBBonus(shares: any, amount: any) {
    if (amount.lt(BBonus)) return shares.mul(BBonusMaxPercent).mul(amount).div(BBonus).div(PERCENT_BASE);
    return BigNumber.from(BBonusMaxPercent).mul(shares).div(PERCENT_BASE);
}

function calculateLBonus(shares: any, term: any) {
    if (term < LBonus) return shares.mul(LBonusMaxPercent).mul(term).div(LBonus).div(PERCENT_BASE);
    return BigNumber.from(LBonusMaxPercent).mul(shares).div(PERCENT_BASE);
}

async function fixture(_signers: Wallet[], _mockProvider: MockProvider) {
    const signers = waffle.provider.getWallets();
    factory = await deployContract(signers[0], FactoryABI);
    const Token = await ethers.getContractFactory('Token');
    token = await Token.deploy(TOTALSUPPLY);
    await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
    const poolAddress = await factory.allPools(0);
    const carpArtifacts = await artifacts.readArtifact("CarpeDiem");
    carp = new ethers.Contract(poolAddress, carpArtifacts.abi, ethers.provider);

    await token.transfer(alice.address, ethers.utils.parseEther('100'))
    await token.transfer(bob.address, ethers.utils.parseEther('100'))
    await token.transfer(charlie.address, ethers.utils.parseEther('100'))
    await token.transfer(darwin.address, ethers.utils.parseEther('100'))
    return {factory, carp, token};
}

describe('incorrect deployment', async() => {
    beforeEach('deploy factory and token', async() => {
        const Token = await ethers.getContractFactory('Token');
        const Factory = await ethers.getContractFactory('CarpediemFactory');
        token = await Token.deploy(TOTALSUPPLY);
        factory = await Factory.deploy();
    })
    it('shouldnt deploy pool with zero token address', async() => {
        await expect(factory.createPool(ZERO_ADDRESS, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('token cannot be zero');
    })
    it('shouldnt create pool with zero initial share price', async() => {
        await expect(factory.createPool(token.address, 0, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('price cannot be zero');
    })
    it('shouldnt create pool with zero BBonus', async() => {
        await expect(factory.createPool(token.address, INITIAL_PRICE, 0, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('B bonus amount cannot be zero');
    })
    it('shouldnt create pool with zero LBonus', async() => {
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, 0, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets)).to.be.revertedWith('L bonus period cannot be zero');
    })

    it('shouldnt create pool with incorrect arrays length', async() => {
        const wrongWallets = [
            other.address,
            DEAD_WALLET,
            owner.address,
            charity.address,
        ];
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wrongWallets)).to.be.revertedWith('incorrect input arrays');
    })

    it('shouldnt create pool if at least one wallet is zero', async() => {
        const wrongWallets = [
            ZERO_ADDRESS,
            DEAD_WALLET,
            owner.address,
            charity.address,
            community.address
        ];
        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wrongWallets)).to.be.revertedWith('wallet cannot be == 0');
    })

    it('shouldnt create pool if percent sum != 100', async() => {
        const wrongPenaltyPercents = [50, 20, 10, 10, 9];

        await expect(factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, wrongPenaltyPercents, wallets)).to.be.revertedWith('percent sum must be == 100');
    })
})

describe('test', async () => {
   
    wallets = [
        other.address,
        DEAD_WALLET,
        owner.address,
        charity.address,
        community.address
    ];
    let loadFixture: ReturnType<typeof createFixtureLoader>
    before('create fixture loader', async () => {
        loadFixture = createFixtureLoader([owner, other])
    })


    describe('deployment through factory', async () => {

        beforeEach('deploy token and factory', async() => {
            await loadFixture(fixture);

        })

        it('should correct create pool through factory', async() => {
            const {factory ,carp} = await loadFixture(fixture);

            const poolAddress = await factory.allPools(0);
            expect(poolAddress).to.not.be.equal(ZERO_ADDRESS);
            const aliceBalance = await token.balanceOf(alice.address);

            const poolToken = await carp.token();
            expect(poolToken).to.be.equal(token.address);

            const factoryOwner = await factory.owner();
            const carpOwner = await carp.owner();

            expect(factoryOwner).to.be.equal(carpOwner);            
            const poolLambda = await carp.lambda();
            const poolTotalShares = await carp.totalShares();
            const poolCurrentPrice = await carp.currentPrice();
            const poolInitialPrice = await carp.initialPrice();
            const poolBBonusAmount = await carp.bBonusAmount();
            const poolLBonusPeriod = await carp.lBonusPeriod();
            const poolbBonusMaxPercent = await carp.bBonusMaxPercent();
            const poollBonusMaxPercent = await carp.lBonusMaxPercent();

            // const eventName = receipt.events[receipt.events.length - 1].event;
            // const eventToken = receipt.events[receipt.events.length - 1].args.token;
            // const eventPoolAddress = receipt.events[receipt.events.length - 1].args.poolAddress;
            // const eventInitialPrice = receipt.events[receipt.events.length - 1].args.initialPrice;
            // const eventBBonusAmount = receipt.events[receipt.events.length - 1].args.bBonusAmount;
            // const eventLBonusPeriod = receipt.events[receipt.events.length - 1].args.lBonusPeriod;
            // const eventBBonusMaxPercent = receipt.events[receipt.events.length - 1].args.bBonusMaxPercent;
            // const eventLBonusMaxPercent = receipt.events[receipt.events.length - 1].args.lBonusMaxPercent;

            
            expect(poolToken).to.be.equal(token.address);
            expect(poolLambda).to.be.equal(0);
            expect(poolTotalShares).to.be.equal(0);
            expect(poolCurrentPrice).to.be.equal(INITIAL_PRICE);
            expect(poolInitialPrice).to.be.equal(INITIAL_PRICE);
            expect(poolBBonusAmount).to.be.equal(BBonus);
            expect(poolLBonusPeriod).to.be.equal(LBonus);
            expect(poollBonusMaxPercent).to.be.equal(LBonusMaxPercent);
            expect(poolbBonusMaxPercent).to.be.equal(BBonusMaxPercent);
            
            // expect(eventName).to.be.equal("NewPool");
            // expect(eventToken).to.be.equal(token.address);
            // expect(eventPoolAddress).to.be.equal(poolAddress);
            // expect(eventBBonusAmount).to.be.equal(BBonus);
            // expect(eventLBonusPeriod).to.be.equal(LBonus);
            // expect(eventInitialPrice).to.be.equal(INITIAL_PRICE);
            // expect(eventBBonusMaxPercent).to.be.equal(BBonusMaxPercent);
            // expect(eventLBonusMaxPercent).to.be.equal(LBonusMaxPercent);
    

        })

        it('should create several identical pools', async() => {
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
            await factory.createPool(token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents, wallets);
            const pool0 = await factory.allPools(0);
            const pool1 = await factory.allPools(1);
            const pool2 = await factory.allPools(2);
            const pool3 = await factory.allPools(3);
            expect(pool0).to.not.be.equal(ZERO_ADDRESS);
            expect(pool1).to.not.be.equal(ZERO_ADDRESS);
            expect(pool2).to.not.be.equal(ZERO_ADDRESS);
            expect(pool3).to.not.be.equal(ZERO_ADDRESS);
            await expect(factory.allPools(4)).to.be.reverted;
        })

    })

    describe('deposit tests', async() => {
        beforeEach('create pool', async() => {
            await loadFixture(fixture);            
            
        })
        
        it('should correct set new wallets', async() => {
            const newWallets = [
                accounts[10].address,
                accounts[11].address,
                accounts[12].address,
                accounts[13].address,
                accounts[14].address
            ]

            await carp.connect(owner).setWallets(newWallets);
            const walletsFromPool = await carp.getDistributionAddresses();
            for (let i = 0; i < walletsFromPool; i++ ) {
                expect(walletsFromPool[i]).to.be.equal(newWallets[i]);
            }
        })

        it('shouldnt set new wallets if array has incorrect length', async() => {
            const newWallets = [
                accounts[10].address,
                accounts[11].address,
                accounts[12].address,
                accounts[13].address,
            ]

            await expect(carp.connect(owner).setWallets(newWallets)).to.be.revertedWith('incorrect data');
        })

        it('shouldnt deposit if amount is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            await expect(carp.connect(alice).deposit(0, termAlice)).to.be.revertedWith('deposit cannot be zero');
        })

        it('shouldnt deposit if term is zero', async() => {
            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            await token.connect(alice).approve(carp.address, aliceAmount);
            await expect(carp.connect(alice).deposit(aliceAmount, 0)).to.be.revertedWith('term cannot be zero');
        })

        it('should correct deposit', async() => {
            const poolAddress = await factory.allPools(0);
            expect(poolAddress).to.not.be.equal(ZERO_ADDRESS);

            const aliceAmount = ethers.utils.parseEther('1');
            const termAlice = YEAR;
            const aliceBalance = await token.balanceOf(alice.address);
            await token.connect(alice).approve(carp.address, aliceAmount);
            const tx = await carp.connect(alice).deposit(aliceAmount, termAlice, {gasLimit: 1e6});
            const receipt = await tx.wait();
            const stakeInfo = await carp.stakes(alice.address, 0);;
            const shares = stakeInfo.shares;
            const sharesWithBonuses = stakeInfo.sharesWithBonuses;
            const lastLambda = stakeInfo.lastLambda;
            const assignedReward = stakeInfo.assignedReward;
            const amount = stakeInfo.amount;
            const term = stakeInfo.term;

            const poolLambda = await carp.lambda();
            const poolTotalShares = await carp.totalShares();
            const poolCurrentPrice = await carp.currentPrice();
            const poolInitialPrice = await carp.initialPrice();

            const eventName = receipt.events[receipt.events.length - 1].event;
            const eventDepositor = receipt.events[receipt.events.length - 1].args.depositor;
            const eventAmount = receipt.events[receipt.events.length - 1].args.amount;
            const eventTerm = receipt.events[receipt.events.length - 1].args.term;
    

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
            expect(eventDepositor).to.be.equal(alice.address);
            expect(eventAmount).to.be.equal(aliceAmount);
            expect(eventTerm).to.be.equal(termAlice);

        })

        it('should get maximum L bonus', async() => {
            const smallAmount = BigNumber.from('1');
            await token.connect(alice).approve(carp.address, smallAmount);
            const bigTerm = 10 * YEAR;
            await carp.connect(alice).deposit(smallAmount, bigTerm);

            const stakeInfo = await carp.stakes(alice.address, 0);
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;

            expect(userSharesWithBonuses).to.be.equal(userShares.mul(ONE.add(TWO)));

        })

        it('should get maximum B bonus', async() => {
            const bigAmount = ethers.utils.parseEther('100000');
            await token.connect(owner).approve(carp.address, bigAmount);
            const smallTerm = 1;
            await carp.connect(owner).deposit(bigAmount, smallTerm);

            const stakeInfo = await carp.stakes(owner.address, 0);;
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;

            expect(userSharesWithBonuses.div(LAMBDA_COEF).div(LAMBDA_COEF)).to.be.equal((userShares.add(userShares.mul(TEN).div(HUN))).div(LAMBDA_COEF).div(LAMBDA_COEF));

        })

        it('should get maximum B and L bonuses', async() => {
            const bigAmount = ethers.utils.parseEther('100000');
            await token.connect(owner).approve(carp.address, bigAmount);
            const bigTerm = 10 * YEAR;
            await carp.connect(owner).deposit(bigAmount, bigTerm);

            const stakeInfo = await carp.stakes(owner.address, 0);;
            const userShares = stakeInfo.shares;
            const userSharesWithBonuses = stakeInfo.sharesWithBonuses;

            expect(userSharesWithBonuses).to.be.equal(userShares.add(userShares.mul(TEN).div(HUN)).add(userShares.mul(TWO)));

        })

        it('should correct calculate enormous new price', async() => {
            const withdrawer = accounts[10];
            const raiser = accounts[11];
            const amountWithdrawer = ethers.utils.parseEther('20000000000000')
            const amountRaiser = ethers.utils.parseEther('1')
            const termWithdrawer = BigNumber.from(10 * YEAR);
            const termRaiser = YEAR;
            await token.transfer(withdrawer.address, amountWithdrawer);
            await token.transfer(raiser.address, amountRaiser);
            await token.connect(withdrawer).approve(carp.address, amountWithdrawer);
            await token.connect(raiser).approve(carp.address, amountRaiser);
            const txDeposit = await carp.connect(withdrawer).deposit(amountWithdrawer, termWithdrawer);
            const shares_withdrawer = amountWithdrawer.mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const Shares_withdrawer = shares_withdrawer.add(calculateBBonus(shares_withdrawer, amountWithdrawer)).add(calculateLBonus(shares_withdrawer, termWithdrawer));

            const receiptDeposit = await txDeposit.wait();
            const depositBlock = await receiptDeposit.events[receiptDeposit.events.length - 1].getBlock();
            const timestampDeposit = depositBlock.timestamp;
            await carp.connect(raiser).deposit(amountRaiser, termRaiser);
            const shares_raiser = amountRaiser.mul(LAMBDA_COEF).div(INITIAL_PRICE);
            const Shares_raiser = shares_raiser.add(calculateBBonus(shares_raiser, amountRaiser)).add(calculateLBonus(shares_raiser, termRaiser));
            const txWithdraw = await carp.connect(withdrawer).withdraw(0);
            const receiptWithdraw = await txDeposit.wait();
            const withdrawBlock = await receiptWithdraw.events[receiptWithdraw.events.length - 1].getBlock();
            const timestampWithdraw = withdrawBlock.timestamp;
            const penalty = amountWithdrawer.mul(termWithdrawer.sub(timestampWithdraw).add(timestampDeposit)).div(termWithdrawer).mul(INTEREST_PERCENT).div(HUN);
            await ethers.provider.send('evm_increaseTime', [termRaiser]); 

            await carp.connect(raiser).withdraw(0);
            const raiserIncome = penalty.add(amountRaiser);

            const newPrice = await carp.currentPrice();
            expect(newPrice).to.be.equal(BigNumber.from('1000000000000').mul(LAMBDA_COEF));

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
            await carp.connect(alice).deposit(aliceAmount, termAlice);
            await carp.connect(bob).deposit(bobAmount, termBob);
            await carp.connect(charlie).deposit(charlieAmount, termCharlie);

            const poolLambda = await carp.lambda();
            const poolTotalShares = await carp.totalShares();
            const poolCurrentPrice = await carp.currentPrice();
            const poolInitialPrice = await carp.initialPrice();


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
            await expect(carp.connect(alice).upgradeStake(extraAmount, 1)).to.be.revertedWith('no such stake id');
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
                await carp.connect(alice).deposit(aliceAmount, termAlice);
                const tx = await carp.connect(bob).deposit(bobAmount, termBob);
                const receipt = await tx.wait();

                const block = await receipt.events[0].getBlock();
                bobTs = BigNumber.from(block.timestamp);
                await carp.connect(charlie).deposit(charlieAmount, termCharlie);
            })

            it('should correct show users penalty', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(bob.address, 0);                  
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                const penalty = await carp.getPenalty(bob.address, 0);
                const stakeTs = stakeInfo.ts;

                const bobBalanceAfter = await token.balanceOf(bob.address);
                const totalPenalty = bobAmount.mul(termBob.sub(bobTs.add(ONE)).add(stakeTs)).div(termBob);
                expect(penalty).to.be.equal(totalPenalty);

            })

            it('shouldnt withdraw if already withdrawn', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await carp.connect(bob).withdraw(0);
                await expect(carp.connect(bob).withdraw(0)).to.be.revertedWith('stake was deleted');

            })

            it('shouldnt withdraw unexisting stake', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await expect(carp.connect(bob).withdraw(1)).to.be.revertedWith('no such stake id');

            })

            it('bob early withdraws', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(bob.address, 0);;
                const stakeTs = stakeInfo.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                let contractBalanceBefore = await token.balanceOf(carp.address);
                expect(charityBalanceBefore).to.be.equal(0);
                expect(communityBalanceBefore).to.be.equal(0);
                expect(burnBalanceBefore).to.be.equal(0);
                expect(contractBalanceBefore).to.be.equal(aliceAmount.add(bobAmount).add(charlieAmount));
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                const tx = await carp.connect(bob).withdraw(0);
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

                const poolLambda = await carp.lambda();
                const poolTotalShares = await carp.totalShares();
                const poolCurrentPrice = await carp.currentPrice();
                const poolInitialPrice = await carp.initialPrice();
                

                const eventName = receipt.events[receipt.events.length - 1].event;
                const eventWho = receipt.events[receipt.events.length - 1].args.who;
                const eventDeposit = receipt.events[receipt.events.length - 1].args.deposit;
                const eventReward = receipt.events[receipt.events.length - 1].args.reward;
                const eventPenalty = receipt.events[receipt.events.length - 1].args.penalty;

                let charityBalanceAfter = await token.balanceOf(charity.address);
                let communityBalanceAfter = await token.balanceOf(community.address);
                let ownerBalanceAfter = await token.balanceOf(owner.address);
                let burnBalanceAfter = await token.balanceOf(DEAD_WALLET);
                let contractBalanceAfter = await token.balanceOf(carp.address);

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
                expect(contractBalanceBefore.sub(contractBalanceAfter).div(HUN)).to.be.equal(bobAmount.sub(penaltyToPool).div(HUN));

                const aliceReward = await carp.getReward(alice.address, 0);
                const bobReward = await carp.getReward(bob.address, 0);
                const charlieReward = await carp.getReward(charlie.address, 0);

                expect(aliceReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_alice).div(totalShares).div(TEN));
                expect(charlieReward.div(TEN)).to.be.equal(penaltyToPool.mul(S_charlie).div(totalShares).div(TEN));
                expect(bobReward.div(TEN)).to.be.equal(0); 

                expect(eventName).to.be.equal('Withdraw');
                expect(eventWho).to.be.equal(bob.address);
                expect(eventDeposit).to.be.equal(bobAmount);
                expect(eventReward).to.be.equal(0);
                expect(eventPenalty).to.be.equal(totalPenalty);

            })

            it('bob withdraw after stake matured', async() => {
                const bobBalanceBefore = await token.balanceOf(bob.address);
                const stakeInfo = await carp.stakes(bob.address, 0);;
                const stakeTs = stakeInfo.ts;
                let charityBalanceBefore = await token.balanceOf(charity.address);
                let communityBalanceBefore = await token.balanceOf(community.address);
                let ownerBalanceBefore = await token.balanceOf(owner.address);
                let burnBalanceBefore = await token.balanceOf(DEAD_WALLET);
                await ethers.provider.send('evm_increaseTime', [+termBob.toString()]); 
                const tx = await carp.connect(bob).withdraw(0);
                const receipt = await tx.wait();
                const bobBalanceAfter = await token.balanceOf(bob.address);
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);

                const poolLambda = await carp.lambda();
                const poolTotalShares = await carp.totalShares();
                const poolCurrentPrice = await carp.currentPrice();
                const poolInitialPrice = await carp.initialPrice();


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

                const aliceReward = await carp.getReward(alice.address, 0);
                const bobReward = await carp.getReward(bob.address, 0);
                const charlieReward = await carp.getReward(charlie.address, 0);

                expect(aliceReward).to.be.equal(0);
                expect(charlieReward).to.be.equal(0);
                expect(bobReward).to.be.equal(0); 

            })

            it('shouldnt give darwin reward for bobs early withdraw if darwin came after ', async() => {
                await ethers.provider.send('evm_increaseTime', [1.5*YEAR]); 
                await carp.connect(bob).withdraw(0);
                const darwinAmount = ethers.utils.parseEther('1');
                const termDarwin = YEAR;
                await ethers.provider.send('evm_increaseTime', [termDarwin]); 
                await token.connect(darwin).approve(carp.address, darwinAmount);
                await carp.connect(darwin).deposit(darwinAmount, termDarwin);
                const darwinReward = await carp.getReward(darwin.address, 0);
                expect(darwinReward.div(TEN)).to.be.equal(0); 
            })

            it('should give darwin reward if bob early withdraws, darwin came after and charlie early withdraw', async() => {
                const stakeInfo = await carp.stakes(bob.address, 0);;
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
                const tx = await carp.connect(bob).withdraw(0);
                
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
                await carp.connect(darwin).deposit(darwinAmount, termDarwin);

                const s_darwin = darwinAmount.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(INITIAL_PRICE);
                const S_darwin = s_darwin.add(calculateBBonus(s_darwin, darwinAmount)).add(calculateLBonus(s_darwin, termDarwin));
                

                const termBeforeCharlieWithdraw = 1*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 


                const charlieBalanceBefore = await token.balanceOf(charlie.address);
                const charlieStake = await carp.stakes(charlie.address, 0);;
                const charlieStakeTs = charlieStake.ts;

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);

                const charlieTx = await carp.connect(charlie).withdraw(0);

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

                let charlieCharityBalanceAfter = await token.balanceOf(charity.address);
                let charlieCommunityBalanceAfter = await token.balanceOf(community.address);
                let charlieOwnerBalanceAfter = await token.balanceOf(owner.address);
                let charlieBurnBalanceAfter = await token.balanceOf(DEAD_WALLET);

                const poolLambdaAfter = await carp.lambda();
                const poolTotalSharesAfter = await carp.totalShares();
                const poolCurrentPriceAfter = await carp.currentPrice();
                const poolInitialPriceAfter = await carp.initialPrice();

                expect(poolLambdaAfter).to.be.equal((
                    penaltyToPoolBefore.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(totalShares)).add(
                    charliePenaltyToPool.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(charlieTotalShares)
                ));
                    

                expect(poolTotalSharesAfter).to.be.equal(charlieTotalShares);
                expect(poolInitialPriceAfter).to.be.equal(INITIAL_PRICE);
                
                expect(charlieCharityBalanceAfter.sub(charityBalanceAfter)).to.be.equal(charlieCharityPenalty);
                expect(charlieCommunityBalanceAfter.sub(communityBalanceAfter)).to.be.equal(charlieCommunityPenalty);
                expect(charlieOwnerBalanceAfter.sub(ownerBalanceAfter)).to.be.equal(charlieOwnerPenalty);
                expect((charlieBurnBalanceAfter.sub(burnBalanceAfter)).div(HUN)).to.be.equal(charlieBurnPenalty.div(HUN));

                const aliceReward = await carp.getReward(alice.address, 0);
                const bobReward = await carp.getReward(bob.address, 0);
                const charlieReward = await carp.getReward(charlie.address, 0);
                const darwinReward = await carp.getReward(darwin.address, 0);

                expect(aliceReward.div(HUN)).to.be.equal(
                    (penaltyToPoolBefore.mul(S_alice).div(totalShares).add(
                        charliePenaltyToPool.mul(S_alice).div(charlieTotalShares)).div(HUN)
                    ));
                expect(charlieRewardBefore.div(TEN)).to.be.equal(penaltyToPoolBefore.mul(S_charlie).div(totalShares).div(TEN));
                expect(darwinReward.div(HUN)).to.be.equal(charliePenaltyToPool.mul(S_darwin).div(charlieTotalShares).div(HUN));
                expect(bobReward.div(TEN)).to.be.equal(0); 
                expect(charlieReward.div(TEN)).to.be.equal(0); 

            })

            it('should correct calculate new price ', async() => {
                const stakeInfo = await carp.stakes(bob.address, 0);;
                const stakeTs = stakeInfo.ts;

                const termBeforeBobWithdraw = 1.5*YEAR;
                await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                const tx = await carp.connect(bob).withdraw(0);
                
                const receipt = await tx.wait();
                const block = await receipt.events[0].getBlock();
                const ts = BigNumber.from(block.timestamp);
                const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);
                const penaltyToPoolBefore = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                const termBeforeCharlieWithdraw = 2.5*YEAR;

                await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 

                const totalShares = S_charlie.add(S_alice);

                const charlieRewardBefore = penaltyToPoolBefore.mul(S_charlie).div(totalShares);
                const charlieStake = await carp.stakes(charlie.address, 0);
                const charlieStakeAmount = charlieStake.amount;

                await carp.connect(charlie).withdraw(0);
                const poolCurrentPriceAfter = await carp.currentPrice();

                expect(poolCurrentPriceAfter.div(HUN)).to.be.equal( (charlieRewardBefore.add(charlieStakeAmount)).mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(s_charlie).div(HUN) );

            })

            describe('upgradeStake tests', async() => {
                const termBeforeBobWithdraw = 0.5*YEAR;
                let totalShares: any;
                let lastLambda: any;
                let penaltyToPool: any;

                beforeEach('bob replenishes the pool', async() => {
                    await ethers.provider.send('evm_increaseTime', [termBeforeBobWithdraw]); 
                    const stakeInfo = await carp.stakes(bob.address, 0);;
    
                    const tx = await carp.connect(bob).withdraw(0);
                    totalShares = S_alice.add(S_charlie);
                    const stakeTs = stakeInfo.ts;
    
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const ts = BigNumber.from(block.timestamp);
                    const totalPenalty = bobAmount.mul(termBob.sub(ts).add(stakeTs)).div(termBob);

                    penaltyToPool = totalPenalty.mul(INTEREST_PERCENT).div(PERCENT_BASE);
                    lastLambda = penaltyToPool.mul(LAMBDA_COEF).mul(LAMBDA_COEF).div(totalShares);
    
                })

                it('shouldnt upgrade stake if extra deposit is zero', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    await expect(carp.connect(alice).upgradeStake(0, 0)).to.be.revertedWith('deposit cannot be zero');
                })
                it('shouldnt upgrade stake if stake matured', async() => {
                    const termBeforeAliceExtra = 2 * YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await expect(carp.connect(alice).upgradeStake(0, extraAmount)).to.be.revertedWith('stake matured');
                })
                it('shouldnt upgrade stake if stake was deleted (withdraw)', async() => {
                    const termBeforeAliceExtra = 2 * YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await carp.connect(alice).withdraw(0);

                    await expect(carp.connect(alice).upgradeStake(0, extraAmount)).to.be.revertedWith('stake was deleted');
                })

                it('should correct upgrade stake', async() => {
                    const termBeforeAliceExtra = 0.1*YEAR;
                    await ethers.provider.send('evm_increaseTime', [termBeforeAliceExtra]); 
                    const extraAmount = ethers.utils.parseEther('10');
                    await token.connect(alice).approve(carp.address, extraAmount);
                    const tx = await carp.connect(alice).upgradeStake(0, extraAmount);
                    const receipt = await tx.wait();
                    const block = await receipt.events[0].getBlock();
                    const timestamp = block.timestamp;
                    const stakeInfo = await carp.stakes(alice.address, 0);;
                    const userShares = stakeInfo.shares;
                    const userSharesWithBonuses = stakeInfo.sharesWithBonuses;
                    const userLastLambda = stakeInfo.lastLambda;
                    const userAssignedReward = stakeInfo.assignedReward;

                    const stakeAmount = stakeInfo.amount;
                    const stakeTerm = stakeInfo.term;
                    const stakeTs = stakeInfo.ts;

                    const poolTotalShares = await carp.totalShares();

                    const eventName = receipt.events[receipt.events.length - 1].event;
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
                        const tx = await carp.connect(charlie).withdraw(0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);

                        const receipt = await tx.wait();
                        const block = await receipt.events[0].getBlock();

                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares);
                        const charlieIncome = charlieAmount.add(charlieReward);
                        const latePenalty = charlieReward.mul(PENALTY_PERCENT_PER_WEEK).mul(bigLateWeeks).div(PERCENT_BASE);
                        const charlieProfit = charlieIncome.sub(latePenalty);
    
                        expect(charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN)).to.be.equal(charlieProfit.div(HUN));
            
                    })

                    it('shouldnt take penalty if claimed in free late period (1 week)', async() => {
                
                        const latePeriod = 6*DAY;
                        const termBeforeCharlieWithdraw = 3.5*YEAR + latePeriod;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        await carp.connect(charlie).withdraw(0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);
                        const charlieReward = penaltyToPool.mul(S_charlie).div(totalShares);
                        const charlieIncome = charlieAmount.add(charlieReward);

                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieIncome.div(HUN));
            
                    })

                    it('should withdraw only deposit if claim is too late', async() => {

                        const latePeriod = 51*WEEK;
                        const termBeforeCharlieWithdraw = 3.5*YEAR + latePeriod;
                        await ethers.provider.send('evm_increaseTime', [termBeforeCharlieWithdraw]); 
                        const charlieBalanceBefore = await token.balanceOf(charlie.address);
                        await carp.connect(charlie).withdraw(0);
                        const charlieBalanceAfter = await token.balanceOf(charlie.address);
    
                        expect((charlieBalanceAfter.sub(charlieBalanceBefore).div(HUN))).to.be.equal(charlieAmount.div(HUN));
            
                    })
                })
    
            })

        })
    })

})
