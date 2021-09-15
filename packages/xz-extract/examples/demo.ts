import fs from 'fs';
import Xz from '..';


var xz = new Xz(fs.readFileSync('/tmp/index.ts.xz'));

console.log(xz.decompressBlock());