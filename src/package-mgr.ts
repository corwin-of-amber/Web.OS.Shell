import { EventEmitter } from 'events';
import { Volume } from 'memfs/lib/volume';
import path from 'path';
import JSZip from 'jszip';
import { DEFLATE } from 'jszip/lib/compressions'
import { inflateRaw } from 'pako';
import { SharedVolume } from 'wasi-kernel';



class PackageManager extends EventEmitter {

    volume: Volume
    opts: {fastInflate: boolean}

    constructor(volume: Volume) {
        super();
        this.volume = volume;
        this.opts = {fastInflate: true};
    }

    async installFile(filename: string, content: string | Uint8Array | Resource) {
        var c = content instanceof Resource ? await content.fetch() : content;
        return this._installFile(filename, c);
    }

    async _installFile(filename: string, content: string | Uint8Array) {
        this.volume.mkdirpSync(path.dirname(filename));
        if (this.volume instanceof SharedVolume && content instanceof Uint8Array && content.length > (1 << 14))
            return this.volume.writeBlob(filename, content);
        else
            return this.volume.promises.writeFile(filename, content);
    }

    async installZip(rootdir: string, content: Resource, progress: (p: DownloadProgress) => void = () => {}) {
        var z = await JSZip.loadAsync(content.blob(progress)),
            waitFor = [];
        z.forEach((filename: string, entry: any /*ZipEntry*/) => {
            let fullpath = path.join(rootdir, filename);
            waitFor.push((async () => {
                if (this.isSymlink(entry.unixPermissions)) {
                    if (this.volume instanceof SharedVolume) {
                        let target = await entry.async('text');
                        this.volume.createSymlink(target, fullpath)
                    }
                    else
                        throw new Error("symlinks not supported in this medium");
                }
                else if (entry.dir)
                    this.volume.mkdirpSync(fullpath);
                else {
                    let ui8a = this.opts.fastInflate && entry._data.compression == DEFLATE
                         ? this._inflateFast(entry)
                         : await entry.async('uint8array');
                    await this._installFile(fullpath, ui8a)
                }
            })());
        });
        await Promise.all(waitFor);
    }

    _inflateFast(entry: any) {
        return inflateRaw(entry._data.compressedContent);
    }

    async install(bundle: ResourceBundle, verbose = true) {
        let start = +new Date;
        for (let kv of Object.entries(bundle)) {
            let [filename, content] = kv;

            this.emit('progress', {path: filename, content, done: false});

            if (!filename.endsWith('/')) {
                // install regular file
                await this.installFile(filename, content);
            }
            else {
                // install into a directory
                if (content instanceof Resource)
                    await this.installZip(filename, content, (p: DownloadProgress) =>
                        this.emit('progress', {path: filename, content, download: p, done: false}));
                else
                    this.volume.mkdirpSync(filename);
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');

            this.emit('progress', {path: filename, content, done: true});
        }
    }

    isSymlink(mode: number) {
        return (mode & S_IFMT) === S_IFLNK;
    }

}

type ResourceBundle = {[fn: string]: string | Uint8Array | Resource}

class Resource {
    uri: string

    constructor(uri: string) {
        this.uri = uri;
    }

    async arrayBuffer() {
        return (await fetch(this.uri)).arrayBuffer()
    }

    async blob(progress: (p: DownloadProgress) => void = () => {}) {
        var response = await fetch(this.uri),
            total = +response.headers.get('Content-Length'),
            r = response.body.getReader(), chunks = [], downloaded = 0;
        for(;;) {
            var {value, done} = await r.read();
            if (done) break;
            chunks.push(value);
            downloaded += value.length;
            progress({total, downloaded})
        }
        return new Blob(chunks);
    }

    async fetch() {
        return new Uint8Array(
            await this.arrayBuffer()
        );
    }
}

type DownloadProgress = { total: number, downloaded: number };


// - from fs.constants
const S_IFMT = 0o170000,
      S_IFLNK = 0o120000;



export { PackageManager, Resource, ResourceBundle }