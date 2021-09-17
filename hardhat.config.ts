import '@nomiclabs/hardhat-ethers'
import '@nomiclabs/hardhat-waffle'
import "solidity-coverage"
import "hardhat-gas-reporter"
import "@nomiclabs/hardhat-etherscan"
import 'hardhat-deploy'
import 'hardhat-deploy-ethers'
// import fs from 'fs';

// const mnemonic = fs.readFileSync('.secret').toString().trim();

export default {
    networks: {
        hardhat: {
            allowUnlimitedContractSize: false,
        },
        // mainnet: {
        //     url: `https://mainnet.infura.io/v3/${process.env.INFURA_ID}`,
        //     chainId: 1,
        //     gasPrice: 7000000000,
        //     accounts: {mnemonic: mnemonic}
        // },
        // rinkeby: {
        //     url: `https://rinkeby.infura.io/v3/c4bdce9e6c9341c29720a8edd4de6e94`,
        //     chainId: 4,
        //     // gasPrice: 2000000000000,
        //     accounts: {mnemonic: mnemonic}
        // },
    },
    // etherscan: {
    //     apiKey: 'SQMI6KNXQ76SA435HJC3SH66VBAC4GSBGC',
    // },
    solidity: {
        version: '0.8.7',
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
    namedAccounts: {
        deployer: 0,
    },
    paths: {
        sources: 'contracts',
    },
}
