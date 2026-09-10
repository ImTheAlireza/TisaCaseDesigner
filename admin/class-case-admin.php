<?php
/**
 * پنل ادمین داخل وردپرس (بازسازی v2)
 *
 * منوی اصلی «قاب‌ساز» + زیرمنوها در ستون کناری wp-admin.
 * محتوای صفحه: فقط یک کانتینر .case-designer-admin با data-tab —
 * admin-panel.js پوسته‌ی کامل (سربرگ، تب‌ها، محتوا) را داخل آن می‌سازد
 * و داده‌ها را از REST API می‌خواند/می‌نویسد.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_Admin {

	const CAP = 'manage_woocommerce';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
	}

	public static function menu() {
		add_menu_page(
			__( 'طراحی قاب گوشی', 'case-designer' ),
			__( 'قاب‌ساز', 'case-designer' ),
			self::CAP,
			'case-designer',
			array( __CLASS__, 'page' ),
			'dashicons-smartphone',
			56
		);

		$tabs = array(
			'dash'     => array( __( 'داشبورد', 'case-designer' ), 'dashicons-chart-area' ),
			'mockups'  => array( __( 'موکاپ‌ها', 'case-designer' ), 'dashicons-smartphone' ),
			'stickers' => array( __( 'استیکرها', 'case-designer' ), 'dashicons-smiley' ),
			'designs'  => array( __( 'طرح‌های آماده', 'case-designer' ), 'dashicons-layout' ),
			'orders'   => array( __( 'سفارش‌ها', 'case-designer' ), 'dashicons-cart' ),
			'settings' => array( __( 'تنظیمات', 'case-designer' ), 'dashicons-admin-generic' ),
		);

		foreach ( $tabs as $slug => $tab ) {
			add_submenu_page(
				'case-designer',
				$tab[0],
				$tab[0],
				self::CAP,
				'case-designer&tab=' . $slug,
				array( __CLASS__, 'page' )
			);
		}
	}

	/**
	 * رندر صفحه‌ی ادمین — پوسته و تب‌ها را admin-panel.js می‌سازد.
	 */
	public static function page() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		Case_Designer_Assets::enqueue_admin();

		$tab  = isset( $_GET['tab'] ) ? sanitize_key( $_GET['tab'] ) : 'dash';
		$tabs = array( 'dash', 'mockups', 'stickers', 'designs', 'orders', 'settings' );
		if ( ! in_array( $tab, $tabs, true ) ) {
			$tab = 'dash';
		}
		?>
		<div class="wrap">
			<div class="cd-center-wrap">
				<div class="case-designer-admin" data-tab="<?php echo esc_attr( $tab ); ?>"></div>
			</div>
		</div>
		<?php
	}
}
