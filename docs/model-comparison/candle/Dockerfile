FROM rust:1.100.0-slim-trixie AS b
WORKDIR /c
COPY Cargo.toml .
COPY src src
RUN cargo build --release && ls -la target/release/cb
ADD https://huggingface.co/openai/clip-vit-base-patch32/resolve/refs%2Fpr%2F15/model.safetensors /m/model.safetensors
FROM gcr.io/distroless/cc-debian13
COPY --from=b /c/target/release/cb /cb
COPY --from=b /m /m
ENTRYPOINT ["/cb"]
