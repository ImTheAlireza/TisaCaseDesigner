<?php
/**
 * یکپارچگی با ووکامرس
 *
 * جریان کامل:
 *  ۱) صفحه‌ی محصول: دکمه‌ی «طراحی قاب» → صفحه‌ی ادیتور (شورت‌کد [case_designer]) با product_id
 *  ۲) در ادیتور: «افزودن به سبد خرید» → درخواست REST به /add-to-cart با فایل چاپ و JSON طراحی
 *  ۳) متادیتای طراحی به آیتم سبد/سفارش می‌چسبد و در چک‌اوت و سفارش‌های ادمین نمایش داده می‌شود
 *  ۴) فایل چاپ (PNG کامل، بدون برش دوربین) در uploads/case-designer/ ذخیره می‌شود
 *     و چاپخانه همان فایل را دانلود می‌کند — برش دوربین را خودش اعمال می‌کند.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_Woo {

	/** متادیتای آیتم: JSON طراحی + آدرس فایل چاپ + تامبنیل */
	const META_DESIGN     = '_case_design';
	const META_PRINT_FILE = '_case_print_file';
	const META_THUMB      = '_case_thumb';

	public static function init() {
		// هوک‌ها را همیشه اضافه می‌کنیم — حتی اگر ووکامرس هنوز لود نشده باشد
		// چون case-designer.php مستقیم init را صدا می‌زند و ممکن است ووکامرس بعداً لود شود
		// داخل هر کال‌بک دوباره چک می‌کنیم

		// دکمه‌ی «طراحی قاب» روی صفحه‌ی محصول
		add_action( 'woocommerce_after_add_to_cart_button', array( __CLASS__, 'designer_button' ) );

		// متاباکس «قاب قابل طراحی» در صفحه‌ی محصول — با اولویت بالا
		add_action( 'add_meta_boxes', array( __CLASS__, 'add_product_metabox' ), 10, 2 );
		add_action( 'save_post_product', array( __CLASS__, 'save_product_metabox' ), 10, 2 );
		add_action( 'woocommerce_product_options_general_product_data', array( __CLASS__, 'woo_product_checkbox' ) );
		add_action( 'woocommerce_process_product_meta', array( __CLASS__, 'woo_product_checkbox_save' ) );

		// تب اختصاصی «قاب‌ساز» در اطلاعات محصول — واضح‌تر از چک‌باکس مخفی در تب عمومی
		add_filter( 'woocommerce_product_data_tabs', array( __CLASS__, 'product_data_tab' ), 98 );
		add_action( 'woocommerce_product_data_panels', array( __CLASS__, 'product_data_panel' ) );

		// نمایش جزئیات طراحی در سبد خرید و چک‌اوت
		add_filter( 'woocommerce_get_item_data', array( __CLASS__, 'cart_item_data' ), 10, 2 );

		// ذخیره‌ی متادیتا روی آیتم سفارش
		add_action( 'woocommerce_checkout_create_order_line_item', array( __CLASS__, 'save_order_item_meta' ), 10, 4 );

		// تامبنیل طرح در آیتم‌های سبد و سفارش ادمین
		add_filter( 'woocommerce_cart_item_thumbnail', array( __CLASS__, 'cart_thumbnail' ), 10, 3 );
		add_action( 'woocommerce_admin_order_item_headers', array( __CLASS__, 'order_admin_header' ) );
		add_action( 'woocommerce_admin_order_item_values', array( __CLASS__, 'order_admin_value' ), 10, 3 );

		// اندپوینت افزودن به سبد با متادیتای طراحی
		add_action( 'rest_api_init', array( __CLASS__, 'rest_add_to_cart' ) );
	}

	public static function product_data_tab( $tabs ) {
		$tabs['case_designer'] = array(
			'label'    => __( 'قاب‌ساز', 'case-designer' ),
			'target'   => 'case_designer_product_data',
			'class'    => array( 'show_if_simple', 'show_if_variable', 'show_if_external' ),
			'priority' => 90,
		);
		return $tabs;
	}

	public static function product_data_panel() {
		global $post;
		if ( ! $post ) {
			return;
		}
		$val = get_post_meta( $post->ID, '_case_designable', true );
		$editor_page_id = (int) get_option( 'case_designer_editor_page', 0 );
		$editor_url = $editor_page_id ? get_permalink( $editor_page_id ) : '';
		echo '<div id="case_designer_product_data" class="panel woocommerce_options_panel hidden">';
		echo '<div class="options_group">';
		echo '<p style="padding:10px 12px;background:#f0f7ff;border:1px solid #c3d9ff;border-radius:8px;margin:12px">'
			. '<strong>قاب‌ساز تیساکیس — تنظیمات محصول</strong><br>'
			. 'برای اینکه دکمه «طراحی قاب» در صفحه محصول نمایش داده شود، تیک زیر را بزنید. سپس در تب موکاپ‌ها، برای هر مدل شناسه همین محصول را وارد کنید.<br>'
			. ( $editor_page_id ? 'صفحه ادیتور: <a href="' . esc_url( $editor_url ) . '" target="_blank">#' . $editor_page_id . ' — ' . esc_url( $editor_url ) . '</a>' : '<span style="color:#b3261e">هنوز صفحه ادیتور در قاب‌ساز > تنظیمات انتخاب نشده!</span>' )
			. '</p>';
		// چک‌باکس را دستی می‌نویسیم تا وابسته به woocommerce_wp_checkbox نباشد (اگر ووکامرس لود نشده)
		echo '<p class="form-field"><label>' . esc_html__( 'قاب قابل طراحی', 'case-designer' ) . '</label>'
			. '<span class="wrap"><input type="checkbox" id="_case_designable" name="_case_designable" value="yes" ' . checked( $val, 'yes', false ) . ' /> '
			. '<span class="description">' . esc_html__( 'دکمه «طراحی قاب» در صفحه محصول نمایش داده شود و مشتری به صفحه ادیتور برود', 'case-designer' ) . '</span></span></p>';
		echo '</div>';
		echo '<div class="options_group">';
		echo '<p style="padding:0 12px;color:#555">بعد از فعال‌سازی:<br>۱) محصول را به‌روزرسانی کنید<br>۲) قاب‌ساز > موکاپ‌ها > برای هر مدل، شناسه محصول متصل را همین ID (' . $post->ID . ') بگذارید<br>۳) تنظیمات > پیوندهای یکتا را یک بار ذخیره کنید</p>';
		echo '</div>';
		echo '</div>';
	}

	public static function add_product_metabox() {
		// حتی اگر ووکامرس نباشد هم باکس را اضافه کن تا کاربر ببیند
		add_meta_box(
			'case_designable_box',
			__( 'قاب‌ساز تیساکیس', 'case-designer' ),
			array( __CLASS__, 'render_product_metabox' ),
			'product',
			'side',
			'high'
		);
	}

	public static function render_product_metabox( $post ) {
		$val = get_post_meta( $post->ID, '_case_designable', true );
		$editor_page_id = (int) get_option( 'case_designer_editor_page', 0 );
		wp_nonce_field( 'case_designable_nonce', 'case_designable_nonce_field' );
		echo '<label style="font-weight:bold;display:block;margin-bottom:8px"><input type="checkbox" name="_case_designable" value="yes" ' . checked( $val, 'yes', false ) . '> ' . esc_html__( 'قاب قابل طراحی — دکمه «طراحی قاب» نمایش داده شود', 'case-designer' ) . '</label>';
		echo '<p class="description">' . esc_html__( 'این تیک همان _case_designable است. بعد از فعال‌سازی، در صفحه محصول دکمه طراحی به صفحه ادیتور می‌رود.', 'case-designer' ) . '</p>';
		if ( ! $editor_page_id ) {
			echo '<p style="color:#b3261e;background:#fff3cd;padding:6px 8px;border-radius:6px">صفحه ادیتور هنوز در قاب‌ساز > تنظیمات انتخاب نشده!</p>';
		} else {
			echo '<p>صفحه ادیتور: <a href="' . esc_url( get_permalink( $editor_page_id ) ) . '" target="_blank">#' . $editor_page_id . '</a></p>';
		}
		echo '<p>ID این محصول: <code>' . $post->ID . '</code> — این ID را در موکاپ‌ها > شناسه محصول متصل وارد کنید</p>';
		if ( ! class_exists( 'WooCommerce' ) ) {
			echo '<p style="color:#b3261e">ووکامرس فعال نیست!</p>';
		}
	}

	public static function save_product_metabox( $post_id, $post ) {
		if ( ! isset( $_POST['case_designable_nonce_field'] ) || ! wp_verify_nonce( $_POST['case_designable_nonce_field'], 'case_designable_nonce' ) ) {
			return;
		}
		if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}
		$val = isset( $_POST['_case_designable'] ) && 'yes' === $_POST['_case_designable'] ? 'yes' : 'no';
		update_post_meta( $post_id, '_case_designable', $val );
	}

	// برای سازگاری با تب «عمومی» ووکامرس
	public static function woo_product_checkbox() {
		if ( ! function_exists( 'woocommerce_wp_checkbox' ) ) {
			return;
		}
		woocommerce_wp_checkbox( array(
			'id'          => '_case_designable',
			'label'       => __( 'قاب قابل طراحی', 'case-designer' ),
			'description' => __( 'دکمه «طراحی قاب» در صفحه محصول نمایش داده شود', 'case-designer' ),
		) );
	}

	public static function woo_product_checkbox_save( $post_id ) {
		$val = isset( $_POST['_case_designable'] ) ? 'yes' : 'no';
		update_post_meta( $post_id, '_case_designable', $val );
	}

	/** دکمه‌ی ورود به ادیتور در صفحه‌ی محصول */
	public static function designer_button() {
		global $product;
		if ( ! $product || ! self::is_designable( $product->get_id() ) ) {
			return;
		}
		$url = add_query_arg( 'product_id', $product->get_id(), get_permalink( self::editor_page_id() ) );
		echo '<a class="button alt case-designer-btn" href="' . esc_url( $url ) . '">' .
			'<i class="fa-solid fa-palette"></i> ' . esc_html__( 'طراحی قاب', 'case-designer' ) . '</a>';
	}

	/** آیا این محصول قاب چاپی است؟ (محصولی که قابلیت طراحی برای آن فعال شده) */
	public static function is_designable( $product_id ) {
		return 'yes' === get_post_meta( $product_id, '_case_designable', true );
	}

	/** شناسه‌ی صفحه‌ی ادیتور (صفحه‌ای که شورت‌کد [case_designer] دارد) */
	public static function editor_page_id() {
		return (int) get_option( 'case_designer_editor_page', 0 );
	}

	/**
	 * اندپوینت افزودن به سبد: POST /case-designer/v1/add-to-cart
	 * بدنه: { product_id, qty, designJson, printPng(base64), thumbPng(base64), modelName }
	 */
	public static function rest_add_to_cart() {
		register_rest_route( 'case-designer/v1', '/add-to-cart', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => array( __CLASS__, 'handle_add_to_cart' ),
			'permission_callback' => '__return_true',
		) );
	}

	public static function handle_add_to_cart( WP_REST_Request $req ) {
		$p = $req->get_json_params();

		// ۱) ذخیره‌ی فایل چاپ (PNG کامل — بدون برش دوربین) در پوشه‌ی اختصاصی
		$print_url = self::store_print_file( $p['printPng'], $p['modelName'] ?? 'design' );
		if ( is_wp_error( $print_url ) ) {
			return $print_url;
		}

		// ۲) تامبنیل کوچک برای سبد/سفارش
		$thumb_url = self::store_thumb( $p['thumbPng'] );

		// ۳) افزودن به سبد ووکامرس با متادیتای طراحی
		$cart_item_data = array(
			self::META_DESIGN     => wp_json_encode( $p['designJson'] ),
			self::META_PRINT_FILE => $print_url,
			self::META_THUMB      => $thumb_url,
			'model_name'          => sanitize_text_field( $p['modelName'] ),
		);

		$key = WC()->cart->add_to_cart( (int) $p['product_id'], (int) $p['qty'], 0, array(), $cart_item_data );

		return $key ? array( 'ok' => true, 'cart_key' => $key, 'cart_url' => wc_get_cart_url() )
					: new WP_Error( 'cart_failed', __( 'افزودن به سبد ناموفق بود', 'case-designer' ) );
	}

	/** ذخیره‌ی فایل چاپ و بازگرداندن URL دائمی */
	protected static function store_print_file( $base64, $name ) {
		$upload = wp_upload_dir();
		$dir    = $upload['basedir'] . '/case-designer';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$file = $dir . '/print-' . uniqid() . '.png';
		$data = preg_replace( '#^data:image/\w+;base64,#i', '', $base64 );
		if ( false === file_put_contents( $file, base64_decode( $data ) ) ) {
			return new WP_Error( 'write_failed', __( 'ذخیره‌ی فایل چاپ ممکن نشد', 'case-designer' ) );
		}
		return $upload['baseurl'] . '/case-designer/' . basename( $file );
	}

	protected static function store_thumb( $base64 ) {
		$upload = wp_upload_dir();
		$dir    = $upload['basedir'] . '/case-designer';
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$file = $dir . '/thumb-' . uniqid() . '.jpg';
		$data = preg_replace( '#^data:image/\w+;base64,#i', '', $base64 );
		@file_put_contents( $file, base64_decode( $data ) );
		return $upload['baseurl'] . '/case-designer/' . basename( $file );
	}

	/** نمایش جزئیات طراحی در سبد و چک‌اوت */
	public static function cart_item_data( $data, $cart_item ) {
		if ( ! empty( $cart_item[ self::META_THUMB ] ) ) {
			$data[] = array(
				'name'    => __( 'طراحی', 'case-designer' ),
				'value'   => '<img src="' . esc_url( $cart_item[ self::META_THUMB ] ) . '" style="max-width:64px;border-radius:8px">',
				'display' => '',
			);
		}
		return $data;
	}

	/** ذخیره‌ی متادیتا روی آیتم سفارش */
	public static function save_order_item_meta( $item, $cart_item_key, $values, $order ) {
		if ( ! empty( $values[ self::META_DESIGN ] ) ) {
			$item->add_meta_data( self::META_DESIGN, $values[ self::META_DESIGN ] );
		}
		if ( ! empty( $values[ self::META_PRINT_FILE ] ) ) {
			$item->add_meta_data( self::META_PRINT_FILE, $values[ self::META_PRINT_FILE ] );
		}
		if ( ! empty( $values[ self::META_THUMB ] ) ) {
			$item->add_meta_data( self::META_THUMB, $values[ self::META_THUMB ] );
		}
	}

	/** تامبنیل طرح در سبد خرید */
	public static function cart_thumbnail( $html, $cart_item, $cart_item_key ) {
		if ( ! empty( $cart_item[ self::META_THUMB ] ) ) {
			return '<img src="' . esc_url( $cart_item[ self::META_THUMB ] ) . '" class="case-design-thumb" alt="">';
		}
		return $html;
	}

	/** ستون «فایل چاپ» در جدول آیتم‌های سفارش (ادمین) */
	public static function order_admin_header( $order ) {
		echo '<th class="case-print-cell">' . esc_html__( 'فایل چاپ', 'case-designer' ) . '</th>';
	}

	public static function order_admin_value( $product, $item, $item_id ) {
		$print_url = $item->get_meta( self::META_PRINT_FILE );
		$thumb     = $item->get_meta( self::META_THUMB );
		echo '<td class="case-print-cell">';
		if ( $thumb ) {
			echo '<img src="' . esc_url( $thumb ) . '" style="max-width:52px;border-radius:8px;display:block;margin-bottom:4px">';
		}
		if ( $print_url ) {
			// فایل کامل و بدون برش — چاپخانه همین را دانلود می‌کند
			echo '<a class="button button-small" href="' . esc_url( $print_url ) . '" download>' .
				'<i class="fa-solid fa-print"></i> ' . esc_html__( 'دانلود فایل چاپ (بدون برش)', 'case-designer' ) . '</a>';
		}
		echo '</td>';
	}
}
