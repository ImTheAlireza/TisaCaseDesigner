<?php
/**
 * حذف کامل پلاگین — پاک‌سازی داده‌ها
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

// پاک‌سازی پست‌ها و متادیتاها
$post_types = array( 'case_model', 'case_sticker', 'case_design' );
foreach ( $post_types as $pt ) {
	$posts = get_posts( array( 'post_type' => $pt, 'posts_per_page' => -1, 'post_status' => 'any' ) );
	foreach ( $posts as $post ) {
		wp_delete_post( $post->ID, true );
	}
}

// پاک‌سازی تنظیمات
delete_option( 'case_designer_settings' );
delete_option( 'case_designer_editor_page' );

// پاک‌سازی فایل‌های چاپ ذخیره‌شده
$upload = wp_upload_dir();
$dir    = $upload['basedir'] . '/case-designer';
if ( is_dir( $dir ) ) {
	$files = glob( $dir . '/*' );
	foreach ( (array) $files as $file ) {
		@unlink( $file );
	}
	@rmdir( $dir );
}

// متادیتای «قابل طراحی» از محصولات
global $wpdb;
$wpdb->delete( $wpdb->postmeta, array( 'meta_key' => '_case_designable' ) );
