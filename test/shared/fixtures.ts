import {Wallet} from "ethers"
import {MockProvider} from "ethereum-waffle"
import {artifacts, ethers, waffle} from "hardhat"
import * as FactoryABI from "../../artifacts/contracts/CarpediemFactory.sol/CarpediemFactory.json"

import {
    BBonus,
    BBonusMaxPercent,
    INITIAL_PRICE,
    LBonus,
    LBonusMaxPercent,
    penaltyPercents,
    TOTALSUPPLY
} from "./constants"

export async function fixture(_signers: Wallet[], _mockProvider: MockProvider) {
    const factory = await waffle.deployContract(_signers[0], FactoryABI)
    const Token = await ethers.getContractFactory('Token')
    const token = await Token.deploy(TOTALSUPPLY)
    await factory.createPool(
        token.address, INITIAL_PRICE, BBonus, LBonus, BBonusMaxPercent, LBonusMaxPercent, penaltyPercents,
        [_signers[0].address, _signers[1].address, _signers[2].address]
    )
    const poolAddress = await factory.allPools(0)
    const carpArtifacts = await artifacts.readArtifact("CarpeDiem")
    const carp = new ethers.Contract(poolAddress, carpArtifacts.abi, ethers.provider)
    await token.transfer(_signers[3].address, ethers.utils.parseEther('1000000')) // alice
    await token.transfer(_signers[4].address, ethers.utils.parseEther('1000000')) // bob
    await token.transfer(_signers[5].address, ethers.utils.parseEther('1000000')) // charlie
    await token.transfer(_signers[6].address, ethers.utils.parseEther('1000000')) // darwin
    await token.transfer(_signers[8].address, ethers.utils.parseEther('1000000')) // mike
    return {factory, carp, token}
}
