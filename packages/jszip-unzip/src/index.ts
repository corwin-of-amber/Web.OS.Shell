import fs from 'fs';
import path from 'path';
import mkdirp from 'mkdirp';
import JSZip, { JSZipObject } from 'jszip';



export type UnzipSource = string | ArrayBuffer | Uint8Array;

export type UnzipOptions = {
    to?: {fs?: typeof fs, directory?: string}
};


async function unzip(zipfile: UnzipSource, opts?: UnzipOptions | string) {
    var {to: {directory: odir, fs: ofs}} = options(opts),
        z = await JSZip.loadAsync(await open(zipfile)),
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

async function open(zipfile: UnzipSource) {
    if (typeof zipfile === 'string') {
        return fs.readFileSync ? fs.readFileSync(zipfile)
            : new Uint8Array(await (await fetch(zipfile)).arrayBuffer());
    }
    else if (zipfile instanceof ArrayBuffer) {
        return new Uint8Array(zipfile);
    }
    else return zipfile;
}

function options(opts?: UnzipOptions | string): UnzipOptions {
    if (opts) {
        if (typeof opts === 'string') {
            return {to: {directory: opts, fs}};
        }
        else if (opts.to) {
            if (typeof opts.to === 'string')
                return {to: {directory: opts.to, fs}};
            else
                return {to: {directory: opts.to.directory || '',
                             fs: opts.to.fs || fs}};
        }
    }
    return {to: {directory: '', fs}};
}



export default unzip;
