<?php
/**
 * انواع محتوای سفارشی (Custom Post Types) و متادیتاها
 *
 * در دمو این داده‌ها در localStorage بودند؛ در پلاگین واقعی:
 *   - مدل‌ها  → CPT «case_model»  (هر مدل = یک پست + متادیتای موکاپ/کادرها)
 *   - استیکرها → CPT «case_sticker» (تصویر شاخص = خود استیکر)
 *   - طرح‌های آماده → CPT «case_design»  (تصویر شاخص = خود طرح)
 *   - تنظیمات → جدول wp_options
 *   - سفارش‌ها → سفارش‌های خود ووکامرس + متادیتای آیتم سفارش (بدون CPT جداگانه)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_CPT {

	/** متادیتای موکاپ هر مدل (ذخیره‌شده به‌صورت JSON در post_meta) */
	const META_MOCKUP = '_case_mockup'; // { img_id, printRect, camRects[], printMm{w,h}, dpi, printColor, camColor }

	/** متادیتای عمومی مدل */
	const META_BRAND   = '_case_brand';   // apple | samsung | xiaomi
	const META_PRICE   = '_case_price';   // تومان
	const META_PRODUCT = '_case_product'; // شناسه‌ی محصول ووکامرس متصل (اختیاری)

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
	}

	public static function register() {
		/*
		 * CPT ها فقط «مخزن داده» هستند و همه‌ی مدیریتشان از پنل «قاب‌ساز» (REST) انجام می‌شود.
		 * پس در منوی پیشخوان ظاهر نمی‌شوند — قبلاً با show_ui=true چند گزینه‌ی اضافی
		 * (مدل‌های قاب / استیکرها / طرح‌های آماده) زیر منوی قاب‌ساز ساخته بودند.
		 */
		$hidden_args = array(
			'public'              => false,
			'show_ui'             => false,
			'show_in_menu'        => false,
			'show_in_admin_bar'   => false,
			'show_in_nav_menus'   => false,
			'publicly_queryable'  => false,
			'exclude_from_search' => true,
			'has_archive'         => false,
			'rewrite'             => false,
			'query_var'           => false,
		);

		// ---- مدل‌های قاب ----
		register_post_type( 'case_model', array_merge( $hidden_args, array(
			'labels' => array(
				'name'          => __( 'مدل‌های قاب', 'case-designer' ),
				'singular_name' => __( 'مدل قاب', 'case-designer' ),
			),
			'supports'  => array( 'title', 'thumbnail' ),
		) ) );

		// ---- استیکرها ----
		register_post_type( 'case_sticker', array_merge( $hidden_args, array(
			'labels' => array(
				'name'          => __( 'استیکرها', 'case-designer' ),
				'singular_name' => __( 'استیکر', 'case-designer' ),
			),
			'supports'  => array( 'title', 'thumbnail' ),
		) ) );

		// ---- طرح‌های آماده ----
		register_post_type( 'case_design', array_merge( $hidden_args, array(
			'labels' => array(
				'name'          => __( 'طرح‌های آماده', 'case-designer' ),
				'singular_name' => __( 'طرح آماده', 'case-designer' ),
			),
			'supports'  => array( 'title', 'thumbnail' ),
		) ) );
	}

	/**
	 * دریافت موکاپ یک مدل با مقادیر پیش‌فرض
	 *
	 * @param int $model_id
	 * @return array
	 */
	public static function get_mockup( $model_id ) {
		$mockup = get_post_meta( $model_id, self::META_MOCKUP, true );
		if ( ! is_array( $mockup ) ) {
			$mockup = array();
		}
		return wp_parse_args( $mockup, array(
			'img_id'     => get_post_thumbnail_id( $model_id ),
			'printRect'  => array( 'x' => 110, 'y' => 120, 'w' => 580, 'h' => 1200 ),
			'camRects'   => array(),
			'printMm'    => array( 'w' => 66, 'h' => 138 ),
			'dpi'        => 300,
			'printColor' => '#304ffe',
			'camColor'   => '#ed1944',
		) );
	}

	/**
	 * ذخیره‌ی موکاپ + کادرها (خروجی پنل کادرکشی ادمین)
	 *
	 * @param int   $model_id
	 * @param array $mockup
	 */
	public static function save_mockup( $model_id, array $mockup ) {
		update_post_meta( $model_id, self::META_MOCKUP, $mockup );
	}

	/**
	 * لیست استیکرها / طرح‌های آماده برای REST و تزریق سمت سرور
	 */
	public static function list_items( $post_type ) {
		$out   = array();
		$posts = get_posts( array(
			'post_type'      => $post_type,
			'posts_per_page' => -1,
			'post_status'    => 'publish',
		) );
		foreach ( $posts as $p ) {
			$out[] = array(
				'id'   => $p->ID,
				'name' => $p->post_title,
				'url'  => get_the_post_thumbnail_url( $p->ID, 'medium' ) ?: '',
			);
		}
		return $out;
	}

	/**
	 * لیست همه‌ی مدل‌ها برای REST (شبیه db.models در دمو)
	 */
	public static function all_models() {
		$out    = array();
		$models = get_posts( array(
			'post_type'      => 'case_model',
			'posts_per_page' => -1,
			'post_status'    => 'publish',
		) );
		foreach ( $models as $m ) {
			$mockup = self::get_mockup( $m->ID );
			$out[]  = array(
				'id'        => $m->ID,
				'name'      => $m->post_title,
				'brandId'   => get_post_meta( $m->ID, self::META_BRAND, true ),
				'price'     => (float) get_post_meta( $m->ID, self::META_PRICE, true ),
				'productId' => (int) get_post_meta( $m->ID, self::META_PRODUCT, true ),
				'mockup'    => array_merge( $mockup, array(
					'img' => $mockup['img_id'] ? wp_get_attachment_url( $mockup['img_id'] ) : '',
				) ),
			);
		}
		return $out;
	}
}
