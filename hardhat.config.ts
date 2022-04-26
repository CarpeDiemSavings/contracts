import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import "solidity-coverage"
import "hardhat-gas-reporter"
import '@nomiclabs/hardhat-etherscan'
import 'hardhat-deploy'
import 'hardhat-deploy-ethers'
import fs from "fs"
import dotenv from 'dotenv'
dotenv.config()
const mnemonic = fs.readFileSync('.secret').toString().trim();

export default {
    networks: {
        hardhat: {
            allowUnlimitedContractSize: false,
        },
        mainnet: {
            url: `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
            chainId: 1,
            gasPrice: 100000000000,
            accounts: {mnemonic: mnemonic}
        },
        rinkeby: {
            url: `https://rinkeby.infura.io/v3/${process.env.INFURA_ID}`,
            chainId: 4,
            gasPrice: 7000000000,
            accounts: {mnemonic: mnemonic}
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    solidity: {
        version: '0.8.13',
        settings: {
            optimizer: {
                enabled: true,
                runs: 999999,
            },
            metadata: {
                // do not include the metadata hash, since this is machine dependent
                // and we want all generated code to be deterministic
                // https://docs.soliditylang.org/en/v0.7.6/metadata.html
                bytecodeHash: 'none',
            },
        },
    },
    typechain: {
        outDir: 'typechain',
        target: 'ethers-v5',
        alwaysGenerateOverloads: false, // should overloads with full signatures like deposit(uint256) be generated always, even if there are no overloads?
    },
    paths: {
        sources: 'contracts',
    },
}
