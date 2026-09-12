<?php
/**
 * REST API پلاگین — v2 (منطبق با پنل ادمین جدید)
 *
 * مسیرها (پیشوند: /wp-json/case-designer/v1):
 *   GET    /models                  لیست مدل‌ها (عمومی)
 *   POST   /models                  ساخت مدل (+ آپلود موکاپ base64)
 *   POST   /models/{id}/mockup      ذخیره‌ی کادرهای چاپ/دوربین و ابعاد
 *   POST   /models/{id}/image       تعویض تصویر موکاپ (base64)
 *   DELETE /models/{id}             حذف مدل
 *   GET    /stickers  POST /stickers  DELETE /stickers/{id}
 *   GET    /designs   POST /designs   DELETE /designs/{id}
 *   GET    /settings  POST /settings
 *   GET    /orders    POST /orders/{id}/status
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class Case_Designer_REST {

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes() {
		$ns = 'case-designer/v1';

		/* ---------------- مدل‌ها ---------------- */
		register_rest_route( $ns, '/models', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => function () {
				return Case_Designer_CPT::all_models();
			},
			'permission_callback' => '__return_true',
		) );

		register_rest_route( $ns, '/models', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => array( __CLASS__, 'create_model' ),
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/models/(?P<id>\d+)/mockup', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				$body = $req->get_json_params();
				Case_Designer_CPT::save_mockup( (int) $req['id'], $body );
				return array( 'ok' => true );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/models/(?P<id>\d+)/image', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				$p = $req->get_json_params();
				$att = self::save_base64_image( $p['image'], 'mockup-' . (int) $req['id'] );
				if ( ! $att ) {
					return new WP_Error( 'upload_failed', __( 'آپلود تصویر ناموفق بود', 'case-designer' ) );
				}
				set_post_thumbnail( (int) $req['id'], $att );
				$m            = Case_Designer_CPT::get_mockup( (int) $req['id'] );
				$m['img_id']  = $att;
				Case_Designer_CPT::save_mockup( (int) $req['id'], $m );
				return Case_Designer_CPT::all_models();
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/models/(?P<id>\d+)', array(
			'methods'             => WP_REST_Server::DELETABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				wp_delete_post( (int) $req['id'], true );
				return array( 'ok' => true );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		/* ---------------- استیکرها ---------------- */
		register_rest_route( $ns, '/stickers', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => function () { return self::list_cpt( 'case_sticker' ); },
			'permission_callback' => '__return_true',
		) );

		register_rest_route( $ns, '/stickers', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				return self::upload_media_cpt( $req, 'case_sticker', 'استیکر' );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/stickers/(?P<id>\d+)', array(
			'methods'             => WP_REST_Server::DELETABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				wp_delete_post( (int) $req['id'], true );
				return array( 'ok' => true );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		/* ---------------- طرح‌های آماده ---------------- */
		register_rest_route( $ns, '/designs', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => function () { return self::list_cpt( 'case_design' ); },
			'permission_callback' => '__return_true',
		) );

		register_rest_route( $ns, '/designs', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				return self::upload_media_cpt( $req, 'case_design', 'طرح آماده' );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/designs/(?P<id>\d+)', array(
			'methods'             => WP_REST_Server::DELETABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				wp_delete_post( (int) $req['id'], true );
				return array( 'ok' => true );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		/* ---------------- تنظیمات ---------------- */
		register_rest_route( $ns, '/settings', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => function () {
				$s = get_option( 'case_designer_settings', array() );
				$s['editorPageId'] = (int) get_option( 'case_designer_editor_page', 0 );
				$s['editorPageUrl'] = $s['editorPageId'] ? get_permalink( $s['editorPageId'] ) : '';
				return $s;
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/settings', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				$allowed = array( 'defaultDpi', 'printColor', 'camColor', 'mainColor', 'guidesNote', 'storeName', 'currency', 'guidesOn', 'restoreDraft', 'editorPageId' );
				$clean   = array();
				foreach ( $allowed as $key ) {
					if ( isset( $req[ $key ] ) ) {
						if ( in_array( $key, array( 'guidesOn', 'restoreDraft' ), true ) ) {
							$clean[ $key ] = (bool) $req[ $key ];
						} elseif ( 'editorPageId' === $key ) {
							$clean[ $key ] = (int) $req[ $key ];
							update_option( 'case_designer_editor_page', (int) $req[ $key ] );
						} else {
							$clean[ $key ] = sanitize_text_field( $req[ $key ] );
						}
					}
				}
				$existing = get_option( 'case_designer_settings', array() );
				$merged   = array_merge( $existing, $clean );
				update_option( 'case_designer_settings', $merged );
				return $merged;
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		// لیست برگه‌ها برای انتخاب صفحه ادیتور
		register_rest_route( $ns, '/pages', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => function () {
				$pages = get_pages( array( 'post_status' => 'publish', 'number' => 100 ) );
				$out   = array();
				foreach ( $pages as $p ) {
					$has_shortcode = has_shortcode( $p->post_content, 'case_designer' );
					$out[] = array(
						'id'           => $p->ID,
						'title'        => $p->post_title ?: '(بدون عنوان)',
						'url'          => get_permalink( $p->ID ),
						'has_shortcode' => $has_shortcode,
					);
				}
				return $out;
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		/* ---------------- سفارش‌ها ---------------- */
		register_rest_route( $ns, '/orders', array(
			'methods'             => WP_REST_Server::READABLE,
			'callback'            => array( __CLASS__, 'orders' ),
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );

		register_rest_route( $ns, '/orders/(?P<id>\d+)/status', array(
			'methods'             => WP_REST_Server::CREATABLE,
			'callback'            => function ( WP_REST_Request $req ) {
				$allowed = array( 'pending', 'processing', 'completed', 'cancelled' );
				$status  = sanitize_key( $req->get_param( 'status' ) );
				if ( ! in_array( $status, $allowed, true ) ) {
					return new WP_Error( 'bad_status', __( 'وضعیت نامعتبر', 'case-designer' ) );
				}
				wp_update_post( array( 'ID' => (int) $req['id'], 'post_status' => 'wc-' . $status ) );
				return array( 'ok' => true, 'status' => $status );
			},
			'permission_callback' => array( __CLASS__, 'can_manage' ),
		) );
	}

	/* ---------------- ساخت مدل جدید ---------------- */
	public static function create_model( WP_REST_Request $req ) {
		$p  = $req->get_json_params();
		$id = wp_insert_post( array(
			'post_type'   => 'case_model',
			'post_status' => 'publish',
			'post_title'  => sanitize_text_field( $p['name'] ),
		) );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		update_post_meta( $id, Case_Designer_CPT::META_BRAND, sanitize_text_field( $p['brandId'] ) );
		update_post_meta( $id, Case_Designer_CPT::META_PRICE, (float) $p['price'] );
		update_post_meta( $id, Case_Designer_CPT::META_PRODUCT, (int) ( $p['productId'] ?? 0 ) );

		// کادرهای پیش‌فرض ارسالی از سمت پنل
		$mockup = array();
		if ( ! empty( $p['printRect'] ) ) { $mockup['printRect'] = $p['printRect']; }
		if ( ! empty( $p['mainRect'] ) ) { $mockup['mainRect'] = $p['mainRect']; }
		if ( ! empty( $p['camRects'] ) ) { $mockup['camRects'] = $p['camRects']; }
		if ( ! empty( $p['printMm'] ) ) { $mockup['printMm'] = $p['printMm']; }
		if ( ! empty( $p['mainMm'] ) ) { $mockup['mainMm'] = $p['mainMm']; }
		if ( ! empty( $p['dpi'] ) ) { $mockup['dpi'] = (int) $p['dpi']; }
		if ( ! empty( $p['mainColor'] ) ) { $mockup['mainColor'] = sanitize_text_field( $p['mainColor'] ); }
		if ( $mockup ) {
			Case_Designer_CPT::save_mockup( $id, $mockup );
		}

		if ( ! empty( $p['mockupImg'] ) ) {
			$att_id = self::save_base64_image( $p['mockupImg'], $p['name'] . '-mockup' );
			if ( $att_id ) {
				set_post_thumbnail( $id, $att_id );
				$m           = Case_Designer_CPT::get_mockup( $id );
				$m['img_id'] = $att_id;
				Case_Designer_CPT::save_mockup( $id, $m );
			}
		}
		return Case_Designer_CPT::all_models();
	}

	/* ---------------- لیست استیکرها/طرح‌ها ---------------- */
	protected static function list_cpt( $post_type ) {
		return Case_Designer_CPT::list_items( $post_type );
	}

	/* ---------------- آپلود تصویر + ساخت پست ---------------- */
	protected static function upload_media_cpt( WP_REST_Request $req, $post_type, $title_prefix ) {
		$p      = $req->get_json_params();
		$att_id = self::save_base64_image( $p['image'], $title_prefix . '-' . uniqid() );
		if ( ! $att_id ) {
			return new WP_Error( 'upload_failed', __( 'آپلود ناموفق بود', 'case-designer' ) );
		}
		$post_id = wp_insert_post( array(
			'post_type'   => $post_type,
			'post_status' => 'publish',
			'post_title'  => sanitize_text_field( $p['name'] ),
		) );
		set_post_thumbnail( $post_id, $att_id );
		return array( 'id' => $post_id, 'url' => wp_get_attachment_url( $att_id ) );
	}

	/* ---------------- ذخیره‌ی base64 در رسانه ---------------- */
	protected static function save_base64_image( $data, $title ) {
		if ( empty( $data ) ) {
			return 0;
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$data = preg_replace( '#^data:image/\w+;base64,#i', '', $data );
		$data = base64_decode( $data );
		if ( ! $data ) {
			return 0;
		}
		$tmp = wp_tempnam( 'case-designer-' );
		file_put_contents( $tmp, $data );
		$att = media_handle_sideload( array(
			'name'     => sanitize_title( $title ) . '.png',
			'tmp_name' => $tmp,
		), 0 );
		@unlink( $tmp );
		return is_wp_error( $att ) ? 0 : $att;
	}

	/* ---------------- سفارش‌های طراحی قاب ---------------- */
	public static function orders() {
		if ( ! function_exists( 'wc_get_orders' ) ) {
			return array();
		}
		$out    = array();
		$orders = wc_get_orders( array( 'limit' => 50, 'orderby' => 'date', 'order' => 'DESC' ) );
		foreach ( $orders as $order ) {
			foreach ( $order->get_items() as $item_id => $item ) {
				if ( ! $item->get_meta( Case_Designer_Woo::META_DESIGN ) ) {
					continue;
				}
				$out[] = array(
					'id'        => $order->get_id(),
					'code'      => (string) $order->get_order_number(),
					'date'      => $order->get_date_created() ? $order->get_date_created()->date( 'c' ) : '',
					'modelName' => $item->get_name(),
					'qty'       => (int) $item->get_quantity(),
					'price'     => (float) $item->get_total(),
					'status'    => str_replace( 'wc-', '', $order->get_status() ),
					'thumb'     => (string) $item->get_meta( Case_Designer_Woo::META_THUMB ),
					'printFile' => (string) $item->get_meta( Case_Designer_Woo::META_PRINT_FILE ),
					'printDpi'  => 300,
				);
			}
		}
		return $out;
	}

	public static function can_manage() {
		return current_user_can( 'manage_woocommerce' );
	}
}
