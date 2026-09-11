<?php
/**
 * Plugin Name: قاب‌ساز تیساکیس — طراحی قاب گوشی
 * Plugin URI:  https://tisacase.com
 * Description: ادیتور طراحی قاب گوشی با دو کادر راهنما (چاپ/دوربین)، پیش‌نمایش با برش نمایشی دوربین و فایل چاپ کاملِ بدون برش برای چاپخانه + یکپارچگی کامل با ووکامرس.
 * Version:     1.6.9
 * Author:      TisaCase
 * Text Domain: case-designer
 * Domain Path: /languages
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * WC requires at least: 7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // دسترسی مستقیم ممنوع
}

// نسخهٔ استایل/اسکریپت (cache-buster) — همیشه با «Version:» هدر بالا هم‌سطح بماند،
// وگرنه مرورگرها CSS/JS قدیمی را از کش سرویس می‌کنند و فیکس‌ها دیده نمی‌شوند.
define( 'CASE_DESIGNER_VERSION', '1.6.9' );
define( 'CASE_DESIGNER_PATH', plugin_dir_path( __FILE__ ) );
define( 'CASE_DESIGNER_URL', plugin_dir_url( __FILE__ ) );

require_once CASE_DESIGNER_PATH . 'includes/class-cpt.php';
require_once CASE_DESIGNER_PATH . 'includes/class-rest.php';
require_once CASE_DESIGNER_PATH . 'includes/class-woo.php';
require_once CASE_DESIGNER_PATH . 'includes/class-updater.php';
require_once CASE_DESIGNER_PATH . 'admin/class-case-admin.php';

/**
 * راه‌اندازی اجزای پلاگین
 */
Case_Designer_CPT::init();
Case_Designer_REST::init();
Case_Designer_Woo::init();
Case_Designer_Admin::init();
Case_Designer_Updater::init();

/**
 * شورت‌کد صفحه‌ی ادیتور در فرانت‌اند: [case_designer]
 * رندر کامل صفحه‌ی انتخاب مدل + ادیتور (همان UI دمو).
 */
add_shortcode( 'case_designer', function ( $atts ) {
	$atts = shortcode_atts( array( 'product_id' => 0 ), $atts, 'case_designer' );
	Case_Designer_Assets::enqueue_public();
	ob_start();
	include CASE_DESIGNER_PATH . 'public/views/editor-page.php';
	return ob_get_clean();
} );

/**
 * بارگذار دارایی‌ها (CSS/JS) — پوشه‌های دمو داخل پلاگین کپی می‌شوند:
 *   public/css/style.css       (دیزاین سیستم + گلاسمورفیسم)
 *   public/css/fa/all.min.css  (Font Awesome لاین‌آرت)
 *   public/js/fabric.min.js, data.js, editor.js, app.js, admin.js
 */
class Case_Designer_Assets {
	public static function enqueue_public() {
		wp_enqueue_style( 'case-designer-fa', CASE_DESIGNER_URL . 'public/css/fa/all.min.css', array(), CASE_DESIGNER_VERSION );
		wp_enqueue_style( 'case-designer-style', CASE_DESIGNER_URL . 'public/css/style.css', array( 'case-designer-fa' ), CASE_DESIGNER_VERSION );
		wp_enqueue_script( 'fabric', CASE_DESIGNER_URL . 'public/js/lib/fabric.min.js', array(), '5.3.0', true );
		wp_enqueue_script( 'case-designer-data', CASE_DESIGNER_URL . 'public/js/data.js', array( 'fabric' ), CASE_DESIGNER_VERSION, true );
		wp_enqueue_script( 'case-designer-editor', CASE_DESIGNER_URL . 'public/js/editor.js', array( 'case-designer-data' ), CASE_DESIGNER_VERSION, true );
		wp_enqueue_script( 'case-designer-app', CASE_DESIGNER_URL . 'public/js/app.js', array( 'case-designer-editor' ), CASE_DESIGNER_VERSION, true );
		// در نسخه‌ی واقعی، data.js داده‌ها را از همین آبجکت می‌خواند (به‌جای localStorage)
		/*
		 * داده‌ها (مدل‌ها + موکاپ‌ها + استیکرها + طرح‌ها) مستقیم سمت سرور رندر می‌شوند،
		 * پس صفحه‌ی مشتری حتی اگر REST قابل دسترس نباشد هم لیست موکاپ‌ها را نشان می‌دهد.
		 * (نوشتن — مثل افزودن به سبد — همچنان از REST می‌رود.)
		 */
		$models = class_exists( 'Case_Designer_CPT' ) ? Case_Designer_CPT::all_models() : array();

		wp_localize_script( 'case-designer-data', 'CaseDesignerData', array(
			'restUrl'   => esc_url_raw( rest_url( 'case-designer/v1' ) ),
			'nonce'     => wp_create_nonce( 'wp_rest' ),
			'settings'  => get_option( 'case_designer_settings', array() ),
			'storeName' => get_bloginfo( 'name' ),
			'currency'  => function_exists( 'get_woocommerce_currency_symbol' ) ? get_woocommerce_currency_symbol() : 'تومان',
			'cartUrl'   => function_exists( 'wc_get_cart_url' ) ? wc_get_cart_url() : '',
			'cartCount' => ( function_exists( 'WC' ) && WC()->cart ) ? WC()->cart->get_cart_contents_count() : 0,
			'models'    => $models,
			'stickers'  => class_exists( 'Case_Designer_CPT' ) ? Case_Designer_CPT::list_items( 'case_sticker' ) : array(),
			'designs'   => class_exists( 'Case_Designer_CPT' ) ? Case_Designer_CPT::list_items( 'case_design' ) : array(),
		) );
	}
	public static function enqueue_admin() {
		wp_enqueue_style( 'case-designer-fa', CASE_DESIGNER_URL . 'public/css/fa/all.min.css', array(), CASE_DESIGNER_VERSION );
		wp_enqueue_style( 'case-designer-admin', CASE_DESIGNER_URL . 'admin/admin-style.css', array( 'case-designer-fa' ), CASE_DESIGNER_VERSION );
		wp_enqueue_script( 'case-designer-admin', CASE_DESIGNER_URL . 'admin/admin-panel.js', array(), CASE_DESIGNER_VERSION, true );
		wp_localize_script( 'case-designer-admin', 'CaseDesignerAdmin', array(
			'restUrl' => esc_url_raw( rest_url( 'case-designer/v1' ) ),
			'nonce'   => wp_create_nonce( 'wp_rest' ),
		) );
	}
}
