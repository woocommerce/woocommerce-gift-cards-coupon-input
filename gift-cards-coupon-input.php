<?php
/**
* Plugin Name: Gift Cards - Coupon Input
* Plugin URI: https://woocommerce.com/products/gift-cards
* Description: Mini-extension for WooCommerce Gift Cards that allows you to use the default coupon form to apply and redeem gift cards.
* Version: 2.0.1
* Author: WooCommerce
* Author URI: https://woocommerce.com/
*
* Text Domain: woocommerce-gift-cards-coupon-input
* Domain Path: /languages/
*
* Requires at least: 6.2
* Tested up to: 6.6
*
* WC requires at least: 8.2
* WC tested up to: 9.1
*
* Copyright: © 2017-2024 WooCommerce.
* License: GNU General Public License v3.0
* License URI: http://www.gnu.org/licenses/gpl-3.0.html
*/

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Main plugin class.
 *
 * @class    WC_GC_Coupon_Input
 * @version  2.0.1
 */
class WC_GC_Coupon_Input {

	/**
	 * Plugin version.
	 *
	 * @var string
	 */
	public static $version = '2.0.1';

	/**
	 * Min required GC version.
	 *
	 * @var string
	 */
	public static $req_gc_version = '2.0';

	/**
	 * GC URL.
	 *
	 * @var string
	 */
	private static $gc_url = 'https://woocommerce.com/products/gift-cards/';

	/**
	 * Plugin URL.
	 *
	 * @return string
	 */
	public static function plugin_url() {
		return plugins_url( basename( plugin_dir_path(__FILE__) ), basename( __FILE__ ) );
	}

	/**
	 * Plugin path.
	 *
	 * @return string
	 */
	public static function plugin_path() {
		return untrailingslashit( plugin_dir_path( __FILE__ ) );
	}

	/**
	 * Fire in the hole!
	 */
	public static function init() {
		add_action( 'plugins_loaded', array( __CLASS__, 'load_plugin' ) );
	}

	/**
	 * Hooks.
	 */
	public static function load_plugin() {

		if ( ! function_exists( 'WC_GC' ) || version_compare( WC_GC()->get_plugin_version( true ), self::$req_gc_version ) < 0 ) {
			add_action( 'admin_notices', array( __CLASS__, 'gc_version_check_notice' ) );
			return false;
		}

		// Localization.
		add_action( 'init', array( __CLASS__, 'localize_plugin' ) );

		// Declare Blocks incompatibility.
		add_action( 'before_woocommerce_init', array( __CLASS__, 'declare_blocks_compatibility' ) );

		// Declare HPOS incompatibility.
		add_action( 'before_woocommerce_init', array( __CLASS__, 'declare_hpos_compatibility' ) );

		// Remove GC native form.
		if ( version_compare( WC_GC()->get_plugin_version( true ), '1.7.0' ) < 0 ) {
			remove_action( 'woocommerce_proceed_to_checkout', array( WC_GC()->cart, 'display_form' ), 9 );
			remove_action( 'woocommerce_review_order_before_submit', array( WC_GC()->cart, 'display_form' ), 9 );
		} else {
			remove_action( 'woocommerce_proceed_to_checkout', array( WC_GC()->cart, 'display_form' ), 9 );
			remove_action( 'woocommerce_review_order_before_payment', array( WC_GC()->cart, 'display_form' ), 9 );
		}

		// Extend the coupon input.
		add_action( 'wc_ajax_apply_coupon',  array( __CLASS__, 'maybe_apply_gift_card' ), 9 );
	}

	/**
	 * GC Version check notice.
	 */
	public static function gc_version_check_notice() {
	    echo '<div class="error"><p>' . sprintf( __( '<strong>Gift Cards &ndash; Coupon Input</strong> requires <a href="%1$s" target="_blank">WooCommerce Gift Cards</a> version <strong>%2$s</strong> or higher.', 'woocommerce-gift-cards-coupon-input' ), self::$gc_url, self::$req_gc_version ) . '</p></div>';
	}

	/**
	 * Load textdomain.
	 *
	 * @return void
	 */
	public static function localize_plugin() {
		load_plugin_textdomain( 'woocommerce-gift-cards-coupon-input', false, dirname( plugin_basename( __FILE__ ) ) . '/languages/' );
	}

	/**
	 * Declare cart/checkout Blocks incompatibility.
	 *
	 * @since 1.0.3
	 */
	public static function declare_blocks_compatibility() {

		if ( ! class_exists( 'Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			return;
		}

		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', plugin_basename( __FILE__ ), false );
	}

	/**
	 * Declare HPOS incompatibility.
	 *
	 * @since 2.0.0
	 */
	public static function declare_hpos_compatibility() {

		if ( ! class_exists( 'Automattic\WooCommerce\Utilities\FeaturesUtil' ) ) {
			return;
		}

		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', plugin_basename( __FILE__ ), true );
	}

	/**
	 * Extend the coupon input AJAX endpoint.
	 *
	 * @return void
	 */
	public static function maybe_apply_gift_card() {

		check_ajax_referer( 'apply-coupon', 'security' );

		if ( ! empty( $_POST[ 'coupon_code' ] ) ) {

			// Try to guess if input includes a gift card.
			$coupon_code = wp_unslash( $_POST[ 'coupon_code' ] );
			$match       = preg_match( apply_filters( 'woocommerce_gc_coupon_input_pattern', '/(?>[a-zA-Z0-9]{4}\-){3}[a-zA-Z0-9]{4}/', $coupon_code ), $coupon_code, $matches );

			if ( $match && ! empty( $matches ) ) {

				$giftcard_code = array_pop( $matches );
				$results       = WC_GC()->db->giftcards->query( array( 'return' => 'objects', 'code' => $giftcard_code, 'limit' => 1 ) );
				$giftcard_data = count( $results ) ? array_shift( $results ) : false;

				if ( $giftcard_data ) {

					$giftcard = new WC_GC_Gift_Card( $giftcard_data );

					try {

						// If logged in check if auto-redeem is on.
						if ( get_current_user_id() && apply_filters( 'woocommerce_gc_auto_redeem', false ) ) {
							$giftcard->redeem( get_current_user_id() );
						} else {
							WC_GC()->giftcards->apply_giftcard_to_session( $giftcard );
						}

						wc_add_notice( __( 'Gift Card code applied successfully!', 'woocommerce-gift-cards' ) );

					} catch ( Exception $e ) {
						wc_add_notice( $e->getMessage(), 'error' );
					}

				} else {
					wc_add_notice( __( 'Gift Card not found.', 'woocommerce-gift-cards' ), 'error' );
				}

				wc_print_notices();
				wp_die();
			}
		}
	}
}

WC_GC_Coupon_Input::init();
