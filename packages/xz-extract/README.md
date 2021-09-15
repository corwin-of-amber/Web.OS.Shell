# xz-extract

Allows to extract data from `.xz` archives.
The `.xz` format is a generic container for compressed data streams,
but its prevalent use is for storing LZMA2 outputs, esp. `tar` streams
compressed with that algorithm.

`xz-extract` strips the metadata headers around the compressed stream,
and utilizes [LZMA2-JS](https://github.com/SortaCore/lzma2-js), a pure
JavaScript implementation of LZMA2.
(Notice that [LZMA-JS](https://github.com/LZMA-JS/LZMA-JS), a popular LZMA
implementation, does not handle LZMA2 encoding.)

## Usage

```
import fs from 'fs';
import { Xz } from 'xz-extract';

var xz = new Xz(fs.readFileSync('some-data.xz'));
xz.block();  // gets the raw data
xz.decompressBlock();
```