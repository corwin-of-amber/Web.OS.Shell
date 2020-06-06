import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import JSZip, { JSZipObject } from 'jszip';



export type UnzipOptions = {
    to?: {fs?: typeof fs, directory?: string}
};

async function unzip(zipfile: Uint8Array, opts: UnzipOptions) {
    var z = await JSZip.loadAsync(zipfile),
        ofs  = (opts.to || {}).fs || fs,
        odir = typeof(opts.to) === 'string' ? opts.to
                   : (opts.to || {}).directory || '',
        promises = [];
    z.forEach((relativePath: string, entry: JSZipObject) => {
        promises.push((async () => {
            var outf = path.join(odir, relativePath);
            if (entry.dir) {
                mkdirp.sync(outf, {fs: ofs});
            }
            else {
                mkdirp.sync(path.dirname(outf), {fs: ofs});
                ofs.writeFileSync(outf,
                    await entry.async('uint8array'));
            }
        })());
    });
    await Promise.all(promises);
}



export default unzip;
