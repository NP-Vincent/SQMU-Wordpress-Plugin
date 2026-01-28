<?php
if (!defined('ABSPATH')) {
    exit;
}
?>
<style>
  .wp-block-input,
  .wp-block-select {
    width: 100%;
    font-size: 1rem;
    padding: 0.5em;
  }
  .sqmu-portfolio > * + * { margin-top: 1em; }
  .sqmu-private-portfolio > * + * { margin-top: 1em; }
  .sqmu-public-listings > * + * { margin-top: 1em; }
  table { border-collapse: collapse; margin-top: 1em; }
  th, td { padding: 0.5em 1em; border: 1px solid #ccc; text-align: left; }
  tfoot td { font-weight: bold; }
  #listing-table { display: block; overflow-x: auto; }
  #listing-table th, #listing-table td { white-space: nowrap; }
</style>

<div class="wp-block-group sqmu-portfolio">
  <h3 class="has-text-align-center" style="font-weight:bold;">SQMU Portfolio</h3>
  <div class="wp-block-buttons">
    <div class="wp-block-button"><button id="connect" class="wp-block-button__link">Connect Wallet</button></div>
    <div class="wp-block-button"><button id="disconnect" class="wp-block-button__link" style="display:none;">Disconnect</button></div>
  </div>
  <p id="portfolio-status" class="has-small-font-size"></p>

  <div class="wp-block-group sqmu-private-portfolio">
    <h4 class="has-text-align-center" style="font-weight:bold;">Private Portfolio</h4>
    <table id="portfolio-table">
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
    <h4 class="has-text-align-center" style="font-weight:bold;">Public Listings</h4>
    <table id="listing-table">
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
