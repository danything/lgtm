// The image codecs the browser uses to make LGTM images, compiled to wasm by
// scripts/build-wasm.sh: libwebp to encode (and to read animated WebP) and
// giflib to read GIFs. Everything else -- resizing, the LGTM overlay, still
// images in other formats -- happens in JS on a canvas.
//
// Encoding takes frames one at a time, so the encoder can run in its own
// worker while another worker is still decoding and stamping the next ones.
// Decoders likewise hand out one finished frame per call.
//
// Every buffer handed back to JS is a fresh Uint8Array (copied out of the
// wasm heap), so JS can keep or transfer it without it changing underneath.

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <gif_lib.h>
#include <webp/demux.h>
#include <webp/encode.h>
#include <webp/mux.h>

#include <cstring>
#include <string>
#include <vector>

using namespace emscripten;

namespace {

val copyOut(const uint8_t* bytes, size_t size) {
	val out = val::global("Uint8Array").new_(size);
	out.call<void>("set", val(typed_memory_view(size, bytes)));
	return out;
}

val frameObject(const uint8_t* rgba, size_t size, int duration) {
	val frame = val::object();
	frame.set("data", copyOut(rgba, size));
	frame.set("duration", duration);
	return frame;
}

}  // namespace

// Lossy WebP at a fixed quality, one RGBA frame at a time. A single frame
// comes out as a still image, more than one as an animation.
class Encoder {
 public:
	Encoder(int width, int height, float quality)
		: width_(width), height_(height), quality_(quality) {}

	~Encoder() {
		if (anim_) WebPAnimEncoderDelete(anim_);
	}

	// `duration` is how long this frame shows, in milliseconds.
	bool add(const std::string& rgba, int duration) {
		if (failed_ || !fits(rgba)) return fail();
		if (count_ == 0) {
			// Held back until a second frame says this is an animation.
			first_ = rgba;
			firstDuration_ = duration;
			count_ = 1;
			return true;
		}
		if (!anim_) {
			WebPAnimEncoderOptions options;
			if (!WebPAnimEncoderOptionsInit(&options)) return fail();
			anim_ = WebPAnimEncoderNew(width_, height_, &options);
			if (!anim_ || !addFrame(first_, firstDuration_)) return fail();
			std::string().swap(first_);
		}
		count_++;
		return addFrame(rgba, duration) || fail();
	}

	val finish() {
		if (failed_ || count_ == 0) return val::null();
		if (!anim_) return encodeStill();
		// A closing timestamp, so the last frame keeps its own duration rather
		// than one libwebp guesses.
		if (!WebPAnimEncoderAdd(anim_, nullptr, timestamp_, nullptr))
			return val::null();
		WebPData data;
		WebPDataInit(&data);
		if (!WebPAnimEncoderAssemble(anim_, &data)) return val::null();
		val out = copyOut(data.bytes, data.size);
		WebPDataClear(&data);
		return out;
	}

 private:
	bool fits(const std::string& rgba) const {
		return width_ > 0 && height_ > 0 && width_ <= WEBP_MAX_DIMENSION &&
		       height_ <= WEBP_MAX_DIMENSION &&
		       rgba.size() == size_t(width_) * height_ * 4;
	}

	bool fail() {
		failed_ = true;
		return false;
	}

	bool config(WebPConfig* config) const {
		if (!WebPConfigInit(config)) return false;
		config->quality = quality_;
		config->lossless = 0;
		return true;
	}

	bool picture(WebPPicture* pic, const std::string& rgba) const {
		if (!WebPPictureInit(pic)) return false;
		pic->use_argb = 1;
		pic->width = width_;
		pic->height = height_;
		return WebPPictureImportRGBA(
			pic, reinterpret_cast<const uint8_t*>(rgba.data()), width_ * 4);
	}

	bool addFrame(const std::string& rgba, int duration) {
		WebPConfig cfg;
		WebPPicture pic;
		if (!config(&cfg) || !picture(&pic, rgba)) return false;
		const bool ok = WebPAnimEncoderAdd(anim_, &pic, timestamp_, &cfg);
		WebPPictureFree(&pic);
		timestamp_ += duration;
		return ok;
	}

	val encodeStill() {
		WebPConfig cfg;
		WebPPicture pic;
		if (!config(&cfg) || !picture(&pic, first_)) return val::null();
		WebPMemoryWriter writer;
		WebPMemoryWriterInit(&writer);
		pic.writer = WebPMemoryWrite;
		pic.custom_ptr = &writer;
		const bool ok = WebPEncode(&cfg, &pic);
		WebPPictureFree(&pic);
		val out = ok ? copyOut(writer.mem, writer.size) : val::null();
		WebPMemoryWriterClear(&writer);
		return out;
	}

	int width_;
	int height_;
	float quality_;
	WebPAnimEncoder* anim_ = nullptr;
	std::string first_;
	int firstDuration_ = 0;
	int count_ = 0;
	int timestamp_ = 0;
	bool failed_ = false;
};

// Plays a GIF the way browsers do: each image is drawn over what the last one
// left behind, its transparent index lets that show through, and its disposal
// says what to clear before the next.
class GifDecoder {
 public:
	explicit GifDecoder(std::string bytes) : src_(std::move(bytes)) {
		int error = 0;
		gif_ = DGifOpen(this, &GifDecoder::read, &error);
		if (!gif_) return;
		if (DGifSlurp(gif_) != GIF_OK || gif_->ImageCount < 1) {
			DGifCloseFile(gif_, &error);
			gif_ = nullptr;
			return;
		}
		width_ = gif_->SWidth;
		height_ = gif_->SHeight;
		// Some files leave the screen size at zero; the first image's own size
		// is what a browser falls back to.
		if (width_ <= 0 || height_ <= 0) {
			width_ = gif_->SavedImages[0].ImageDesc.Width;
			height_ = gif_->SavedImages[0].ImageDesc.Height;
		}
		if (width_ <= 0 || height_ <= 0) return;
		canvas_.assign(size_t(width_) * height_ * 4, 0);
	}

	~GifDecoder() {
		int error = 0;
		if (gif_) DGifCloseFile(gif_, &error);
	}

	bool ok() const { return gif_ && !canvas_.empty(); }
	int width() const { return width_; }
	int height() const { return height_; }
	int frameCount() const { return ok() ? gif_->ImageCount : 0; }

	// The whole canvas after the next frame is drawn, or null at the end.
	val next() {
		if (!ok() || index_ >= gif_->ImageCount) return val::null();
		disposePrevious();

		const SavedImage& image = gif_->SavedImages[index_];
		GraphicsControlBlock gcb = {DISPOSAL_UNSPECIFIED, false, 0, NO_TRANSPARENT_COLOR};
		DGifSavedExtensionToGCB(gif_, index_, &gcb);
		const GifImageDesc& d = image.ImageDesc;
		if (gcb.DisposalMode == DISPOSE_PREVIOUS) saved_ = canvas_;
		draw(image, gcb.TransparentColor);

		dispose_ = gcb.DisposalMode;
		left_ = d.Left;
		top_ = d.Top;
		rectWidth_ = d.Width;
		rectHeight_ = d.Height;
		index_++;

		// Browsers show a delay of 0 or 1 (centiseconds) as 100ms.
		int duration = gcb.DelayTime * 10;
		if (duration <= 10) duration = 100;
		return frameObject(canvas_.data(), canvas_.size(), duration);
	}

 private:
	static int read(GifFileType* gif, GifByteType* out, int size) {
		auto* self = static_cast<GifDecoder*>(gif->UserData);
		const size_t left = self->src_.size() - self->pos_;
		const size_t n = size_t(size) < left ? size_t(size) : left;
		std::memcpy(out, self->src_.data() + self->pos_, n);
		self->pos_ += n;
		return int(n);
	}

	void draw(const SavedImage& image, int transparent) {
		const GifImageDesc& d = image.ImageDesc;
		const ColorMapObject* map = d.ColorMap ? d.ColorMap : gif_->SColorMap;
		if (!map || !image.RasterBits) return;
		for (int y = 0; y < d.Height; y++) {
			const int cy = d.Top + y;
			if (cy < 0 || cy >= height_) continue;
			for (int x = 0; x < d.Width; x++) {
				const int cx = d.Left + x;
				if (cx < 0 || cx >= width_) continue;
				const int index = image.RasterBits[size_t(y) * d.Width + x];
				if (index == transparent || index >= map->ColorCount) continue;
				const GifColorType& c = map->Colors[index];
				uint8_t* p = &canvas_[(size_t(cy) * width_ + cx) * 4];
				p[0] = c.Red;
				p[1] = c.Green;
				p[2] = c.Blue;
				p[3] = 255;
			}
		}
	}

	void disposePrevious() {
		if (index_ == 0) return;
		if (dispose_ == DISPOSE_BACKGROUND) {
			// Browsers clear to transparent, not to the background colour.
			for (int y = top_; y < top_ + rectHeight_; y++) {
				if (y < 0 || y >= height_) continue;
				for (int x = left_; x < left_ + rectWidth_; x++) {
					if (x < 0 || x >= width_) continue;
					std::memset(&canvas_[(size_t(y) * width_ + x) * 4], 0, 4);
				}
			}
		} else if (dispose_ == DISPOSE_PREVIOUS && !saved_.empty()) {
			canvas_ = saved_;
		}
	}

	std::string src_;
	size_t pos_ = 0;
	GifFileType* gif_ = nullptr;
	int width_ = 0;
	int height_ = 0;
	std::vector<uint8_t> canvas_;
	std::vector<uint8_t> saved_;
	int index_ = 0;
	int dispose_ = DISPOSAL_UNSPECIFIED;
	int left_ = 0, top_ = 0, rectWidth_ = 0, rectHeight_ = 0;
};

// Animated WebP, one full RGBA canvas per call.
class WebPDecoder {
 public:
	explicit WebPDecoder(std::string bytes) : src_(std::move(bytes)) {
		WebPData data = {reinterpret_cast<const uint8_t*>(src_.data()), src_.size()};
		WebPAnimDecoderOptions options;
		if (!WebPAnimDecoderOptionsInit(&options)) return;
		options.color_mode = MODE_RGBA;
		options.use_threads = 0;
		dec_ = WebPAnimDecoderNew(&data, &options);
		if (dec_ && !WebPAnimDecoderGetInfo(dec_, &info_)) {
			WebPAnimDecoderDelete(dec_);
			dec_ = nullptr;
		}
	}

	~WebPDecoder() {
		if (dec_) WebPAnimDecoderDelete(dec_);
	}

	bool ok() const { return dec_ != nullptr; }
	int width() const { return ok() ? int(info_.canvas_width) : 0; }
	int height() const { return ok() ? int(info_.canvas_height) : 0; }
	int frameCount() const { return ok() ? int(info_.frame_count) : 0; }

	val next() {
		if (!ok() || !WebPAnimDecoderHasMoreFrames(dec_)) return val::null();
		uint8_t* buf = nullptr;
		int timestamp = 0;
		if (!WebPAnimDecoderGetNext(dec_, &buf, &timestamp)) return val::null();
		const int duration = timestamp - previous_;
		previous_ = timestamp;
		return frameObject(buf, size_t(width()) * height() * 4, duration);
	}

 private:
	std::string src_;
	WebPAnimDecoder* dec_ = nullptr;
	WebPAnimInfo info_ = {};
	int previous_ = 0;
};

EMSCRIPTEN_BINDINGS(lgtm) {
	class_<Encoder>("Encoder")
		.constructor<int, int, float>()
		.function("add", &Encoder::add)
		.function("finish", &Encoder::finish);
	class_<GifDecoder>("GifDecoder")
		.constructor<std::string>()
		.function("ok", &GifDecoder::ok)
		.function("width", &GifDecoder::width)
		.function("height", &GifDecoder::height)
		.function("frameCount", &GifDecoder::frameCount)
		.function("next", &GifDecoder::next);
	class_<WebPDecoder>("WebPDecoder")
		.constructor<std::string>()
		.function("ok", &WebPDecoder::ok)
		.function("width", &WebPDecoder::width)
		.function("height", &WebPDecoder::height)
		.function("frameCount", &WebPDecoder::frameCount)
		.function("next", &WebPDecoder::next);
}
