import hre, { config, getChainId, network } from "hardhat";

const EP_ADDRESS = "0x03933C9C8e314C32DBAE194F020f93ff3528A98f";
const AF_ADDRESS = "0x50B3152953685AbcBb71517f304b3d3553694230";

async function main() {
  const [signer1] = await hre.ethers.getSigners();
  // const ep = await (await hre.ethers.getContractFactory("EntryPoint")).deploy();
  // const ep = await hre.ethers.getContractAt("EntryPoint", EP_ADDRESS);

  // const bundler = new hre.ethers.providers.JsonRpcProvider("http://localhost:3000/rpc");
  // console.log(await bundler.send("eth_getUserOperationReceipt", ["0x00c88a69ec2da31a39c0f737d00cba82e94aef13ddcf99e4f22ca47e189858f3"]));

  // console.log(await ep.balanceOf("0x5017d65507838685B28fFE3143A2b2cD7fbf6d9c"));

  // const af = await hre.ethers.getContractAt("SimpleAccountFactory", AF_ADDRESS);
  // console.log(await hre.ethers.provider.send("eth_call", [
  //   {
  //     to: AF_ADDRESS,
  //     data: "0x5fbfb9cf000000000000000000000000c56ccc7fcd52bb6abb23be05a2b39419ebad9e8b0000000000000000000000000000000000000000000000000000000000000001",
  //   },
  //   "latest",
  //   {}
  // ]));
  // console.log(await signer1.sendTransaction({
  //   to: AF_ADDRESS,
  //   data: "0x5fbfb9cf000000000000000000000000c56ccc7fcd52bb6abb23be05a2b39419ebad9e8b0000000000000000000000000000000000000000000000000000000000000001"
  // }));

  console.log(await hre.ethers.provider.getCode("0x8c138150b865B60888A6AfEB6A192dCE61606687"));
  // console.log(await hre.ethers.provider.getCode("0x0165878A594ca255338adfa4d48449f69242Eb8F"));
  // const acc = await hre.ethers.getContractAt("SimpleAccount", "0x8c138150b865B60888A6AfEB6A192dCE61606687");

  // console.log(await acc.getDeposit());
  const pm = await hre.ethers.getContractAt("VerifyingPaymaster", "0x0165878A594ca255338adfa4d48449f69242Eb8F");
  console.log(await pm.getDeposit());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
