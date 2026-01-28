<?php
if (!defined('ABSPATH')) {
    exit;
}
?>
<div class="wp-block-group sqmu-portfolio">
  <h3 class="has-text-align-center sqmu-heading">SQMU Portfolio</h3>
  <div class="wp-block-buttons">
    <div class="wp-block-button"><button id="connect" class="wp-block-button__link">Connect Wallet</button></div>
    <div class="wp-block-button"><button id="disconnect" class="wp-block-button__link sqmu-hidden">Disconnect</button></div>
  </div>
  <p id="portfolio-status" class="has-small-font-size"></p>

  <div class="wp-block-group sqmu-private-portfolio">
    <h4 class="has-text-align-center sqmu-subheading">Private Portfolio</h4>
    <table id="portfolio-table" class="sqmu-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>SQMU Balance</th>
          <th>Value (USD)</th>
          <th>Amount</th>
          <th>Sell</th>
        </tr>
      </thead>
      <tbody></tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td id="total-sqmu"></td>
          <td id="total-usd"></td>
          <td></td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="wp-block-group sqmu-public-listings">
    <h4 class="has-text-align-center sqmu-subheading">Public Listings</h4>
    <table id="listing-table" class="sqmu-table">
      <thead>
        <tr>
          <th>Property</th>
          <th>Available SQMU</th>
          <th>Price (USD)</th>
          <th>Stablecoin</th>
          <th>Amount</th>
          <th>Buy</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  </div>

  <p id="trade-status" class="has-small-font-size"></p>
</div>

<!-- This widget loads https://np-vincent.github.io/SQMU-Scroll/js/portfolio.js.
     After connecting your wallet it lists each property code with your
     balance and the USD value returned by AtomicSQMUDistributor for that
     amount of SQMU. -->
