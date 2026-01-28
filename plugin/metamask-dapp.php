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

    $vendor_file = $asset_dir . 'metamask-dapp.vendor.js';
    $app_file = $asset_dir . 'metamask-dapp.js';

    $vendor_version = file_exists($vendor_file) ? filemtime($vendor_file) : '0.1.0';
    $app_version = file_exists($app_file) ? filemtime($app_file) : '0.1.0';

    wp_register_script(
        'metamask-dapp-vendor',
        $asset_url . 'metamask-dapp.vendor.js',
        array(),
        $vendor_version,
        true
    );

    wp_register_script(
        'metamask-dapp-app',
        $asset_url . 'metamask-dapp.js',
        array('metamask-dapp-vendor'),
        $app_version,
        true
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

    wp_enqueue_script('metamask-dapp-vendor');
    wp_enqueue_script('metamask-dapp-app');
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
