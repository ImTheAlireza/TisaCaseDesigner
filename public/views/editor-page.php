<?php
/**
 * صفحه‌ی ادیتور فرانت‌اند — رندر شورت‌کد [case_designer]
 * همان دو بخش دمو: انتخاب مدل → ادیتور (پیش‌نمایش/خرید مودال‌اند)
 * داده‌ها از CaseDesignerData (تزریق سمت سرور توسط PHP) خوانده می‌شوند؛
 * REST فقط برای نوشتن (افزودن به سبد) به‌کار می‌رود.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
?>
<div id="case-designer-root" dir="rtl" data-product-id="<?php echo isset( $atts['product_id'] ) ? (int) $atts['product_id'] : 0; ?>">

	<!-- بلاب‌های رنگی شناور پس‌زمینه (گلاسمورفیسم) -->
	<div class="bg-blobs">
		<div class="bg-blob b1"></div>
		<div class="bg-blob b2"></div>
		<div class="bg-blob b3"></div>
	</div>

	<!-- صفحه‌ی ۱: انتخاب برند و مدل -->
	<div id="picker">
		<div class="picker-top">
			<div class="logo"><span class="logo-ico"><i class="fa-solid fa-mobile-screen"></i></span> <span id="storeName"></span></div>
			<div class="searchbox">
				<span><i class="fa-solid fa-magnifying-glass"></i></span>
				<input id="searchInput" placeholder="<?php esc_attr_e( 'جستجوی مدل... مثلاً iPhone 16 یا گلکسی', 'case-designer' ); ?>">
			</div>
			<div class="top-actions">
				<button class="btn btn-outline btn-sm" id="btnClearCart" title="<?php esc_attr_e( 'مشاهده‌ی سبد خرید', 'case-designer' ); ?>"><i class="fa-solid fa-cart-shopping"></i> <span class="cart-count">۰</span></button>
			</div>
		</div>
		<div class="picker-body">
			<h2 style="margin-bottom:4px"><?php esc_html_e( 'قاب گوشی‌ات را طراحی کن', 'case-designer' ); ?> <i class="fa-solid fa-palette"></i></h2>
			<p class="muted"><?php esc_html_e( 'اول برند، بعد مدل دقیق گوشی‌ات را انتخاب کن — طرح را می‌توانی بعداً عوض کنی.', 'case-designer' ); ?></p>
			<div class="brand-row" id="brandRow"></div>
			<div class="model-grid" id="modelGrid"></div>
		</div>
	</div>

	<!-- صفحه‌ی ۲: ادیتور -->
	<div id="editorApp">
		<div class="ed-head">
			<button class="btn btn-outline btn-sm" id="btnBack"><i class="fa-solid fa-arrow-right-long"></i> <?php esc_html_e( 'بازگشت', 'case-designer' ); ?></button>
			<div class="ed-title">
				<b id="editorModelName"></b>
				<span class="ed-price" id="editorModelPrice"></span>
			</div>
			<button class="btn btn-outline btn-sm" id="btnDraft"><i class="fa-solid fa-floppy-disk"></i> <?php esc_html_e( 'ذخیره پیش‌نویس', 'case-designer' ); ?></button>
			<div class="ed-spacer"></div>
			<div class="ed-zoom">
				<button class="tbtn" id="btnZoomOut" title="<?php esc_attr_e( 'کوچک‌نمایی', 'case-designer' ); ?>"><i class="fa-solid fa-minus"></i></button>
				<span class="zoom-info" id="zoomInfo">100٪</span>
				<button class="tbtn" id="btnZoomIn" title="<?php esc_attr_e( 'بزرگ‌نمایی', 'case-designer' ); ?>"><i class="fa-solid fa-plus"></i></button>
				<button class="tbtn" id="btnFit" title="<?php esc_attr_e( 'نمای کامل', 'case-designer' ); ?>"><i class="fa-solid fa-expand"></i></button>
			</div>
			<button class="tbtn on" id="btnGuides" title="<?php esc_attr_e( 'نمایش/مخفی‌کردن کادرهای راهنما', 'case-designer' ); ?>"><i class="fa-solid fa-draw-polygon"></i></button>
			<button class="btn btn-primary" id="btnPreview"><i class="fa-solid fa-eye"></i> <?php esc_html_e( 'پیش‌نمایش', 'case-designer' ); ?></button>
			<button class="btn btn-success" id="btnCheckout"><i class="fa-solid fa-cart-shopping"></i> <?php esc_html_e( 'افزودن به سبد', 'case-designer' ); ?></button>
		</div>

		<div class="ed-body" id="edBody">
			<!-- بوم بزرگ -->
			<div id="stage">
				<div class="ed-float">
					<button class="tbtn" id="btnUndo" title="<?php esc_attr_e( 'بازگشت (Ctrl+Z)', 'case-designer' ); ?>"><i class="fa-solid fa-rotate-left"></i></button>
					<button class="tbtn" id="btnRedo" title="<?php esc_attr_e( 'انجام دوباره (Ctrl+Y)', 'case-designer' ); ?>"><i class="fa-solid fa-rotate-right"></i></button>
					<span class="ed-sep"></span>
					<button class="tbtn" id="btnCopy" title="<?php esc_attr_e( 'کپی', 'case-designer' ); ?>"><i class="fa-regular fa-clipboard"></i></button>
					<button class="tbtn" id="btnPaste" title="<?php esc_attr_e( 'جای‌گذاری', 'case-designer' ); ?>"><i class="fa-regular fa-paste"></i></button>
					<button class="tbtn" id="btnDel" title="<?php esc_attr_e( 'حذف', 'case-designer' ); ?>"><i class="fa-regular fa-trash-can"></i></button>
					<span class="ed-sep"></span>
					<button class="tbtn" id="btnFlipH" title="<?php esc_attr_e( 'قرینه افقی', 'case-designer' ); ?>"><i class="fa-solid fa-arrows-left-right"></i></button>
					<button class="tbtn" id="btnFlipV" title="<?php esc_attr_e( 'قرینه عمودی', 'case-designer' ); ?>"><i class="fa-solid fa-arrows-up-down"></i></button>
					<button class="tbtn" id="btnClear" title="<?php esc_attr_e( 'پاک‌کردن همه', 'case-designer' ); ?>"><i class="fa-solid fa-broom"></i></button>
				</div>
				<div id="inspectorPanel" class="ed-inspector"></div>
				<div id="canvasHolder">
					<canvas id="designCanvas"></canvas>
				</div>
				<div class="ed-statusbar">
					<span class="ed-hint-chip">Space = <?php esc_html_e( 'جابه‌جایی صفحه', 'case-designer' ); ?></span>
					<span class="ed-hint-chip"><?php esc_html_e( 'چرخ ماوس = زوم', 'case-designer' ); ?></span>
					<span class="ed-status-note"><?php esc_html_e( 'خط‌چین آبی = فضای چاپ · قرمز = دوربین · سبز = فریم اصلی', 'case-designer' ); ?></span>
					<span class="ed-spacer"></span>
					<span class="ed-status-note"><?php esc_html_e( 'فایل نهایی در ابعاد فریم اصلی کات می‌شود', 'case-designer' ); ?></span>
				</div>
			</div>

			<!-- داک ابزارها (قابل جمع‌شدن) -->
			<aside class="ed-dock">
				<div class="ed-dock-head"><i class="fa-solid fa-shapes"></i> <?php esc_html_e( 'ابزارها', 'case-designer' ); ?>
					<button class="ed-dock-close" id="dockClose" title="<?php esc_attr_e( 'بستن پنل ابزارها', 'case-designer' ); ?>"><i class="fa-solid fa-xmark"></i></button>
				</div>
				<div class="side-tabs">
					<button class="side-tab active" data-panel="uploadPanel"><span class="ico"><i class="fa-solid fa-image"></i></span><?php esc_html_e( 'تصویر', 'case-designer' ); ?></button>
					<button class="side-tab" data-panel="textPanel"><span class="ico"><i class="fa-solid fa-pen-nib"></i></span><?php esc_html_e( 'متن', 'case-designer' ); ?></button>
					<button class="side-tab" data-panel="layersPanel"><span class="ico"><i class="fa-solid fa-layer-group"></i></span><?php esc_html_e( 'لایه‌ها', 'case-designer' ); ?></button>
				</div>
				<div class="side-body">
					<div class="panel" id="uploadPanel"></div>
					<div class="panel hidden" id="textPanel"></div>
					<div class="panel hidden" id="layersPanel"></div>
				</div>
				<div class="side-foot">
					<div class="note-box" style="margin:0">
						<div class="note-title"><i class="fa-regular fa-lightbulb"></i> <?php esc_html_e( 'کادرها و ابزار دست', 'case-designer' ); ?></div>
						<?php esc_html_e( 'خط‌چین آبی = فضای چاپ', 'case-designer' ); ?><br>
						<?php esc_html_e( 'خط‌چین قرمز = فضای دوربین', 'case-designer' ); ?><br>
						<?php esc_html_e( 'خط‌چین سبز = فریم اصلی (برش نهایی)', 'case-designer' ); ?><br>
						<strong><?php esc_html_e( 'نگه‌داشتن Space', 'case-designer' ); ?></strong> <?php esc_html_e( '= ابزار دست', 'case-designer' ); ?><br>
						<?php esc_html_e( 'چرخ ماوس = بزرگ‌نمایی روی نشانگر', 'case-designer' ); ?>
					</div>
				</div>
			</aside>

			<button class="ed-dock-open" id="dockOpen" title="<?php esc_attr_e( 'بازکردن پنل ابزارها', 'case-designer' ); ?>"><i class="fa-solid fa-shapes"></i></button>
		</div>
	</div>

	<div id="toasts"></div>
</div>
