// HEIF/HEIC stills (iPhone photos) for browsers that cannot decode them:
// libheif with libde265, in its own module so only HEIC uploads load it.
// libheif applies the file's rotation and mirroring; metadata is not read.

#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <libheif/heif.h>

#include <cstring>
#include <string>
#include <vector>

using namespace emscripten;

class HeifDecoder {
 public:
	explicit HeifDecoder(std::string bytes) : src_(std::move(bytes)) {
		static const bool initialised = heif_init(nullptr).code == heif_error_Ok;
		if (!initialised) {
			fail("libheif did not start");
			return;
		}
		ctx_ = heif_context_alloc();
		if (!ok(heif_context_read_from_memory_without_copy(ctx_, src_.data(),
		                                                    src_.size(), nullptr)))
			return;
		heif_image_handle* handle = nullptr;
		if (!ok(heif_context_get_primary_image_handle(ctx_, &handle))) return;
		heif_image* image = nullptr;
		const bool decoded = ok(heif_decode_image(
			handle, &image, heif_colorspace_RGB, heif_chroma_interleaved_RGBA,
			nullptr));
		heif_image_handle_release(handle);
		if (!decoded) return;

		width_ = heif_image_get_width(image, heif_channel_interleaved);
		height_ = heif_image_get_height(image, heif_channel_interleaved);
		size_t stride = 0;
		const uint8_t* plane =
			heif_image_get_plane_readonly2(image, heif_channel_interleaved, &stride);
		if (plane && width_ > 0 && height_ > 0) {
			const size_t row = size_t(width_) * 4;
			rgba_.resize(row * height_);
			for (int y = 0; y < height_; y++)
				std::memcpy(&rgba_[row * y], plane + stride * y, row);
		} else {
			fail("no pixels");
		}
		heif_image_release(image);
	}

	~HeifDecoder() {
		if (ctx_) heif_context_free(ctx_);
	}

	bool ok() const { return !rgba_.empty(); }
	int width() const { return width_; }
	int height() const { return height_; }
	std::string error() const { return error_; }

	// The whole picture as RGBA, copied out of the wasm heap.
	val rgba() const {
		val out = val::global("Uint8Array").new_(rgba_.size());
		out.call<void>("set", val(typed_memory_view(rgba_.size(), rgba_.data())));
		return out;
	}

 private:
	bool ok(heif_error err) {
		if (err.code == heif_error_Ok) return true;
		fail(err.message ? err.message : "decode failed");
		return false;
	}

	void fail(const char* message) { error_ = message; }

	std::string src_;
	heif_context* ctx_ = nullptr;
	std::vector<uint8_t> rgba_;
	int width_ = 0;
	int height_ = 0;
	std::string error_;
};

EMSCRIPTEN_BINDINGS(heif) {
	class_<HeifDecoder>("HeifDecoder")
		.constructor<std::string>()
		.function("ok", select_overload<bool() const>(&HeifDecoder::ok))
		.function("width", &HeifDecoder::width)
		.function("height", &HeifDecoder::height)
		.function("error", &HeifDecoder::error)
		.function("rgba", &HeifDecoder::rgba);
}
