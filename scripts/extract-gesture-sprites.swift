// Extracts existing 1536×1024 gesture sheets using local macOS Vision (macOS 14+).
// Usage: swift scripts/extract-gesture-sprites.swift <output-directory> <source.png> [...]
// Outputs <character>-<animation>.png; never overwrites the source image.
import Foundation
import AppKit
import Vision
import CoreImage
guard CommandLine.arguments.count >= 3 else { fatalError("Expected output directory and source images") }
let outputDir = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDir, withIntermediateDirectories: true)
let context = CIContext()
for file in CommandLine.arguments.dropFirst(2) {
 let url = URL(fileURLWithPath: file)
 let image = NSImage(contentsOf: url)!
 var rect = CGRect(origin: .zero, size: image.size)
 let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
 guard cg.width == 1536 && cg.height == 1024 else { fatalError("Expected 1536×1024 sheet: \(file)") }
 let output = CGContext(data: nil, width: 1536, height: 1024, bitsPerComponent: 8, bytesPerRow: 1536 * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
 for i in 0..<8 {
  let cell = cg.cropping(to: CGRect(x: (i%4)*384, y: (i/4)*512, width: 384, height: 512))!
  let handler = VNImageRequestHandler(cgImage: cell)
  let request = VNGenerateForegroundInstanceMaskRequest()
  try handler.perform([request])
  guard let result = request.results?.first, !result.allInstances.isEmpty else { fatalError("No foreground: \(file) frame \(i)") }
  let mask = try result.generateScaledMaskForImage(forInstances: result.allInstances, from: handler)
  let foreground = CIImage(cgImage: cell)
  let composed = foreground.applyingFilter("CIBlendWithMask", parameters: [kCIInputBackgroundImageKey: CIImage(color: .clear).cropped(to: foreground.extent), kCIInputMaskImageKey: CIImage(cvPixelBuffer: mask)])
  let cutout = context.createCGImage(composed, from: foreground.extent)!
  let bitmap = NSBitmapImageRep(cgImage: cutout)
  let pixels = bitmap.bitmapData!
  var bottom = 0
  for y in 0..<512 { for x in 0..<384 {
   if pixels[y * bitmap.bytesPerRow + x * bitmap.samplesPerPixel + 3] > 128 { bottom = max(bottom, y) }
  }}
  let shift = 508 - bottom
  output.saveGState()
  output.clip(to: CGRect(x: (i%4)*384, y: (1-i/4)*512, width: 384, height: 512))
  output.draw(cutout, in: CGRect(x: (i%4)*384, y: (1-i/4)*512 - shift, width: 384, height: 512))
  output.restoreGState()
  print("  frame \(i): baseline \(bottom), shift \(shift)")
 }
 let png = NSBitmapImageRep(cgImage: output.makeImage()!).representation(using: .png, properties: [:])!
 try png.write(to: outputDir.appendingPathComponent(url.deletingLastPathComponent().lastPathComponent + "-" + url.lastPathComponent))
 print("Extracted \(file)")
}
