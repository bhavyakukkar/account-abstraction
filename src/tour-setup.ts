import { Wallet } from "ethers";
import hre, { config, getChainId, network } from "hardhat";
import { HardhatNetworkAccountsConfig, HardhatNetworkHDAccountsConfig } from "hardhat/types";

// const BUNDLER_EP_ADDRESS = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

async function setup() {
  // const geth_provider = new hre.ethers.providers.JsonRpcProvider("http://localhost:40000");
  // const me = new Wallet("0xe5c4525b470a0a2f074528408fdbfe36132289fa5027ab94a030c9a5393d62f8").connect(geth_provider);
  const [me] = await hre.ethers.getSigners();
  console.log(`My balance: ${await me.getBalance()}`);

  // const accounts = config.networks.localgeth.accounts;
  // const me = (Array.isArray(accounts) ?
  //   new Wallet(accounts[0].privateKey) :
  //   Wallet.fromMnemonic((accounts as HardhatNetworkHDAccountsConfig).mnemonic, (accounts as HardhatNetworkHDAccountsConfig).path + '/0')).connect(hre.ethers.provider);

  // Deploy EntryPoint (singleton)
  const ep = await (await hre.ethers.getContractFactory("EntryPoint")).deploy();
  // const ep = await hre.ethers.getContractAt("EntryPoint", BUNDLER_EP_ADDRESS);
  console.log(`EP deployed to: ${ep.address}`);

  // Deploy AccountFactory (reusable)
  const af = await (await hre.ethers.getContractFactory("SimpleAccountFactory")).deploy(ep.address);
  console.log(`AF deployed to: ${af.address}`);

  const pm = await (await hre.ethers.getContractFactory("VerifyingPaymaster")).deploy(ep.address, me.address);
  console.log(`PM deployed to: ${pm.address}`);

  // Get the address of our Account contract from our own factory
  // We can do this before our Account is even deployed due to the deterministic CREATE2 EVM opcode
  const acc_addr = await af.getAddress(me.address, 1);
  // const acc = await hre.ethers.getContractAt("SimpleAccount", acc_addr);

  // add some tokens to our account contract from which we will send some to our friend
  await me.sendTransaction({
    to: acc_addr,
    value: hre.ethers.utils.parseEther("0.2"),
  });

  // add some tokens to our stake on the entrypoint to cover all fees
  await ep.depositTo(acc_addr, { value: hre.ethers.utils.parseEther("10") });

  // add some tokens to the paymaster's stake on the entrypoint to cover all fees
  await ep.depositTo(pm.address, { value: hre.ethers.utils.parseEther("10") });
}

setup().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
