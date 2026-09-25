// Moves the weights of an ONNX model out of the .onnx file into external data chunks
// (model.onnx_data, model.onnx_data_1, …), the layout Transformers.js loads with
// config.json → transformers.js_config.use_external_data_format = { "model.onnx": <chunks> }.
//
// Why: a model whose weights are inside one large .onnx file (Qwen3-1.7B q4f16: 1.4 GB) must be
// copied whole into the browser's WebAssembly memory to create a session, and runs out of memory;
// with external data it loads. The weights are byte-for-byte the same.
//
// The ONNX file is a protobuf; only three messages matter and are edited in place, the rest is
// copied as it is:
//   ModelProto.graph (7) → GraphProto.initializer (5) → TensorProto:
//     raw_data (9) is written to a chunk and replaced by external_data (13: location, offset,
//     length) and data_location (14) = EXTERNAL (1).
import { closeSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs'
import { join } from 'node:path'

const MIN_EXTERNAL = 1024 // smaller tensors stay in the model file (as onnx.save does)
const ALIGN = 64 // offsets aligned so the runtime can map tensors directly

function readVarint(buf, pos) {
  let result = 0n
  let shift = 0n
  for (;;) {
    const byte = buf[pos++]
    result |= BigInt(byte & 0x7f) << shift
    if (byte < 0x80) return [result, pos]
    shift += 7n
  }
}

function varint(value) {
  let v = BigInt(value)
  const out = []
  do {
    let byte = Number(v & 0x7fn)
    v >>= 7n
    if (v > 0n) byte |= 0x80
    out.push(byte)
  } while (v > 0n)
  return Buffer.from(out)
}

/** The fields of a protobuf message: number, wire type, value range and the whole field's range. */
function fields(buf, start = 0, end = buf.length) {
  const out = []
  let pos = start
  while (pos < end) {
    const from = pos
    const [tag, afterTag] = readVarint(buf, pos)
    const field = Number(tag >> 3n)
    const wire = Number(tag & 7n)
    pos = afterTag
    let valueStart = pos
    if (wire === 0) [, pos] = readVarint(buf, pos)
    else if (wire === 1) pos += 8
    else if (wire === 5) pos += 4
    else if (wire === 2) {
      const [len, afterLen] = readVarint(buf, pos)
      valueStart = afterLen
      pos = afterLen + Number(len)
    } else throw new Error(`unsupported protobuf wire type ${wire}`)
    out.push({ field, wire, from, valueStart, to: pos })
  }
  return out
}

const lengthDelimited = (field, bytes) => Buffer.concat([varint((field << 3) | 2), varint(bytes.length), bytes])
const stringField = (field, text) => lengthDelimited(field, Buffer.from(text, 'utf8'))

/**
 * Splits `dir/name` (e.g. onnx/model_q4f16.onnx) into `name` without weights plus chunks of at most
 * `chunkBytes` (a single larger tensor gets a chunk of its own). Returns the chunk file names.
 */
export function splitOnnx(dir, name, chunkBytes) {
  const buf = readFileSync(join(dir, name))
  const chunks = []
  let fd = null
  let offset = 0
  const openChunk = () => {
    if (fd !== null) closeSync(fd)
    const file = `${name}_data${chunks.length ? `_${chunks.length}` : ''}`
    chunks.push(file)
    fd = openSync(join(dir, file), 'w')
    offset = 0
  }
  openChunk()

  const tensor = (start, end) => {
    const fs = fields(buf, start, end)
    const raw = fs.find((f) => f.field === 9 && f.wire === 2)
    // data_location (14) = EXTERNAL (1): already outside (an explicit DEFAULT (0) is not).
    const external = fs.some((f) => f.field === 14 && readVarint(buf, f.valueStart)[0] === 1n)
    if (!raw || external || raw.to - raw.valueStart < MIN_EXTERNAL) return buf.subarray(start, end)
    const data = buf.subarray(raw.valueStart, raw.to)
    if (offset && offset + data.length > chunkBytes) openChunk()
    const pad = (ALIGN - (offset % ALIGN)) % ALIGN
    if (pad) {
      writeSync(fd, Buffer.alloc(pad))
      offset += pad
    }
    writeSync(fd, data)
    const entry = (key, value) => lengthDelimited(13, Buffer.concat([stringField(1, key), stringField(2, String(value))]))
    const parts = fs.filter((f) => f.field !== 9 && f.field !== 13 && f.field !== 14).map((f) => buf.subarray(f.from, f.to))
    parts.push(entry('location', chunks.at(-1)), entry('offset', offset), entry('length', data.length), Buffer.concat([varint((14 << 3) | 0), varint(1)]))
    offset += data.length
    return Buffer.concat(parts)
  }

  const graph = (start, end) =>
    Buffer.concat(fields(buf, start, end).map((f) => (f.field === 5 && f.wire === 2 ? lengthDelimited(5, tensor(f.valueStart, f.to)) : buf.subarray(f.from, f.to))))

  const model = Buffer.concat(fields(buf).map((f) => (f.field === 7 && f.wire === 2 ? lengthDelimited(7, graph(f.valueStart, f.to)) : buf.subarray(f.from, f.to))))
  closeSync(fd)
  writeFileSync(join(dir, name), model)
  return chunks
}
