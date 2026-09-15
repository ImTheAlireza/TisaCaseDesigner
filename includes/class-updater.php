<?php
/**
 * به‌روزرسانی درجا — v1.6.7 (GitHub) + v1.6.20 (zip محلی داخل پنل)
 * ------------------------------------------------------------
 * مشکل: وردپرس هویت یک افزونه را با «مسیر پوشه‌اش» می‌شناسد.
 * اگر پوشهٔ داخل zip با نصب موجود فرق داشته باشد، وردپرس افزونهٔ «دوم» می‌سازد.
 *
 * این کلاس:
 *  ۱) نسخهٔ آخر Release گیت‌هاب را می‌خواند (کش ۱۲ ساعته)
 *  ۲) دکمهٔ «به‌روزرسانی» در پیشخوان را نشان می‌دهد
 *  ۳) موقع به‌روزرسانی یا نصب دستی، پوشهٔ داخل zip را به نام پوشهٔ فعلی
 *     یا به نام بدون ورژن TisaCaseDesigner بازنویسی می‌کند تا افزونهٔ دوم ساخته نشود.
 *  ۴) v1.6.20 — آپدیت «خودافزونه» از zip محلی: دکمه در تب تنظیمات پنل؛
 *     کاربر فایل zip را انتخاب می‌کند و افزونه خودش را جایگزین می‌کند
 *     (با نسخه‌محور امن، پشتیبان خودکار در wp-content و بازگشت خودکار به
 *     نسخهٔ قبلی در هر خطا — قابل بازیابی دستی از پنل).
 *
 * درخواست کاربر: پوشهٔ نهایی فقط «اسم» باشد، بدون ورژن.
 *  - zipای که ما می‌سازیم ریشه‌اش TisaCaseDesigner/ است (بدون ورژن)
 *  - اگر کاربر بایگانی خودکار گیت‌هاب (TisaCaseDesigner-1.6.7.zip) را آپلود کند،
 *    این فیلتر آن را هم به پوشهٔ موجود یا به TisaCaseDesigner بازنویسی می‌کند.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_Updater {

	const REPO      = 'ImTheAlireza/TisaCaseDesigner';
	const SLUG      = 'case-designer';
	const CANONICAL = 'TisaCaseDesigner'; // پوشهٔ بدون ورژن
	const CACHE_KEY = 'case_designer_release';
	const CACHE_TTL = 12 * HOUR_IN_SECONDS;
	const FAIL_TTL  = 30 * MINUTE_IN_SECONDS;

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

		// v1.6.20 — آپدیت خودافزونه از zip محلی (دکمهٔ داخل تب تنظیمات پنل)
		add_action( 'admin_post_case_designer_update_from_zip', array( __CLASS__, 'handle_zip_update' ) );
		add_action( 'admin_post_case_designer_restore_backup', array( __CLASS__, 'handle_restore_backup' ) );
		add_action( 'admin_init', array( __CLASS__, 'cleanup_stale' ) );
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
	 * - upgrade: پوشهٔ موجود حفظ می‌شود، اگر ورژن‌دار بود به TisaCaseDesigner مهاجرت می‌کند
	 * - install دستی: اگر افزونه قبلاً نصب است، همان پوشه؛ وگرنه TisaCaseDesigner
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

		$has_our_file = $wp_filesystem->exists( trailingslashit( $source ) . 'case-designer.php' );
		if ( ! $has_our_file ) {
			return $source;
		}

		$want = '';

		if ( ! empty( $hook_extra['plugin'] ) ) {
			// upgrade
			if ( $hook_extra['plugin'] !== self::plugin_id() ) {
				return $source;
			}
			$want = basename( dirname( self::plugin_id() ) );
			// اگر پوشهٔ فعلی ورژن‌دار است، به بدون ورژن مهاجرت کن
			if ( preg_match( '/^' . preg_quote( self::CANONICAL, '/' ) . '-\d+\.\d+/', $want ) || preg_match( '/-\d+\.\d+(\.\d+)?$/', $want ) ) {
				$want = self::CANONICAL;
			}
		} else {
			// install دستی
			$existing_id = self::plugin_id();
			if ( $existing_id && $wp_filesystem->exists( WP_PLUGIN_DIR . '/' . $existing_id ) ) {
				$want = basename( dirname( $existing_id ) );
				if ( preg_match( '/-\d+\.\d+/', $want ) ) {
					$want = self::CANONICAL;
				}
			} else {
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
		if ( $paths && ! in_array( self::plugin_id(), $paths, true ) ) {
			if ( ! file_exists( WP_PLUGIN_DIR . '/' . self::CANONICAL . '/case-designer.php' ) ) {
				return;
			}
		}
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );

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
					if ( 'd' !== $info['type'] ) {
						continue;
					}
					if ( $name === self::CANONICAL ) {
						continue;
					}
					if ( $name === basename( dirname( self::plugin_id() ) ) ) {
						continue;
					}
					if ( preg_match( '/^(TisaCaseDesigner|case-designer)-\d+\.\d+/', $name ) ) {
						$maybe = trailingslashit( $plugins_dir ) . $name . '/case-designer.php';
						if ( $wp_filesystem->exists( $maybe ) ) {
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

	/* ============================================================
	 * آپدیت «خودافزونه» از بایگانی zip محلی — v1.6.20
	 * ------------------------------------------------------------
	 * دکمه‌ای در تب «تنظیمات» پنل: کاربر فایل zip را انتخاب می‌کند و
	 * افزونه خودش را با محتوای همان فایل جایگزین می‌کند.
	 *
	 * مراحل (با برگشت امن):
	 *  ۱) اعتبارسنجی فایل (پسوند، حجم، magic number بایگانی zip)
	 *  ۲) استخراج در ناحیهٔ موقت (download_and_extract_zip — ZipArchive یا unzip)
	 *  ۳) پیدا کردن ریشهٔ افزونه (case-designer.php در ریشه یا یک پوشهٔ تکی)
	 *  ۴) مقایسهٔ نسخه — دانگرید بدون فیلتر case_designer_allow_downgrade رد می‌شود
	 *  ۵) پشتیبان خودکار از نسخهٔ فعلی در wp-content/case-designer-backups/
	 *  ۶) جایگزینی پوشه + راستی‌آزمایی — هر خطا → بازگشت خودکار از پشتیبان
	 *
	 * مسیرها:
	 *  POST admin-post.php?action=case_designer_update_from_zip  (file: cd_update_zip)
	 *  POST admin-post.php?action=case_designer_restore_backup   (backup: نام پشتیبان)
	 *  GET  /wp-json/case-designer/v1/update/info                (نسخه + فهرست پشتیبان‌ها)
	 * ============================================================ */

	const BACKUP_SUBDIR = 'case-designer-backups';
	const BACKUP_KEEP   = 3;                 // چند پشتیبان نگه داشته شود
	const MAX_ZIP_SIZE  = 80 * 1024 * 1024;  // 80MB

	/**
	 * خروجی REST: وضعیت فعلی + پشتیبان‌های موجود (برای تب تنظیمات پنل)
	 */
	public static function update_info() {
		return array(
			'version' => CASE_DESIGNER_VERSION,
			'folder'  => basename( dirname( CASE_DESIGNER_PATH ) ),
			'backups' => self::list_backups(),
		);
	}

	/* ---------------- دریافت درخواست‌ها ---------------- */

	public static function handle_zip_update() {
		self::gate( 'case_designer_zip_update' );
		$result = self::run_update_from_zip( isset( $_FILES['cd_update_zip'] ) ? $_FILES['cd_update_zip'] : null );
		self::redirect_result( $result );
	}

	public static function handle_restore_backup() {
		self::gate( 'case_designer_restore_backup' );
		$name = isset( $_POST['backup'] ) ? sanitize_text_field( wp_unslash( $_POST['backup'] ) ) : '';
		$result = self::run_restore( $name );
		self::redirect_result( $result );
	}

	private static function gate( $action ) {
		if ( ! current_user_can( 'update_plugins' ) || ! check_admin_referer( $action, 'cd_nonce' ) ) {
			wp_die( esc_html__( 'شما دسترسی لازم برای این عملیات را ندارید یا نشست منقضی شده — صفحه را یک‌بار ریفرش کنید و دوباره امتحان کنید.', 'case-designer' ) );
		}
	}

	private static function redirect_result( $result ) {
		$base = admin_url( 'admin.php?page=case-designer&tab=settings' );
		if ( is_wp_error( $result ) ) {
			$payload = 'err:' . $result->get_error_code() . '|' . $result->get_error_message();
			wp_safe_redirect( add_query_arg( array( 'cd_upd' => $payload ), $base ) );
		} else {
			$payload = 'ok:' . ( isset( $result['version'] ) ? $result['version'] : '' );
			wp_safe_redirect( add_query_arg( array( 'cd_upd' => $payload ), $base ) );
		}
		exit;
	}

	/* ---------------- هستهٔ آپدیت ---------------- */

	public static function run_update_from_zip( $file ) {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem ) {
			return new WP_Error( 'fs_failed', 'نظام فایل وردپرس در دسترس نیست — دسترسی نوشتن روی wp-content/plugins را بررسی کنید.' );
		}
		if ( ! is_array( $file ) || empty( $file['tmp_name'] ) || ! is_uploaded_file( $file['tmp_name'] ) ) {
			return new WP_Error( 'no_file', 'هیچ فایل زیپی دریافت نشد — دوباره امتحان کنید.' );
		}
		$err_code = (int) ( isset( $file['error'] ) ? $file['error'] : UPLOAD_ERR_NO_FILE );
		if ( UPLOAD_ERR_OK !== $err_code ) {
			$msgs = array(
				UPLOAD_ERR_INI_SIZE  => 'حجم فایل از سقف سرور (upload_max_filesize / post_max_size) بیشتر است.',
				UPLOAD_ERR_FORM_SIZE => 'حجم فایل از سقف فرم بیشتر است.',
				UPLOAD_ERR_PARTIAL   => 'آپلود ناقص بود — دوباره امتحان کنید.',
				UPLOAD_ERR_NO_FILE   => 'هیچ فایلی انتخاب نشده بود.',
			);
			return new WP_Error( 'upload_error', isset( $msgs[ $err_code ] ) ? $msgs[ $err_code ] : 'خطا در آپلود فایل.' );
		}
		if ( (int) ( $file['size'] ?? 0 ) > self::MAX_ZIP_SIZE ) {
			return new WP_Error( 'too_big', 'حجم فایل از ۸۰ مگابایت بیشتر است.' );
		}
		$check = wp_check_filetype( (string) ( $file['name'] ?? '' ) );
		if ( 'zip' !== $check['ext'] ) {
			return new WP_Error( 'bad_ext', 'فایل باید بایگانی zip باشد (پسوند .zip).' );
		}
		$magic = file_get_contents( $file['tmp_name'], false, null, 0, 4 );
		if ( "\x50\x4b\x03\x04" !== $magic ) {
			return new WP_Error( 'bad_zip', 'این فایل یک بایگانی zip معتبر نیست.' );
		}

		require_once ABSPATH . 'wp-admin/includes/file.php'; // download_and_extract_zip

		// ۱) ناحیهٔ موقت داخل uploads (نه /tmp — تا با clean cron سرور قاطی نشود)
		$upload  = wp_upload_dir();
		$staging = trailingslashit( $upload['basedir'] ) . 'case-designer-updates/' . uniqid( 'cdupd_', true );
		$stage_parent = dirname( $staging );
		if ( ! $wp_filesystem->is_dir( $stage_parent ) && ! $wp_filesystem->mkdir( $stage_parent, 0777, true ) ) {
			return new WP_Error( 'staging_dir', 'پوشهٔ موقت ساخته نشد — دسترسی نوشتن روی پوشهٔ آپلودها را بررسی کنید.' );
		}

		// ۲) استخراج
		$extracted = download_and_extract_zip( $file['tmp_name'], $staging );
		if ( is_wp_error( $extracted ) ) {
			return new WP_Error( 'extract_failed', 'بازکردن بایگانی ناموفق بود (ZipArchive یا unzip روی سرور لازم است). ' . $extracted->get_error_message() );
		}

		// ۳) ریشهٔ افزونه — ریشهٔ مستقیم zip یا یک پوشهٔ تکی داخلش
		$root = self::find_plugin_root( $staging );
		if ( ! $root ) {
			self::cleanup_dir( $staging );
			return new WP_Error( 'no_plugin', 'فایل case-designer.php در بایگانی پیدا نشد — ریشهٔ zip باید خودِ افزونه یا یک پوشهٔ تکی مثل TisaCaseDesigner باشد.' );
		}

		// ۴) مقایسهٔ نسخه
		$new_version = self::read_version( trailingslashit( $root ) . 'case-designer.php' );
		if ( $new_version && version_compare( $new_version, (string) CASE_DESIGNER_VERSION, '<' )
			&& ! apply_filters( 'case_designer_allow_downgrade', false ) ) {
			self::cleanup_dir( $staging );
			return new WP_Error(
				'downgrade',
				sprintf( 'نسخهٔ داخل فایل (%s) از نسخهٔ فعلی (%s) قدیمی‌تر است — برای جلوگیری از اشتباه نصب انجام نشد.', $new_version, CASE_DESIGNER_VERSION )
			);
		}

		// ۵) پشتیبان خودکار قبل از هر تغییری
		$backup = self::create_backup();
		if ( is_wp_error( $backup ) ) {
			self::cleanup_dir( $staging );
			return $backup;
		}

		// ۶) جایگزینی پوشه
		$cur    = dirname( CASE_DESIGNER_PATH );
		$target = self::target_plugin_dir();
		$ok     = true;
		$err    = '';
		try {
			if ( $ok && $target !== $cur && $wp_filesystem->exists( $target ) ) {
				if ( ! $wp_filesystem->delete( $target, true ) ) {
					$ok  = false;
					$err = 'پوشهٔ «' . basename( $target ) . '» موجود پاک نشد';
				}
			}
			if ( $ok && ! $wp_filesystem->delete( $cur, true ) ) {
				$ok  = false;
				$err = 'پوشهٔ فعلی افزونه پاک نشد';
			}
			if ( $ok && ! $wp_filesystem->move( $root, $target, true ) ) {
				$ok  = false;
				$err = 'انتقال فایل‌های جدید ناموفق بود';
			}
			if ( $ok && ! $wp_filesystem->exists( trailingslashit( $target ) . 'case-designer.php' ) ) {
				$ok  = false;
				$err = 'فایل اصلی افزونه بعد از نصب پیدا نشد';
			}
		} catch ( Exception $e ) {
			$ok  = false;
			$err = $e->getMessage();
		}

		// ۷) هر خطا → بازگشت خودکار از پشتیبان (افزونهٔ فعلی هرگز نابود نمی‌شود)
		if ( ! $ok ) {
			self::restore_from_backup( $backup );
			self::cleanup_dir( $staging );
			return new WP_Error( 'update_failed', 'به‌روزرسانی با خطا مواجه شد (' . $err . ') و نسخهٔ قبلی به‌صورت خودکار بازگردانده شد.' );
		}

		self::cleanup_dir( $staging );
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );
		return array( 'version' => $new_version ? $new_version : 'نامشخص' );
	}

	/* ---------------- بازیابی از پشتیبان ---------------- */

	public static function run_restore( $name ) {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem ) {
			return new WP_Error( 'fs_failed', 'نظام فایل وردپرس در دسترس نیست.' );
		}
		if ( '' === $name ) {
			$list = self::list_backups();
			if ( ! $list ) {
				return new WP_Error( 'no_backup', 'پشتیبانی برای بازیابی پیدا نشد.' );
			}
			$name = $list[0]['name'];
		} elseif ( 1 !== preg_match( '#^cd-backup-\d{8}-\d{6}-[0-9A-Za-z.\-]+$#', $name ) ) {
			return new WP_Error( 'bad_name', 'نام پشتیبان نامعتبر است.' );
		}
		$root      = self::backups_root();
		$real      = realpath( trailingslashit( $root ) . $name );
		$real_root = realpath( $root );
		if ( ! $real || ! $real_root || 0 !== strpos( $real, $real_root . '/' ) || ! file_exists( $real . '/case-designer.php' ) ) {
			return new WP_Error( 'no_backup', 'این پشتیبان پیدا نشد یا ناقص است.' );
		}

		// اول نسخهٔ فعلی هم پشتیبان گرفته شود تا کاربر هیچ چیزی از دست ندهد
		$cur_backup = self::create_backup();
		if ( is_wp_error( $cur_backup ) ) {
			return $cur_backup;
		}

		self::restore_from_backup( $real );
		$cur = dirname( CASE_DESIGNER_PATH );
		if ( ! file_exists( $cur . '/case-designer.php' ) ) {
			return new WP_Error( 'restore_failed', 'بازیابی کامل انجام نشد — فایل اصلی افزونه پیدا نشد؛ از لیست پشتیبان‌ها نسخهٔ دیگر را امتحان کنید.' );
		}
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );
		$ver = self::read_version( $cur . '/case-designer.php' );
		return array( 'version' => $ver ? $ver : 'نامشخص' );
	}

	protected static function restore_from_backup( $backup_dir ) {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem || ! is_dir( $backup_dir ) ) {
			return;
		}
		$cur = dirname( CASE_DESIGNER_PATH );
		if ( ! $wp_filesystem->delete( $cur, true ) ) {
			return;
		}
		// محتوای پوشهٔ پشتیبان مستقیم شامل فایل‌های افزونه است → کپی به همان مسیر
		$wp_filesystem->copy( $backup_dir, $cur, true, true );
	}

	/* ---------------- پشتیبان‌ها ---------------- */

	public static function backups_root() {
		return trailingslashit( WP_CONTENT_DIR ) . self::BACKUP_SUBDIR;
	}

	public static function list_backups() {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem ) {
			return array();
		}
		$root = self::backups_root();
		if ( ! $wp_filesystem->is_dir( $root ) ) {
			return array();
		}
		$out = array();
		$utc = new DateTimeZone( 'UTC' );
		foreach ( (array) $wp_filesystem->dirlist( $root ) as $name => $info ) {
			if ( ! is_array( $info ) || 'd' !== $info['type'] ) {
				continue;
			}
			if ( ! preg_match( '#^cd-backup-(\d{8})-(\d{6})-(.+)$#', $name, $m ) ) {
				continue;
			}
			$dt = DateTime::createFromFormat( 'Ymd-His', $m[1] . '-' . $m[2], $utc );
			$ts = $dt ? $dt->getTimestamp() : 0;
			$out[] = array(
				'name'    => $name,
				'version' => $m[3],
				'date'    => $ts ? gmdate( 'Y-m-d H:i', $ts ) . ' UTC' : '',
			);
		}
		usort( $out, function ( $a, $b ) {
			$ta = 0; $tb = 0;
			if ( preg_match( '#^cd-backup-(\d{8})-(\d{6})-#', $a['name'], $ma ) ) { $ta = (int) $ma[1] * 1000000 + (int) $ma[2]; }
			if ( preg_match( '#^cd-backup-(\d{8})-(\d{6})-#', $b['name'], $mb ) ) { $tb = (int) $mb[1] * 1000000 + (int) $mb[2]; }
			return $tb <=> $ta;
		} );
		return $out;
	}

	protected static function create_backup() {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem ) {
			return new WP_Error( 'fs_failed', 'نظام فایل وردپرس در دسترس نیست.' );
		}
		$root = self::backups_root();
		if ( ! $wp_filesystem->is_dir( $root ) && ! $wp_filesystem->mkdir( $root, 0777, true ) ) {
			return new WP_Error( 'backup_dir', 'پوشهٔ پشتیبان‌ها (wp-content/case-designer-backups) ساخته نشد — دسترسی نوشتن روی wp-content را بررسی کنید.' );
		}
		$name = 'cd-backup-' . gmdate( 'Ymd-His' ) . '-' . str_replace( '.', '-', CASE_DESIGNER_VERSION );
		$dest = trailingslashit( $root ) . $name;
		$i    = 0;
		while ( $wp_filesystem->exists( $dest ) && $i < 10 ) {
			$dest .= '-' . ( ++$i );
		}
		if ( ! $wp_filesystem->copy( CASE_DESIGNER_PATH, $dest, true, true ) ) {
			return new WP_Error( 'backup_failed', 'ساختن پشتیبان از نسخهٔ فعلی ناموفق بود — برای ایمنی، آپدیت انجام نشد.' );
		}
		self::prune_backups();
		return $dest;
	}

	protected static function prune_backups() {
		global $wp_filesystem;
		$list = self::list_backups();
		while ( count( $list ) > self::BACKUP_KEEP ) {
			$old = array_pop( $list );
			$wp_filesystem->delete( trailingslashit( self::backups_root() ) . $old['name'], true );
		}
	}

	/* ---------------- ابزارهای داخلی ---------------- */

	/**
	 * ریشهٔ افزونه را در ناحیهٔ استخراج‌شده پیدا می‌کند.
	 * ریشهٔ مستقیم zip یا دقیقاً یک پوشهٔ تکی که case-designer.php داشته باشد.
	 * (جلوگیری از zip-slip: مسیر نهایی باید زیر ناحیهٔ staging بماند.)
	 */
	protected static function find_plugin_root( $staging ) {
		$staging = realpath( $staging );
		if ( ! $staging ) {
			return null;
		}
		if ( file_exists( $staging . '/case-designer.php' ) ) {
			return $staging;
		}
		$candidates = array();
		foreach ( (array) scandir( $staging ) as $entry ) {
			if ( '.' === $entry || '..' === $entry ) {
				continue;
			}
			$sub = $staging . '/' . $entry;
			if ( is_dir( $sub ) && file_exists( $sub . '/case-designer.php' ) ) {
				$real = realpath( $sub );
				if ( $real && 0 === strpos( $real, $staging . '/' ) ) {
					$candidates[] = $real;
				}
			}
		}
		if ( 1 === count( $candidates ) ) {
			return $candidates[0];
		}
		return null;
	}

	/**
	 * هدف نهایی پوشهٔ افزونه — همان قرارداد match_source_folder:
	 * پوشهٔ ورژن‌دار (TisaCaseDesigner-1.6.x) به پوشهٔ بدون ورژن مهاجرت می‌کند
	 * تا «افزونهٔ دوم» در وردپرس ساخته نشود.
	 */
	protected static function target_plugin_dir() {
		$cur  = dirname( CASE_DESIGNER_PATH );
		$name = basename( $cur );
		if ( preg_match( '/^' . preg_quote( self::CANONICAL, '/' ) . '-\d+\.\d+/', $name ) || preg_match( '/-\d+\.\d+(\.\d+)?$/', $name ) ) {
			return WP_PLUGIN_DIR . '/' . self::CANONICAL;
		}
		return $cur;
	}

	/**
	 * خواندن «Version:» هدر افزونه از فایل اصلی
	 */
	protected static function read_version( $file ) {
		$head = ( $file && is_readable( $file ) ) ? (string) file_get_contents( $file, false, null, 0, 16384 ) : '';
		if ( $head && preg_match( '/^\s*\*\s*Version:\s*([0-9][0-9A-Za-z.\-]*)/mi', $head, $m ) ) {
			return trim( $m[1] );
		}
		return '';
	}

	protected static function fs() {
		global $wp_filesystem;
		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}
		return $wp_filesystem;
	}

	protected static function cleanup_dir( $dir ) {
		global $wp_filesystem;
		if ( $dir && $wp_filesystem && $wp_filesystem->exists( $dir ) ) {
			$wp_filesystem->delete( $dir, true );
		}
	}

	/**
	 * پاک‌سازی ناحیهٔ موقت: اگر آپدیت وسط راه فوتال کرده باشد،
	 * پوشه‌های staging قدیمی‌تر از ۱ روز حذف می‌شوند.
	 */
	public static function cleanup_stale() {
		global $wp_filesystem;
		self::fs();
		if ( ! $wp_filesystem ) {
			return;
		}
		$upload  = wp_upload_dir();
		$base    = trailingslashit( $upload['basedir'] ) . 'case-designer-updates/';
		if ( ! $wp_filesystem->is_dir( $base ) ) {
			return;
		}
		$now = time();
		foreach ( (array) $wp_filesystem->dirlist( $base ) as $name => $info ) {
			if ( ! is_array( $info ) || 'd' !== $info['type'] ) {
				continue;
			}
			$path = $base . $name;
			$mod  = @filemtime( $path );
			if ( $mod && $now - $mod > DAY_IN_SECONDS ) {
				$wp_filesystem->delete( $path, true );
			}
		}
	}
}

if ( function_exists( 'add_filter' ) ) {
	Case_Designer_Updater::init();
}
