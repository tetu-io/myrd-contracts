// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../interfaces/IERC20Burnable.sol";

contract Sale {

  uint public constant SALE_TOTAL_AMOUNT = 4_000_000e18;

  address public immutable governance;
  address public immutable payToken;
  uint public immutable price;
  uint public immutable start;
  uint public immutable end;

  address public tokenToSale;
  uint public sold;
  mapping(address user => uint bought) public bought;

  constructor(
    address _gov,
    address _payToken,
    uint _price,
    uint _start,
    uint _end
  ) {
    require(_gov != address(0), "zero gov");
    require(_payToken != address(0), "zero pay");
    require(_price > 0, "zero price");
    require(_start > block.timestamp, "incorrect start");
    require(_end > _start + 1 days, "incorrect end");

    governance = _gov;
    payToken = _payToken;
    price = _price;
    start = _start;
    end = _end;
  }

  // anyone can call, assume to be called during the token deploy
  function setupTokenToSale(address token) external {
    require(token != address(0), "zero token");
    require(tokenToSale == address(0), "already");
    require(IERC20(token).balanceOf(address(this)) == SALE_TOTAL_AMOUNT, "incorrect supply");

    tokenToSale = token;
  }

  // anyone can call after the sale end
  function burnNotSold() external {
    address _token = tokenToSale;
    require(_token != address(0) && block.timestamp > end, 'not ended');

    uint toBurn = IERC20(_token).balanceOf(address(this));
    require(toBurn != 0, 'nothing to burn');
    IERC20Burnable(_token).burn(toBurn);
  }

  function buy(uint amount) external {
    require(block.timestamp >= start, "Sale is not started yet");
    require(block.timestamp < end, "Sale ended");
    require(sold + amount <= SALE_TOTAL_AMOUNT, "Too much");

    uint totalBought = bought[msg.sender];
    require(totalBought + amount <= SALE_TOTAL_AMOUNT / 10, "Too much for user");

    uint toSpend = amount * price / 1e18;
    require(toSpend > 0, "Zero amount");

    sold += amount;
    IERC20(payToken).transferFrom(msg.sender, governance, toSpend);
    bought[msg.sender] = totalBought + amount;
  }

  function claim() external {
    address _token = tokenToSale;
    require(_token != address(0) && block.timestamp >= end, 'sale not ended');

    uint userBought = bought[msg.sender];
    require(userBought > 0, 'bought zero');

    bought[msg.sender] = 0;
    IERC20(_token).transfer(msg.sender, userBought);
  }
}
