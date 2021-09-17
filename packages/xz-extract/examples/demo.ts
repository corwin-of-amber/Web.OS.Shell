import fs from 'fs';
import Xz from '../src/index';


var xz = new Xz(fs.readFileSync('/tmp/demo-data.xz'));

console.log(xz.decompressBlock());