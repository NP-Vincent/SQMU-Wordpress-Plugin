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

function metamask_dapp_should_enqueue_widget_assets() {
    if (!empty($GLOBALS['sqmu_widget_needs_assets'])) {
        return true;
    }

    if (is_singular()) {
        global $post;
        if (!$post) {
            return false;
        }
        return has_shortcode($post->post_content, 'metamask_dapp')
            || has_shortcode($post->post_content, 'sqmu_listing');
    }

    return false;
}

function metamask_dapp_enqueue_assets() {
    $asset_file = plugin_dir_path(__FILE__) . 'assets/metamask-dapp.js';
    $asset_path = plugin_dir_url(__FILE__) . 'assets/metamask-dapp.js';
    $asset_version = file_exists($asset_file) ? filemtime($asset_file) : '0.1.0';

    wp_register_script('metamask-dapp', $asset_path, array(), $asset_version, true);

    $global_config = array(
        'chainId' => null
    );

    $mount_configs = isset($GLOBALS['metamask_dapp_mounts'])
        ? $GLOBALS['metamask_dapp_mounts']
        : array();

    $config = array(
        'global' => apply_filters('metamask_dapp_global_config', $global_config),
        'mounts' => $mount_configs
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

    if (metamask_dapp_should_enqueue_widget_assets()) {
        wp_enqueue_style(
            'sqmu-widgets',
            plugins_url('assets/sqmu-widgets.css', __FILE__),
            array(),
            '1.0.0'
        );
    }

    wp_enqueue_script('metamask-dapp');
}
add_action('wp_enqueue_scripts', 'metamask_dapp_enqueue_assets');

function metamask_dapp_register_mount($widget, $atts) {
    if (!isset($GLOBALS['metamask_dapp_mounts'])) {
        $GLOBALS['metamask_dapp_mounts'] = array();
    }

    $mount_id = 'mmwp-' . wp_generate_uuid4();
    $config = array_filter(
        array(
            'chainId' => $atts['chain_id'] ?? null,
            'contractAddress' => $atts['contract_address'] ?? null,
            'rpcUrl' => $atts['rpc_url'] ?? null,
            'infuraApiKey' => $atts['infura_api_key'] ?? null,
            'dappName' => $atts['dapp_name'] ?? null,
            'dappUrl' => $atts['dapp_url'] ?? null,
            'propertyCode' => $atts['property_code'] ?? null,
            'tokenAddress' => $atts['token_address'] ?? null,
            'agentCode' => $atts['agent_code'] ?? null,
            'email' => $atts['email'] ?? null
        ),
        static function ($value) {
            return $value !== null && $value !== '';
        }
    );

    $GLOBALS['metamask_dapp_mounts'][$mount_id] = $config;
    $GLOBALS['sqmu_widget_needs_assets'] = true;

    $attributes = array(
        'id' => esc_attr($mount_id),
        'data-mmwp-widget' => esc_attr($widget),
        'class' => 'sqmu-widget'
    );

    foreach ($config as $key => $value) {
        $attr_key = 'data-mmwp-' . strtolower(preg_replace('/([a-z])([A-Z])/', '$1-$2', $key));
        $attributes[$attr_key] = esc_attr($value);
    }

    $html = '<div';
    foreach ($attributes as $attr => $value) {
        $html .= sprintf(' %s="%s"', $attr, $value);
    }
    $html .= '></div>';

    return $html;
}

function metamask_dapp_shortcode($atts) {
    $atts = shortcode_atts(
        array(
            'chain_id' => '',
            'contract_address' => '',
            'rpc_url' => '',
            'infura_api_key' => '',
            'dapp_name' => '',
            'dapp_url' => ''
        ),
        $atts,
        'metamask_dapp'
    );

    return metamask_dapp_register_mount('metamask-dapp', $atts);
}
add_shortcode('metamask_dapp', 'metamask_dapp_shortcode');

function sqmu_listing_shortcode($atts) {
    $atts = shortcode_atts(
        array(
            'chain_id' => '',
            'contract_address' => '',
            'rpc_url' => '',
            'infura_api_key' => '',
            'dapp_name' => '',
            'dapp_url' => '',
            'property_code' => '',
            'token_address' => '',
            'agent_code' => '',
            'email' => ''
        ),
        $atts,
        'sqmu_listing'
    );

    return metamask_dapp_register_mount('sqmu-listing', $atts);
}
add_shortcode('sqmu_listing', 'sqmu_listing_shortcode');
