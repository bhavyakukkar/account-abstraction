import hre, { getChainId } from "hardhat";
// import { getUserOpHash, packUserOp, signUserOp } from '../test/UserOp';
import {
  Wallet,
} from "ethers";
// import { HardhatNetworkHDAccountsConfig } from "hardhat/types";
// import { UserOperation } from "../test/UserOperation";
import { keccak256 } from "ethers/lib/utils";
// import { UserOperationLib__factory } from "../typechain";
import {
  getUserOpHash,
  packUserOp,
  UserOperation
} from "../bundler/packages/utils";
import { createInterface } from "readline";
import util from 'util';

const HOLESKY_EP_ADDRESS_V0_6 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const HOLESKY_EP_ADDRESS_V0_7 = "0x0000000071727de22e5e9d8baf0edac6f37da032";
const NULL = "0x00";

// const EP_ADDRESS = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
// const AF_ADDRESS = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";
// const PM_ADDRESS = "0x0165878A594ca255338adfa4d48449f69242Eb8F";


async function deployContracts(): Promise<{
  EP_ADDRESS: string,
  AF_ADDRESS: string,
  PM_ADDRESS: string,
}> {
  const [me] = await hre.ethers.getSigners();
  console.log(`My balance: ${await me.getBalance()}`);

  // Deploy EntryPoint (singleton)
  const ep = await (await hre.ethers.getContractFactory("EntryPoint")).deploy();
  console.log(`EP deployed to: ${ep.address}`);

  // Deploy AccountFactory (reusable)
  const af = await (await hre.ethers.getContractFactory("SimpleAccountFactory")).deploy(ep.address);
  console.log(`AF deployed to: ${af.address}`);

  // Deploy Paymaster (reusable)
  const pm = await (await hre.ethers.getContractFactory("VerifyingPaymaster")).deploy(ep.address, me.address);
  console.log(`PM deployed to: ${pm.address}`);

  // Get the address of our Account contract from our own factory
  // We can do this before our Account is even deployed due to the deterministic CREATE2 EVM opcode
  const acc_addr = await af.getAddress(me.address, 1);

  // add some tokens to our account contract from which we will send some to our friend
  await me.sendTransaction({
    to: acc_addr,
    value: hre.ethers.utils.parseEther("0.2"),
  });

  // add some tokens to the account's stake on the entrypoint to cover all fees
  // await ep.depositTo(acc_addr, { value: hre.ethers.utils.parseEther("10") });

  // add some tokens to the paymaster's stake on the entrypoint to cover all fees
  await ep.depositTo(pm.address, { value: hre.ethers.utils.parseEther("120") });

  console.log(`${ep.address} ${af.address} ${pm.address}`);

  return {
    EP_ADDRESS: ep.address,
    AF_ADDRESS: af.address,
    PM_ADDRESS: pm.address
  };
}

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const question = util.promisify(rl.question).bind(rl);

  const ADDRESSES = (await question(
    "Are contracts already deployed? If so, concatenate them and enter here\n> "
  ) as unknown) as string;

  const { EP_ADDRESS, AF_ADDRESS, PM_ADDRESS } = (ADDRESSES.length == (42 * 3 + 2)) ? ({
    EP_ADDRESS: ADDRESSES.substring(0, 42),
    AF_ADDRESS: ADDRESSES.substring(42 + 1, 42 + 42 + 1),
    PM_ADDRESS: ADDRESSES.substring(42 + 42 + 2)
  }) : await deployContracts();

  if (ADDRESSES.length != (42 * 3 + 2)) {
    await question(
      "Contracts deployed, press <Enter> after starting Bundler with the deployed EntryPoint\n> "
    );
  }
  rl.close();

  const bundler = new hre.ethers.providers.JsonRpcProvider("http://localhost:3000/rpc");
  const [my_eoa] = await hre.ethers.getSigners();
  console.log(`My balance: ${my_eoa.getBalance()}`);

  const chainId = Number.parseInt(await getChainId());
  console.log({ chainId });

  const friend = Wallet.createRandom();
  console.log(`Friend's address: ${friend.address}`);

  const ep = await hre.ethers.getContractAt("EntryPoint", EP_ADDRESS);
  const af = await hre.ethers.getContractAt("SimpleAccountFactory", AF_ADDRESS);
  const pm = await hre.ethers.getContractAt("VerifyingPaymaster", PM_ADDRESS);

  const acc_factory = await hre.ethers.getContractFactory("SimpleAccount");

  // Get the address of our Account contract from our own factory
  // 
  // We can do this before our Account is even deployed due to the
  // deterministic CREATE2 EVM opcode
  const acc_addr = await af.getAddress(my_eoa.address, 1);
  console.log({ acc_addr });

  // Delegate to the entrypoint the duty of initializing our Account contract
  // by passing the calldata to deploy it (`AccountFactory.createAccount`)
  const factoryData = af.interface
    // `SimpleAccountFactory.createAccount(owner: my_eoa, salt: 1)`
    .encodeFunctionData("createAccount", [my_eoa.address, 1]);
  console.log({ factoryData });

  // Get the entrypoint's associated nonce with our account
  const nonce = (await ep.getNonce(acc_addr, 0)).toHexString();
  console.log({ nonce });

  // The call executed by the Entrypoint on the Account contract after the
  // UserOp is verified & validated
  const callData =
    keccak256(Buffer.from('entryPoint()')).slice(0, 10);
  // acc_factory.interface.encodeFunctionData("execute", [
  //   /*dest or target*/ friend.address,
  //   // /*value*/ hre.ethers.utils.parseEther("0.1"),
  //   /*value*/ "0x0",
  //   /*func or data*/ '0x'
  // ]);
  console.log({ callData });

  const acc_already_deployed = (await hre.ethers.provider.send("eth_getCode", [acc_addr]) != "0x");
  console.log({ acc_already_deployed });

  const userOp: UserOperation = {
    sender: acc_addr,
    nonce,

    factory: acc_already_deployed ?
      undefined :
      af.address,
    factoryData: acc_already_deployed ?
      undefined :
      factoryData,

    callData,

    // paymaster fields
    paymaster: PM_ADDRESS,
    paymasterPostOpGasLimit: "0x" + (5000000).toString(16),
    paymasterVerificationGasLimit: "0x" + (5000000).toString(16),

    // needs to be at least 100000, hardcoded here: https://github.com/eth-infinitism/bundler/blob/master/packages/sdk/src/BaseAccountAPI.ts#L147
    verificationGasLimit: "0x" + (500000).toString(16),
    preVerificationGas: "0x" + (20000000).toString(16),

    // call gas fields
    callGasLimit: NULL,
    maxFeePerGas: NULL,
    maxPriorityFeePerGas: NULL,

    // signature: placeholder as this field needs to be a valid address even
    // though we haven't signed the UserOp yet
    signature: "0x" + "f".repeat(130),
  };
  console.log({ userOp });

  // Adding placeholder `paymasterData` that will let UserOp simulation finish because it doesn't revert in
  // `validatePaymasterUserOp`, because the signature is still a valid signature (signed by us)
  {
    let packedUserOp = packUserOp(userOp);
    const paymasterData = await pm.getHash(packedUserOp, 0, 0);
    // sign the paymasterData ourself
    const signedPaymasterData = await my_eoa.signMessage(hre.ethers.utils.arrayify(paymasterData));

    userOp.paymasterData = "0x" +
      "0".repeat(32 * 2) + //validUntil - 32 bytes
      "0".repeat(32 * 2) + //validAfter - 32 bytes
      signedPaymasterData.slice(2);  //paymaster signature - 65 bytes (64 bytes is also valid)
  }

  const { maxFeePerGas, maxPriorityFeePerGas } = await hre.ethers.provider.getFeeData();
  if (maxFeePerGas === null) {
    throw "maxFeePerGas information not known";
  }
  if (maxPriorityFeePerGas === null) {
    throw "maxPriorityFeePerGas information not known";
  }
  console.log({ maxFeePerGas, maxPriorityFeePerGas });
  userOp.maxFeePerGas = maxFeePerGas.toHexString();
  userOp.maxPriorityFeePerGas = maxPriorityFeePerGas.toHexString();

  // const packedUserOp = packUserOp(userOp);
  // console.log({ packedUserOp });

  // const paymasterData = await pm.getHash(packedUserOp, 0, 0);
  // console.log({ paymasterData });
  // userOp.paymasterData = paymasterData;

  // sign the incomplete UserOp so that it can still be validated when passed
  // our account's validateUserOp during off-chain simulation via
  // `EntryPoint.simulateHandleOp` called by bundler's
  // `eth_estimateUserOperationGas` rpc method
  let userOpHash = getUserOpHash(userOp, EP_ADDRESS, chainId);
  console.log({ userOpHash });
  userOp.signature = await my_eoa.signMessage(hre.ethers.utils.arrayify(userOpHash));
  console.log({ signature: userOp.signature });

  // call bundler's `eth_estimateUserOperationGas` rpc method to get gas
  // estimates
  const { preVerificationGas, verificationGasLimit, callGasLimit } =
    await bundler.send("eth_estimateUserOperationGas", [
      userOp,
      EP_ADDRESS,
      // TODO add state override giving acc address 100 ETH
      // and move adding deposit to happen after this
    ]);
  console.log({ preVerificationGas, verificationGasLimit, callGasLimit });
  userOp.preVerificationGas = preVerificationGas;
  userOp.verificationGasLimit = verificationGasLimit;
  userOp.callGasLimit = callGasLimit;
  return;

  // const maxPriorityFeePerGas = await bundler.send(
  //   "rundler_maxPriorityFeePerGas",
  //   []
  // );
  // userOp.maxPriorityFeePerGas = maxPriorityFeePerGas;
  // console.log({ maxPriorityFeePerGas: userOp.maxPriorityFeePerGas });

  // const signedUserOp = signUserOp(
  //   userOp,
  //   new Wallet((config.networks.localgeth.accounts as string[])[0]),
  //   EP_ADDRESS,
  //   Number.parseInt(await getChainId())
  // );
  // console.log({ signedUserOp });

  // const packedUserOp = packUserOp(signedUserOp);
  // console.log({ packedUserOp });

  // userOp.paymaster = PM_ADDRESS;
  // userOp.paymasterPostOpGasLimit = "0x" + (500000).toString(16);
  // userOp.paymasterVerificationGasLimit = "0x" + (500000).toString(16);

  // Sign the UserOp again since our fields have been changed
  userOpHash = getUserOpHash(userOp, EP_ADDRESS, chainId);
  console.log({ userOpHash });
  userOp.signature =
    await my_eoa.signMessage(hre.ethers.utils.arrayify(userOpHash));
  console.log({ signature: userOp.signature });

  const opHash =
    await bundler.send("eth_sendUserOperation", [userOp, EP_ADDRESS]);
  console.log({ opHash });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
