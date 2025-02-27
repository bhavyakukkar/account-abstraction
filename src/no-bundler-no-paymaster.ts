import hre, { config, getChainId, network } from "hardhat";
import { packUserOp, signUserOp } from '../test/UserOp';
import ethers, { Wallet, Contract, Signer, getDefaultProvider } from "ethers";
import { HardhatNetworkHDAccountsConfig } from "hardhat/types";
import { UserOperation } from "../test/UserOperation";


const HOLESKY_EP_ADDRESS_V0_6 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const HOLESKY_EP_ADDRESS_V0_7 = "0x0000000071727de22e5e9d8baf0edac6f37da032";


// TODO send the initialization user-operation to the entrypoint letting it know that our account is not deployed yet, and the calldata to be invoked to successfully deploy it

async function main() {
  const accounts = config.networks.hardhat.accounts;
  const me = (Array.isArray(accounts) ?
    new Wallet(accounts[0].privateKey) :
    Wallet.fromMnemonic((accounts as HardhatNetworkHDAccountsConfig).mnemonic, (accounts as HardhatNetworkHDAccountsConfig).path + '/0')).connect(hre.ethers.provider);

  const friend = Wallet.createRandom();
  console.log(`Friend's address: ${friend.address}`);

  const beneficiary = Wallet.createRandom();
  console.log(`Beneficiary's address: ${beneficiary.address}`);

  const ep = await (await hre.ethers.getContractFactory("EntryPoint")).deploy();
  // const ep = await hre.ethers.getContractAt("EntryPoint", HOLESKY_EP_ADDRESS_V0_6);
  console.log(`EP deployed to: ${ep.address}`);

  const af = await (await hre.ethers.getContractFactory("SimpleAccountFactory")).deploy(ep.address);
  console.log(`AF deployed to: ${af.address}`);

  // Manually deploy and initialize the Account by directly calling `AccountFactory.createAccount` instead of delegating it to the entrypoint
  await af.createAccount(me.address, 0);

  const acc_addr = await af.getAddress(me.address, 0);
  const acc = await hre.ethers.getContractAt("SimpleAccount", acc_addr);
  console.log(`ACC deployed to: ${acc.address}`);

  console.log("ACC's known EP address:", await acc.entryPoint());

  // add some tokens to our account contract from which we will send some to our friend
  await me.connect(hre.ethers.provider).sendTransaction({
    to: acc_addr,
    value: hre.ethers.utils.parseEther("0.2"),
  });

  {
    console.log("ACC's balance now: \t\t",
      Number(await network.provider.send("eth_getBalance", [acc_addr])));
    console.log("Friend's balance now: \t\t",
      (await friend.connect(hre.ethers.provider).getBalance()).toString());
    console.log("Beneficiary's balance now: \t",
      (await beneficiary.connect(hre.ethers.provider).getBalance()).toString());
  }

  let packedUserOp;

  // Construct of User Operation
  {
    // Get the entrypoint's associated nonce with our account
    const nonce = await ep.getNonce(acc_addr, 0);

    // Encode the call that our account will execute when the user-operation is executed
    // Our Account has a method called `execute()` which takes a recipient address, a value and some calldata to be invoked on the recipient address
    // Since we're directly paying an EOA, we include no further calldata to invoke on the receipient contract
    const callData = acc.interface.encodeFunctionData("execute", [
      /*dest or target*/ friend.address,
      /*value*/ hre.ethers.utils.parseEther("0.1"),
      /*func or data*/ '0x'
    ]);

    const userOp: UserOperation = {
      sender: acc_addr,
      nonce,
      initCode: "0x",
      callData,
      callGasLimit: '0x' + (500000).toString(16),
      verificationGasLimit: '0x' + (500000).toString(16),
      preVerificationGas: '0x' + (5000000).toString(16),
      maxFeePerGas: "0x4ae68fe4",
      maxPriorityFeePerGas: '0x' + (200000).toString(16),
      paymaster: "0x",
      paymasterData: "0x",
      paymasterPostOpGasLimit: "0x",
      paymasterVerificationGasLimit: "0x",
      signature: "0x",
    };

    packedUserOp = packUserOp(signUserOp(userOp as UserOperation, me, ep.address, Number.parseInt(await getChainId())));
  }
  console.log("Packed User-Operation:", packedUserOp);

  // try sending user-op without staking any deposit
  try {
    await ep.handleOps([packedUserOp], beneficiary.address, {
      gasLimit: 200000,
    });
  }
  catch (e) {
    console.log(`UserOp failed (as expected) with reason: ${e}`);
  }

  // add some tokens to our stake on the entrypoint to cover all fees
  await ep.depositTo(acc_addr, { value: hre.ethers.utils.parseEther("10") });
  console.log("Staked 10 ETH to the EntryPoint");

  // try sending the user-op again after having staked some deposit
  await ep.handleOps([packedUserOp], beneficiary.address);

  {
    console.log("ACC's balance now: \t\t",
      Number(await network.provider.send("eth_getBalance", [acc_addr])));
    console.log("Friend's balance now: \t\t",
      (await friend.connect(hre.ethers.provider).getBalance()).toString());
    console.log("Beneficiary's balance now: \t",
      (await beneficiary.connect(hre.ethers.provider).getBalance()).toString());
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
