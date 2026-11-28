// CLIP B/32 image tower in candle on the CPU: one picture at a time.
// cb <model.safetensors> <px-224.f32>
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::clip::{ClipConfig, ClipModel};
use std::io::{Read, Seek, SeekFrom};
use std::time::Instant;

fn main() -> candle_core::Result<()> {
    let a: Vec<String> = std::env::args().collect();
    let dev = Device::Cpu;
    let t0 = Instant::now();
    let vb = unsafe { VarBuilder::from_mmaped_safetensors(&[&a[1]], DType::F32, &dev)? };
    let model = ClipModel::new(vb, &ClipConfig::vit_base_patch32())?;
    let load = t0.elapsed().as_millis();
    let mut f = std::fs::File::open(&a[2]).unwrap();
    let p = 224 * 224;
    let mean = [0.48145466f32, 0.4578275, 0.40821073];
    let std = [0.26862954f32, 0.26130258, 0.27577711];
    let mut ts = vec![];
    for i in 0..31u64 {
        let mut buf = vec![0u8; p * 12];
        f.seek(SeekFrom::Start(i * (p as u64) * 12)).unwrap();
        f.read_exact(&mut buf).unwrap();
        let hwc: Vec<f32> = buf.chunks_exact(4).map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]])).collect();
        let mut x = vec![0f32; 3 * p];
        for t in 0..p { for c in 0..3 { x[c * p + t] = (hwc[t * 3 + c] / 255.0 - mean[c]) / std[c]; } }
        let s = Instant::now();
        let e = model.get_image_features(&Tensor::from_vec(x, (1, 3, 224, 224), &dev)?)?;
        let _v: Vec<f32> = e.flatten_all()?.to_vec1()?;
        if i > 0 { ts.push(s.elapsed().as_secs_f64() * 1000.0); }
    }
    ts.sort_by(|a, b| a.partial_cmp(b).unwrap());
    println!("{{\"lib\":\"candle\",\"loadMs\":{},\"medianMs\":{:.1}}}", load, ts[ts.len() / 2]);
    Ok(())
}
