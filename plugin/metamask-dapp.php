<?php
/**
 * Plugin Name: MetaMask WordPress dApp
 * Description: Boots the MetaMask WordPress dApp assets and mount point.
 * Version: 0.1.0
 * Author: SQMU
 */

if (!defined('ABSPATH')) {
    exit;
}

function metamask_dapp_enqueue_assets() {
    $asset_file = plugin_dir_path(__FILE__) . 'assets/metamask-dapp.js';
    $asset_path = plugin_dir_url(__FILE__) . 'assets/metamask-dapp.js';
    $asset_version = file_exists($asset_file) ? filemtime($asset_file) : '0.1.0';

    wp_register_script('metamask-dapp', $asset_path, array(), $asset_version, true);

    $config = array(
        'chainId' => null,
        'mountSelector' => '#metamask-dapp'
    );

    wp_add_inline_script(
        'metamask-dapp',
        'window.METAMASK_DAPP_CONFIG = ' . wp_json_encode($config) . ';',
        'before'
    );

    wp_add_inline_script(
        'metamask-dapp',
        'window.MetaMaskWP && window.MetaMaskWP.initMetaMaskDapp(window.METAMASK_DAPP_CONFIG || {});',
        'after'
    );

    wp_enqueue_script('metamask-dapp');
}
add_action('wp_enqueue_scripts', 'metamask_dapp_enqueue_assets');

function metamask_dapp_shortcode() {
    return '<div id="metamask-dapp"></div>';
}
add_shortcode('metamask_dapp', 'metamask_dapp_shortcode');
