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
  .sqmu-listing-buy > * + * {
    margin-top: 1em;
  }
</style>

<div class="wp-block-group sqmu-listing-buy">
  <h3 class="wp-block-heading">SQMU Purchase</h3>
  <p>Property Code: <span id="property-code"></span></p>
  <p>Available: <span id="available-bal">...</span> SQMU</p>

  <div class="wp-block-buttons">
    <div class="wp-block-button">
      <button id="connect" class="wp-block-button__link">Connect Wallet</button>
    </div>
    <div class="wp-block-button">
      <button id="disconnect" class="wp-block-button__link" style="display:none;">Disconnect</button>
    </div>
  </div>

  <div class="wp-block-group">
    <label for="sqmu-amount" class="has-text-align-center" style="font-weight:bold;">SQMU Amount</label>
    <input id="sqmu-amount" type="number" value="0.01" step="0.01" class="wp-block-input">
  </div>

  <div class="wp-block-group">
    <label for="token-select" class="has-text-align-center" style="font-weight:bold;">Payment Token</label>
    <select id="token-select" class="wp-block-select">
      <option value="0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df">USDT (Scroll)</option>
      <option value="0x06eFdBFf2a14a7c8E15944D1F4A48F9F95F663A4">USDC (Scroll)</option>
      <option value="0xdb9E8F82D6d45fFf803161F2a5f75543972B229a">USDQ (Scroll)</option>
    </select>
  </div>

  <div class="wp-block-group">
    <label for="agent-code" class="has-text-align-center" style="font-weight:bold;">Agent Code (optional)</label>
    <input id="agent-code" type="text" class="wp-block-input">
  </div>

  <div class="wp-block-group">
    <label for="buyer-email" class="has-text-align-center" style="font-weight:bold;">Email (optional)</label>
    <input id="buyer-email" type="email" class="wp-block-input">
  </div>

  <div class="wp-block-button">
    <button id="buy-btn" class="wp-block-button__link" disabled>Buy</button>
  </div>

  <p id="buy-status" class="has-small-font-size"></p>
</div>

<script>
  // This widget loads https://np-vincent.github.io/SQMU-Scroll/js/listing_buy.js.
  // It combines property availability lookup and purchase into a single embed.
</script>
