import { Xz as XzMeta } from './meta';
// (submodule) from https://github.com/SortaCore/lzma2-js
import lzma from '../vendor/lzma2-js/lzma2_worker';


class Xz extends XzMeta {

    decompressBlock(block: number | Xz.Block = 0) {
        if (typeof block === 'number')
            block = this.block(block);

        let header = new Uint8Array(9);
        header[0] = block.header.dictSzByte;
        header.fill(255, 1);
        return lzma.LZMA.lzma2_decompress(concat(header, block.data));
    }

}

namespace Xz {
    export import Block = XzMeta.Block;
    export import BlockRecord = XzMeta.BlockRecord;
}

function concat(...arrays: Uint8Array[]) {
    return new Uint8Array([].concat(...(arrays.map(a => [...a]))));
}


export { Xz, XzMeta }
export default Xz