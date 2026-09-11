<?php
/**
 * به‌روزرسانی درجا از GitHub Release — v1.6.7
 * ------------------------------------------------------------
 * مشکل: وردپرس هویت یک افزونه را با «مسیر پوشه‌اش» می‌شناسد.
 * اگر پوشهٔ داخل zip با نصب موجود فرق داشته باشد، وردپرس افزونهٔ «دوم» می‌سازد.
 * تا قبل از 1.6.5 هر بار zip تازه آپلود می‌شد و نام پوشه‌اش فرق داشت،
 * وردپرس نسخهٔ دوم می‌ساخت و Delete هم uninstall.php را اجرا و دیتا را پاک می‌کرد.
 *
 * این کلاس:
 *  ۱) نسخهٔ آخر Release گیت‌هاب را می‌خواند (کش ۱۲ ساعته)
 *  ۲) دکمهٔ «به‌روزرسانی» در پیشخوان را نشان می‌دهد
 *  ۳) موقع به‌روزرسانی یا نصب دستی، پوشهٔ داخل zip را به نام پوشهٔ فعلی (یا به نام بدون ورژن) بازنویسی می‌کند
 *     تا افزونهٔ دوم ساخته نشود.
 *
 * نکتهٔ مهم برای درخواست کاربر: پوشهٔ نهایی باید فقط «اسم» باشد، بدون ورژن.
 *  - zipای که ما می‌سازیم (case-designer-*.zip) ریشه‌اش TisaCaseDesigner/ است (بدون ورژن)
 *  - اگر کاربر بایگانی خودکار گیت‌هاب (TisaCaseDesigner-1.6.7.zip) را آپلود کند،
 *    این فیلتر آن را هم به پوشهٔ موجود یا به TisaCaseDesigner بازنویسی می‌کند
 *    تا پوشهٔ ورژن‌دار جدید ساخته نشود.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_Updater {

	const REPO       = 'ImTheAlireza/TisaCaseDesigner';
	const SLUG       = 'case-designer';
	const CANONICAL  = 'TisaCaseDesigner'; // پوشهٔ بدون ورژن که کاربر می‌خواهد
	const CACHE_KEY  = 'case_designer_release';
	const CACHE_TTL  = 12 * HOUR_IN_SECONDS;
	const FAIL_TTL   = 30 * MINUTE_IN_SECONDS;

	public static function init() {
		if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
			return;
		}
		add_filter( 'site_transient_update_plugins', array( __CLASS__, 'check' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'api_info' ), 20, 3 );
		add_filter( 'upgrader_source_selection', array( __CLASS__, 'match_source_folder' ), 10, 4 );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'after_update' ), 10, 2 );
		add_filter( 'plugin_row_actions', array( __CLASS__, 'row_action' ), 10, 2 );
		add_action( 'admin_init', array( __CLASS__, 'force_check' ) );
	}

	public static function plugin_id() {
		return plugin_basename( CASE_DESIGNER_PATH . 'case-designer.php' );
	}

	private static function disabled() {
		if ( defined( 'CASE_DESIGNER_DISABLE_UPDATER' ) && CASE_DESIGNER_DISABLE_UPDATER ) {
			return true;
		}
		return (bool) apply_filters( 'case_designer_disable_updater', false );
	}

	private static function release() {
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}
		$out = array();
		$url = apply_filters( 'case_designer_release_api', 'https://api.github.com/repos/' . self::REPO . '/releases/latest' );
		$r   = wp_remote_get(
			$url,
			array(
				'timeout'     => 6,
				'redirection' => 2,
				'headers'     => array(
					'Accept'               => 'application/vnd.github+json',
					'User-Agent'           => 'case-designer-updater',
					'X-GitHub-Api-Version' => '2022-11-28',
				),
			)
		);
		if ( ! is_wp_error( $r ) && 200 === (int) wp_remote_retrieve_response_code( $r ) ) {
			$j = json_decode( wp_remote_retrieve_body( $r ), true );
			if ( is_array( $j ) && ! empty( $j['tag_name'] ) ) {
				$tag = ltrim( (string) $j['tag_name'], 'vV' );
				$pkg = ! empty( $j['zipball_url'] )
					? $j['zipball_url']
					: sprintf( 'https://github.com/%s/archive/%s.zip', self::REPO, rawurlencode( (string) $j['tag_name'] ) );
				$pkg = (string) apply_filters( 'case_designer_update_package', $pkg, $tag );
				$out = array(
					'version' => $tag,
					'package' => $pkg,
					'url'     => isset( $j['html_url'] ) ? $j['html_url'] : '',
					'notes'   => isset( $j['body'] ) ? (string) $j['body'] : '',
					'name'    => ! empty( $j['name'] ) ? $j['name'] : 'قاب‌ساز تیساکیس',
				);
			}
		}
		set_transient( self::CACHE_KEY, $out, $out ? self::CACHE_TTL : self::FAIL_TTL );
		return $out;
	}

	public static function check( $transient ) {
		if ( ! is_object( $transient ) || ! isset( $transient->checked ) || ! is_array( $transient->checked ) ) {
			return $transient;
		}
		if ( self::disabled() ) {
			return $transient;
		}
		$rel = self::release();
		if ( empty( $rel['version'] ) ) {
			return $transient;
		}
		$installed = isset( $transient->checked[ self::plugin_id() ] )
			? $transient->checked[ self::plugin_id() ]
			: CASE_DESIGNER_VERSION;
		if ( version_compare( $rel['version'], (string) $installed, '<=' ) ) {
			return $transient;
		}
		$obj = new stdClass();
		$obj->slug         = self::SLUG;
		$obj->plugin       = self::plugin_id();
		$obj->new_version  = $rel['version'];
		$obj->package      = $rel['package'];
		$obj->url          = $rel['url'];
		$obj->tested       = '6.7';
		$obj->requires_php = '7.4';
		$obj->sections     = array( 'changelog' => $rel['notes'] );
		$transient->response[ self::plugin_id() ] = $obj;
		return $transient;
	}

	public static function api_info( $result, $action, $args ) {
		if ( 'plugin_information' !== $action ) {
			return $result;
		}
		$slug   = isset( $args->slug ) ? (string) $args->slug : '';
		$folder = basename( dirname( self::plugin_id() ) );
		if ( self::SLUG !== $slug && self::plugin_id() !== $slug && $folder !== $slug && self::CANONICAL !== $slug ) {
			return $result;
		}
		$rel = self::release();
		if ( empty( $rel['version'] ) ) {
			return $result;
		}
		$info                = new stdClass();
		$info->name          = $rel['name'];
		$info->slug          = self::SLUG;
		$info->version       = $rel['version'];
		$info->author        = '<a href="https://tisacase.com">TisaCase</a>';
		$info->requires      = '6.0';
		$info->requires_php  = '7.4';
		$info->tested        = '6.7';
		$info->download_link = $rel['package'];
		$info->homepage      = 'https://tisacase.com';
		$info->sections      = array(
			'description' => wpautop( 'ادیتور طراحی قاب گوشی با کادرهای راهنمای چاپ/دوربین/فریم اصلی و خروجی چاپ بر اساس فریم اصلی.' ),
			'changelog'   => wpautop( str_replace( array( "\r\n", "\n" ), array( '<br>', '<br>' ), esc_html( $rel['notes'] ) ) ),
		);
		return $info;
	}

	/**
	 * مهم‌ترین فیلتر: پوشهٔ داخل zip را به پوشهٔ درست بازنویسی می‌کند
	 * - برای upgrade: پوشهٔ موجود (هرچه باشد) حفظ می‌شود تا افزونهٔ دوم ساخته نشود
	 * - برای install دستی: اگر افزونه قبلاً نصب است، همان پوشهٔ قبلی؛ وگرنه TisaCaseDesigner (بدون ورژن)
	 * - اگر zip از بایگانی خودکار گیت‌هاب باشد (TisaCaseDesigner-1.6.7)، باز هم به بدون ورژن تبدیل می‌شود
	 */
	public static function match_source_folder( $source, $remote_source, $upgrader, $hook_extra ) {
		if ( is_wp_error( $source ) ) {
			return $source;
		}
		if ( ! is_array( $hook_extra ) ) {
			return $source;
		}
		if ( isset( $hook_extra['type'] ) && 'plugin' !== $hook_extra['type'] ) {
			return $source;
		}

		global $wp_filesystem;
		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}
		if ( ! $wp_filesystem ) {
			return $source;
		}

		// آیا این zip مال ماست؟ (case-designer.php داخلش هست)
		$has_our_file = $wp_filesystem->exists( trailingslashit( $source ) . 'case-designer.php' );
		if ( ! $has_our_file ) {
			return $source;
		}

		$want = '';

		// حالت به‌روزرسانی (upgrade) — hook_extra['plugin'] دارد
		if ( ! empty( $hook_extra['plugin'] ) ) {
			if ( $hook_extra['plugin'] !== self::plugin_id() ) {
				return $source; // افزونهٔ دیگر
			}
			$want = basename( dirname( self::plugin_id() ) );

			// اگر پوشهٔ فعلی ورژن‌دار است (مثل TisaCaseDesigner-1.6.6) و کاربر درخواست پوشهٔ بدون ورژن کرده،
			// به پوشهٔ بدون ورژن مهاجرت می‌کنیم تا از این به بعد ورژن در نام نباشد.
			// برای اینکه دیتا از دست نرود، اول به canonical تبدیل می‌کنیم.
			if ( preg_match( '/^'.preg_quote(self::CANONICAL, '/').'-\d+\.\d+/', $want ) || preg_match( '/-\\d+\\.\\d+\\.\\d+$/', $want ) ) {
				// اگر قبلاً پوشهٔ canonical وجود دارد، همان را می‌خواهیم تا رویش بریزد
				// وگرنه خود canonical
				$want = self::CANONICAL;
			}
		} else {
			// حالت نصب دستی (install) — plugin در hook_extra نیست
			// اگر افزونه قبلاً نصب است (فعال یا غیرفعال)، همان پوشه را حفظ کن تا تکراری نشود
			$existing_id = self::plugin_id();
			if ( $existing_id && $wp_filesystem->exists( WP_PLUGIN_DIR . '/' . $existing_id ) ) {
				$want = basename( dirname( $existing_id ) );
				// اگر پوشهٔ موجود ورژن‌دار است، به بدون ورژن مهاجرت کن
				if ( preg_match( '/-\\d+\\.\\d+/', $want ) ) {
					$want = self::CANONICAL;
				}
			} else {
				// نصب تازه — پوشهٔ بدون ورژن
				$want = self::CANONICAL;
			}
		}

		if ( '' === $want || '.' === $want || ! is_string( $source ) ) {
			return $source;
		}
		if ( trailingslashit( $remote_source ) === trailingslashit( $source ) ) {
			return $source;
		}
		if ( 0 === strcasecmp( basename( $source ), $want ) ) {
			return $source;
		}

		$new = trailingslashit( dirname( $source ) ) . $want;
		if ( $wp_filesystem->exists( $new ) ) {
			$wp_filesystem->delete( $new, true );
		}
		if ( $wp_filesystem->move( $source, $new, true ) && $wp_filesystem->exists( trailingslashit( $new ) . 'case-designer.php' ) ) {
			return $new;
		}
		return new WP_Error(
			'case_designer_updater_folder',
			'پوشهٔ موقت نتوانست به «' . $want . '» بازنام‌گذاری شود، پس به‌روزرسانی متوقف شد و افزونهٔ فعلی دست‌نخورده است. دسترسی نوشتن روی wp-content/plugins را بررسی کنید.'
		);
	}

	public static function after_update( $upgrader, $hook_extra ) {
		if ( ! is_array( $hook_extra ) ) {
			return;
		}
		if ( isset( $hook_extra['type'] ) && 'plugin' !== $hook_extra['type'] ) {
			return;
		}
		$paths = array();
		if ( isset( $hook_extra['plugin'] ) && is_string( $hook_extra['plugin'] ) ) {
			$paths[] = $hook_extra['plugin'];
		}
		if ( ! empty( $hook_extra['plugins'] ) && is_array( $hook_extra['plugins'] ) ) {
			foreach ( $hook_extra['plugins'] as $p ) {
				if ( is_string( $p ) ) {
					$paths[] = $p;
				}
			}
		}
		// برای install دستی، $paths خالی است — باز هم کش را پاک می‌کنیم
		if ( $paths && ! in_array( self::plugin_id(), $paths, true ) ) {
			// اما اگر هیچ‌کدام مال ما نبود و has_our_file هم نبود، کاری نداریم
			// برای اطمینان، اگر پوشهٔ canonical تازه ساخته شده، باز هم کش را پاک کن
			if ( ! file_exists( WP_PLUGIN_DIR . '/' . self::CANONICAL . '/case-designer.php' ) ) {
				return;
			}
		}
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );

		// پاکسازی پوشه‌های قدیمی ورژن‌دار بعد از مهاجرت به بدون ورژن
		global $wp_filesystem;
		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}
		if ( $wp_filesystem ) {
			$plugins_dir = WP_PLUGIN_DIR;
			$list = $wp_filesystem->dirlist( $plugins_dir );
			if ( is_array( $list ) ) {
				foreach ( $list as $name => $info ) {
					if ( 'd' !== $info['type'] ) continue;
					if ( $name === self::CANONICAL ) continue;
					if ( $name === basename( dirname( self::plugin_id() ) ) ) continue;
					// الگوی ورژن‌دار: TisaCaseDesigner-1.6.x یا case-designer-1.6.x
					if ( preg_match( '/^(TisaCaseDesigner|case-designer)-\\d+\\.\\d+/', $name ) ) {
						$maybe = trailingslashit( $plugins_dir ) . $name . '/case-designer.php';
						if ( $wp_filesystem->exists( $maybe ) ) {
							// فقط اگر پوشهٔ canonical الان موجود است، قدیمی‌ها را پاک کن
							if ( $wp_filesystem->exists( trailingslashit( $plugins_dir ) . self::CANONICAL . '/case-designer.php' ) ) {
								$wp_filesystem->delete( trailingslashit( $plugins_dir ) . $name, true );
							}
						}
					}
				}
			}
		}
	}

	public static function row_action( $actions, $plugin_file ) {
		if ( $plugin_file !== self::plugin_id() || self::disabled() || ! current_user_can( 'update_plugins' ) ) {
			return $actions;
		}
		$url = wp_nonce_url(
			self_admin_url( 'plugins.php?case_designer_updater_check=1' ),
			'case_designer_updater_check'
		);
		$actions['case_designer_check_update'] = '<a href="' . esc_url( $url ) . '">بررسی مجدد نسخهٔ تازه</a>';
		return $actions;
	}

	public static function force_check() {
		if ( ! isset( $_GET['case_designer_updater_check'] ) ) {
			return;
		}
		if ( ! current_user_can( 'update_plugins' ) || ! check_admin_referer( 'case_designer_updater_check' ) ) {
			return;
		}
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );
		wp_safe_redirect( remove_query_arg( 'case_designer_updater_check' ) );
		exit;
	}
}

// init در case-designer.php صدا زده می‌شود، اینجا هم برای سازگاری با نسخه‌های قدیمی
if ( function_exists( 'add_filter' ) ) {
	Case_Designer_Updater::init();
}
