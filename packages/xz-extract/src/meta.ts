/** 
 * Based on:
 *  + https://tukaani.org/xz/xz-file-format-1.0.4.txt
 *  + https://github.com/Rogdham/python-xz/tree/master/src/xz
 */
import assert from 'assert';
import struct from 'python-struct';


class Xz {
    stream: Uint8Array

    constructor(stream: Uint8Array) {
        this.stream = stream;
    }

    get footer() {
        var [crc, bwSz, _, check, magic] =
            struct.unpack("<LIBB2s", Buffer.from(this.stream.slice(-12)));
        if (magic != Xz.FOOTER_MAGIC)
            throw new Error(`invalid footer magic bytes (expected '${Xz.FOOTER_MAGIC}')`);
        return {bwSz: (<number>bwSz + 1) * 4, check};
    }

    get index() {
        var buf = this.stream.slice(-12 - this.footer.bwSz),
            [crc] = struct.unpack("<L", Buffer.from(buf.slice(-4))),
            mbis = decodeMbis(buf.slice(1, -4)),
            blocks = [] as Xz.BlockRecord[], [nblocks, _] = iget(mbis);
        for (let i = 0; i < nblocks; i++) {
            let [unpaddedSz] = iget(mbis), [uncompressedSz] = iget(mbis);
            blocks.push({unpaddedSz, uncompressedSz});
        }
        return {crc, mbis, blocks};
    }

    block(idx: number = 0): Xz.Block {
        // @todo
        if (this.index.blocks.length > 1) throw new Error('not implemented: |blocks| > 1');

        var end = -12 - this.footer.bwSz,
            record = this.index.blocks[idx];
        if (!record) throw new Error(`no such block: ${idx}`);

        var raw = this.stream.slice(end - align4(record.unpaddedSz), end),
            headerSz = (raw[0] + 1) * 4,
            header = raw.slice(0, headerSz),
            nFilters = header[1] + 1;

        if (nFilters != 1 && header[2] !== 0x21 /* lzma2 */)
            throw new Error('not implemented: only single lzma2 filter supported');

        assert(header[3] == 1); /* size of lzma2 filter field */
        var dictSzByte = header[4];

        return {header: {dictSzByte}, data: raw.slice(headerSz)};
    }

    static FOOTER_MAGIC = 'YZ';
}

namespace Xz {
    export type BlockRecord = {unpaddedSz: number, uncompressedSz: number};
    export type Block = {header: {dictSzByte: number}, data: Uint8Array};
}

/* -- Auxiliary functions -- */

function decodeMbi(buf: Uint8Array) {
    var i = 0, v = 0;
    for (let b of buf) {
        v |= (b & 0x7f) << (i * 7);  // little-endian
        i++;
        if ((b & 0x80) === 0) return [v, i];
    }
    throw new Error("invalid mbi");
}

function* decodeMbis(buf: Uint8Array) {
    while (buf.length) {
        var [v, sz] = decodeMbi(buf);
        yield [v, sz];
        buf = buf.slice(sz);
    }
}

function align4(sz: number) {
    var rem = sz % 4;
    return rem ? sz - rem + 4 : sz;
}

function iget<T>(gen: Generator<T, void>) {
    var n = gen.next();
    if (n.done) throw new Error("stream ended prematurely");
    return n.value as T;
}


export { Xz }
export default Xz