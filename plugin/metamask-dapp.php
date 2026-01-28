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

function metamask_dapp_register_scripts() {
    static $registered = false;

    if ($registered) {
        return;
    }

    $registered = true;

    $asset_dir = plugin_dir_path(__FILE__) . 'assets/';
    $asset_url = plugin_dir_url(__FILE__) . 'assets/';

    $app_file = $asset_dir . 'metamask-dapp.js';
    $style_file = $asset_dir . 'sqmu-dapp.css';

    $app_version = file_exists($app_file) ? filemtime($app_file) : '0.1.0';
    $style_version = file_exists($style_file) ? filemtime($style_file) : '0.1.0';

    wp_register_script(
        'metamask-dapp-ethers',
        'https://cdn.jsdelivr.net/npm/ethers@5.7.2/dist/ethers.umd.min.js',
        array(),
        '5.7.2',
        true
    );

    wp_register_script(
        'metamask-dapp-metamask-sdk',
        'https://unpkg.com/@metamask/sdk@0.30.1/dist/browser/umd/metamask-sdk.js',
        array(),
        '0.30.1',
        true
    );

    wp_register_script(
        'metamask-dapp-app',
        $asset_url . 'metamask-dapp.js',
        array('metamask-dapp-ethers', 'metamask-dapp-metamask-sdk'),
        $app_version,
        true
    );

    wp_register_style(
        'sqmu-dapp',
        $asset_url . 'sqmu-dapp.css',
        array(),
        $style_version
    );
}
add_action('wp_enqueue_scripts', 'metamask_dapp_register_scripts');

function metamask_dapp_get_config() {
    return array(
        'chainId' => null,
        'mountSelector' => '#metamask-dapp'
    );
}

function metamask_dapp_enqueue_assets() {
    metamask_dapp_register_scripts();

    wp_localize_script(
        'metamask-dapp-app',
        'metamaskDappConfig',
        metamask_dapp_get_config()
    );

    wp_enqueue_script('metamask-dapp-ethers');
    wp_enqueue_script('metamask-dapp-metamask-sdk');
    wp_enqueue_script('metamask-dapp-app');
    wp_enqueue_style('sqmu-dapp');
}

function sqmu_render_template($template_name) {
    $template_path = plugin_dir_path(__FILE__) . 'templates/' . $template_name;

    if (!file_exists($template_path)) {
        return '';
    }

    ob_start();
    include $template_path;
    return ob_get_clean();
}

function sqmu_listing_shortcode() {
    metamask_dapp_enqueue_assets();
    return sqmu_render_template('listing-buy.php');
}
add_shortcode('sqmu_listing', 'sqmu_listing_shortcode');

function sqmu_portfolio_shortcode() {
    metamask_dapp_enqueue_assets();
    return sqmu_render_template('portfolio.php');
}
add_shortcode('sqmu_portfolio', 'sqmu_portfolio_shortcode');
