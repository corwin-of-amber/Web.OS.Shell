import { EventEmitter } from 'events';
import { Volume } from 'memfs/lib/volume';
import path from 'path';
import JSZip from 'jszip';
import { DEFLATE } from 'jszip/lib/compressions'
import { inflateRaw } from 'pako';
import tar from 'tar-stream';
import concat from 'concat-stream';
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

    installSymlink(filename: string, target: string) {
        if (this.volume instanceof SharedVolume) {
            this.volume.createSymlink(target, filename);
        }
        else
            throw new Error(`symlinks not supported in this medium (installing '${filename}')`);
    }

    async installZip(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? content.blob(progress) : content;
        var z = await JSZip.loadAsync(payload),
            waitFor = [];
        z.forEach((filename: string, entry: any /*ZipEntry*/) => {
            let fullpath = path.join(rootdir, filename);
            waitFor.push((async () => {
                if (this.isSymlink(entry.unixPermissions)) {
                    this.installSymlink(fullpath, await entry.async('text'));
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

    async installTar(rootdir: string, content: Resource | Blob, progress: (p: DownloadProgress) => void = () => {}) {
        var payload = (content instanceof Resource) ? await content.blob(progress) : content,
            ui8a = new Uint8Array(await payload.arrayBuffer());  /** @todo streaming? */
        let extract = tar.extract();
        extract.on('entry', (header, stream, next) => {
            let fullpath = `${rootdir}/${header.name}`, wait = false;

            switch (header.type) {
            case 'symlink':
                this.installSymlink(fullpath, header.linkname); break;
            case 'file':
                wait = true;  // do not continue until after install finishes
                stream.pipe(concat(async ui8a => {
                    await this.installFile(fullpath, ui8a);
                    next();
                }));
                break;
            case 'directory':
                this.volume.mkdirpSync(fullpath);
                break;
            default:
                console.warn(`Unrecognized tar entry '${fullpath}' of type '${header.type}'`);
            }
            if (!wait) stream.on('end', () => next());
            stream.resume();
        });
        
        return new Promise((resolve, reject) => {
            extract.on('finish', resolve);
            extract.on('error', reject);
            extract.end(ui8a);
        });
    }

    installArchive(rootdir: string, content: Resource, progress: (p: DownloadProgress) => void = () => {}) {
        if (content.uri.endsWith('.zip'))
            return this.installZip(rootdir, content, progress);
        else
            return this.installTar(rootdir, content, progress);
    }

    async install(bundle: ResourceBundle, verbose = true) {
        let start = +new Date;
        for (let kv of Object.entries(bundle)) {
            let [filename, content] = kv,
                uri = (content instanceof Resource) ? content.uri : null;

            this.emit('progress', {path: filename, uri, done: false});

            if (!filename.endsWith('/')) {
                // install regular file
                await this.installFile(filename, content);
            }
            else {
                // install into a directory
                if (content instanceof Resource)
                    await this.installArchive(filename, content, (p: DownloadProgress) =>
                        this.emit('progress', {path: filename, uri, download: p, done: false}));
                else
                    this.volume.mkdirpSync(filename);
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');

            this.emit('progress', {path: filename, uri, done: true});
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

    async prefetch(progress: (p: DownloadProgress) => void = () => {}) {
        return new ResourceBlob(await this.blob(progress), this.uri);
    }

}

class ResourceBlob extends Resource {
    _blob: Blob
    constructor(blob: Blob, uri: string = '') {
        super(uri);
        this._blob = blob;
    }
    async blob() { return this._blob; }
}

type DownloadProgress = { total: number, downloaded: number };


// - from fs.constants
const S_IFMT = 0o170000,
      S_IFLNK = 0o120000;



export { PackageManager, Resource, ResourceBlob, ResourceBundle, DownloadProgress }