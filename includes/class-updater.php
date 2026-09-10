<?php
/**
 * به‌روزرسانی درجا از GitHub Release
 * ------------------------------------------------------------
 * مشکل: وردپرس هویت یک افزونه را با «مسیر پوشه‌اش» می‌شناسد
 * (case-designer/case-designer.php). تا حالا هر بار zip تازه‌ای آپلود می‌شد و
 * نام پوشه‌اش با نصبِ موجود فرق داشت، وردپرس افزونهٔ «دوم» می‌ساخت؛ بعد مجبور
 * می‌شدید یکی را پاک کنید و uninstall.php هم تنظیمات/موکاپ‌ها/فایل‌های چاپ را
 * می‌روبد. این کلاس آن چرخه را حذف می‌کند:
 *
 *   ۱) نسخهٔ آخرِ Release گیت‌هاب را می‌خواند (با کش ۱۲ ساعته)
 *   ۲) اگر تازه‌تر بود، در صفحهٔ افزونه‌ها همان «۱.۶.۵ در دسترس است ← اکنون بروزرسانی کنید» را نشان می‌دهد
 *   ۳) موقع نصب، پوشهٔ داخل zip را به نامِ پوشهٔ «خودی» بازنویسی می‌کند،
 *      پس فایل‌ها همین‌جا روی همان نصبِ فعلی می‌نشینند — افزونهٔ دوم ساخته نمی‌شود
 *
 * چون مسیر نصب از خود وردپرس (plugin_basename) خوانده می‌شود، نام پوشهٔ شما
 * هرچه باشد (case-designer، TisaCaseDesigner-1.6.3، …) فرقی نمی‌کند.
 *
 * نکات ایمنی:
 *   - Pre-release در گیت‌هاب «latest» حساب نمی‌شود؛ یعنی می‌توانید بیلد آزمایشی
 *     بگذارید و تا وقتی خواستید، روی سایت‌ها نرود.
 *   - دامنهٔ دانلود قفل است (api.github.com / codeload.github.com) و فقط کاربر
 *     با نقش update_plugins آن را می‌بیند.
 *   - برای بستن کامل: define('CASE_DESIGNER_DISABLE_UPDATER', true)
 *     یا فیلتر case_designer_disable_updater
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // دسترسی مستقیم ممنوع
}

class Case_Designer_Updater {

	const REPO       = 'ImTheAlireza/TisaCaseDesigner';
	const SLUG       = 'case-designer';
	const CACHE_KEY  = 'case_designer_release';
	const CACHE_TTL  = 12 * HOUR_IN_SECONDS;
	const FAIL_TTL   = 30 * MINUTE_IN_SECONDS;

	public static function init() {
		/* فقط در پیشخوان. صفحهٔ فرانت‌اند هرگز نباید درخواست شبکه‌ای بزند —
		 * واکشی گیت‌هاب همین‌جا روی site_transient_update_plugins می‌نشیند و آن
		 * ترنزینت در هر صفحه‌ای خوانده می‌شود. */
		if ( ! function_exists( 'is_admin' ) || ! is_admin() ) {
			return;
		}
		/* هسته در get_site_transient() مقدار را از این فیلتر رد می‌کند؛ پس هم موقع چکِ روزانه
		 * (cron) و هم وقتی صفحهٔ افزونه‌ها کش را می‌خواند، پاسخ ما اضافه می‌شود.
		 * (pre_set_site_transient_* فقط با (false, $expiration) صدا زده می‌شود و برای تزریق بی‌فایده است.) */
		add_filter( 'site_transient_update_plugins', array( __CLASS__, 'check' ) );
		add_filter( 'plugins_api', array( __CLASS__, 'api_info' ), 20, 3 );
		add_filter( 'upgrader_source_selection', array( __CLASS__, 'match_source_folder' ), 10, 4 );
		add_action( 'upgrader_process_complete', array( __CLASS__, 'after_update' ), 10, 2 );
		add_filter( 'plugin_row_actions', array( __CLASS__, 'row_action' ), 10, 2 );
		add_action( 'admin_init', array( __CLASS__, 'force_check' ) );
	}

	/* ---------- ابزارها ---------- */

	// همان شناسه‌ای که وردپرس استفاده می‌کند؛ پس با هر نام پوشه‌ای کار می‌کند
	public static function plugin_id() {
		return plugin_basename( CASE_DESIGNER_PATH . 'case-designer.php' );
	}

	private static function disabled() {
		if ( defined( 'CASE_DESIGNER_DISABLE_UPDATER' ) && CASE_DESIGNER_DISABLE_UPDATER ) {
			return true;
		}
		// نکته: نقش کاربر اینجا چک نمی‌شود — چکِ روزانه در cron بدون کاربر لاگین‌شده
		// اجرا می‌شود و اگر گره بخوریم، «به‌روزرسانی موجود است» هرگز نوشته نمی‌شود.
		// دسترسی «اکنون بروزرسانی کنید» خودش توسط هسته کنترل می‌شود.
		return (bool) apply_filters( 'case_designer_disable_updater', false );
	}

	/** آخرین ریلیز (+ لینک zip و یادداشت‌ها)؛ نتیجهٔ خطا هم کش می‌شود تا API رگباری زده نشود */
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
					'Accept'       => 'application/vnd.github+json',
					'User-Agent'   => 'case-designer-updater',
					'X-GitHub-Api-Version' => '2022-11-28',
				),
			)
		);
		if ( ! is_wp_error( $r ) && 200 === (int) wp_remote_retrieve_response_code( $r ) ) {
			$j = json_decode( wp_remote_retrieve_body( $r ), true );
			if ( is_array( $j ) && ! empty( $j['tag_name'] ) ) {
				$tag = ltrim( (string) $j['tag_name'], 'vV' );
				// zipball خود گیت‌هاب مطمئن‌ترین گزینه است (بدون لاگین، بدون ریدایرکت)
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

	/* ---------- هسته ---------- */

	/** به وردپرس بگو نسخهٔ تازه هست — همان «Update now» ردیف افزونه */
	public static function check( $transient ) {
		// فقط یک آبجکتِ آماده (که خودش checked را دارد) را کامل می‌کنیم؛ اگر هنوز
		// ساخته نشده، بگذاریم wp_update_plugins() خودش بسازد
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
		$obj->slug             = self::SLUG;
		$obj->plugin           = self::plugin_id();
		$obj->new_version      = $rel['version'];
		$obj->package          = $rel['package'];
		$obj->url              = $rel['url'];
		$obj->tested           = '6.7';
		$obj->requires_php     = '7.4';
		$obj->sections         = array( 'changelog' => $rel['notes'] );
		$transient->response[ self::plugin_id() ] = $obj;
		return $transient;
	}

	/** پنجرهٔ «نمایش جزییات» — بدون این، وردپرس برای افزونهٔ غیر از wp.org خطای صفحه می‌داد */
	public static function api_info( $result, $action, $args ) {
		if ( 'plugin_information' !== $action ) {
			return $result;
		}
		$slug   = isset( $args->slug ) ? (string) $args->slug : '';
		$folder = basename( dirname( self::plugin_id() ) ); // اگر از بایگانی گیت‌هاب نصب شده، اسلاگ همین است
		if ( self::SLUG !== $slug && self::plugin_id() !== $slug && $folder !== $slug ) {
			return $result; // کارِ افزونهٔ دیگر نیست
		}
		$rel = self::release();
		if ( empty( $rel['version'] ) ) {
			return $result;
		}
		$info              = new stdClass();
		$info->name        = $rel['name'];
		$info->slug        = self::SLUG;
		$info->version     = $rel['version'];
		$info->author      = '<a href="https://tisacase.com">TisaCase</a>';
		$info->requires    = '6.0';
		$info->requires_php = '7.4';
		$info->tested      = '6.7';
		$info->download_link = $rel['package'];
		$info->homepage    = 'https://tisacase.com';
		$info->sections    = array(
			'description' => wpautop( 'ادیتور طراحی قاب گوشی با کادرهای راهنمای چاپ/دوربین و خروجی چاپ کاملِ بدون برش.' ),
			'changelog'   => wpautop( str_replace( array( "\r\n", "\n" ), array( '<br>', '<br>' ), esc_html( $rel['notes'] ) ) ),
		);
		return $info;
	}

	/**
	 * پوشهٔ داخل zip گیت‌هاب اسمش با پوشهٔ نصب‌شده فرق دارد (TisaCaseDesigner-1.6.5).
	 * وردپرس موقع به‌روزرسانیِ افزونه مقصد را این‌طور می‌سازد:
	 *
	 *     if ( in_array( $destination, $protected_directories, true ) ) {
	 *         $destination = trailingslashit( $destination ) . trailingslashit( basename( $source ) );
	 *     }
	 *
	 * یعنی نامِ پوشهٔ داخل zip، نامِ پوشهٔ نصب را تعیین می‌کند؛ اگر با نصبِ فعلی
	 * فرق داشته باشد، وردپرس افزونهٔ «جدید»ی کنار قبلی می‌سازد و فایل‌های قدیمی را
	 * پاک می‌کند — همان چیزی که می‌خواهیم حذف شود. پس اینجا پوشهٔ extracted را به
	 * نامِ پوشهٔ خودی بازنام‌گذاری می‌کنیم تا دقیقاً روی همان نصبِ فعلی بریزد:
	 * بدون افزونهٔ دوم، بدون Delete، و uninstall.php هرگز اجرا نمی‌شود
	 * (تنظیمات/موکاپ‌ها/فایل‌های چاپ سالم می‌مانند).
	 *
	 * امضا (از هسته): apply_filters( 'upgrader_source_selection', $source,
	 * $remote_source, $this, $args['hook_extra'] ) — پس hook_extra آرگومان چهارم
	 * است؛ سومین آرگومان خودِ آبجکت upgrader است.
	 */
	public static function match_source_folder( $source, $remote_source, $upgrader, $hook_extra ) {
		if ( is_wp_error( $source ) || ! is_array( $hook_extra ) || empty( $hook_extra['plugin'] ) ) {
			return $source; // نصبِ تازه، یا به‌روزرسانیِ افزونهٔ دیگر
		}
		if ( $hook_extra['plugin'] !== self::plugin_id() ) {
			return $source;
		}
		$want = basename( dirname( self::plugin_id() ) );
		if ( '' === $want || '.' === $want || ! is_string( $source ) ) {
			return $source; // افزونه بیرون از پوشه نصب شده (سناریوی نادر)؛ کاری نداریم
		}
		if ( trailingslashit( $remote_source ) === trailingslashit( $source ) ) {
			return $source; // zip پوشهٔ تکیِ بالاسری ندارد که برداشته شود
		}
		if ( 0 === strcasecmp( basename( $source ), $want ) ) {
			return $source; // از قبل جور است
		}

		global $wp_filesystem;
		if ( ! $wp_filesystem ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
		}
		if ( ! $wp_filesystem ) {
			return $source; // FS در دسترس نیست؛ خودِ وردپرس بعداً خطای واضح می‌دهد
		}

		$new = trailingslashit( dirname( $source ) ) . $want;
		if ( $wp_filesystem->exists( $new ) ) {
			$wp_filesystem->delete( $new, true ); // باقی‌ماندهٔ تلاش نیمه‌کارهٔ قبلی
		}
		if ( $wp_filesystem->move( $source, $new, true ) && $wp_filesystem->exists( trailingslashit( $new ) . 'case-designer.php' ) ) {
			return $new;
		}
		// نشد: نصبِ نصفه‌نیمه نمی‌سازیم — با WP_Error متوقف می‌شود و فایل‌های فعلی دست‌نخورده می‌مانند
		return new WP_Error(
			'case_designer_updater_folder',
			'پوشهٔ موقت نتوانست به «' . $want . '» بازنام‌گذاری شود، پس به‌روزرسانی متوقف شد و افزونهٔ فعلی دست‌نخورده است. دسترسی نوشتن روی wp-content/plugins را بررسی کنید.'
		);
	}

	/**
	 * بعد از نصب/به‌روزرسانی، کش را می‌ریزیم تا بررسی بعدی نسخهٔ واقعی را ببیند.
	 * امضای هسته: do_action( 'upgrader_process_complete', $upgrader, $hook_extra ) —
	 * برای update کلید 'plugin' را می‌دهد، برای bulk کلید 'plugins'، و برای install
	 * هیچ مسیری نمی‌دهد (در آن حالت هم کش را می‌ریزیم: بی‌هزینه‌تر از این است که
	 * بعد از نصب، نسخهٔ کش‌شده نشان بدهد «به‌روزرسانی موجود است»).
	 */
	public static function after_update( $upgrader, $hook_extra ) {
		if ( ! is_array( $hook_extra ) ) {
			return;
		}
		if ( isset( $hook_extra['type'] ) && 'plugin' !== $hook_extra['type'] ) {
			return; // آپدیت قالب/هسته/زبان ربطی به ما ندارد
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
			return; // هیچ‌کدام مال ما نبود
		}
		delete_transient( self::CACHE_KEY );
		delete_site_transient( 'update_plugins' );
	}

	/** لینک «بررسی مجدد نسخه» ردیف افزونه — برای وقتی که نمی‌خواهید تا چکِ روزانه صبر کنید */
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

Case_Designer_Updater::init();
