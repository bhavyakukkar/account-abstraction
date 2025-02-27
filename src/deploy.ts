import hre from "hardhat";

const HOLESKY_EP_ADDRESS_V0_6 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

async function main() {
  // const ep = await (await hre.ethers.getContractFactory("EntryPoint")).deploy();
  // console.log(`EP deployed to ${ep.address}`);

  const af = await (await hre.ethers.getContractFactory("SimpleAccountFactory")).deploy(HOLESKY_EP_ADDRESS_V0_6);
  console.log(`AF deployed to ${af.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

