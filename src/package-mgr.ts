import path from 'path';
import JSZip from 'jszip';
import { SharedVolume } from "wasi-kernel/src/kernel";



class PackageManager {

    volume: SharedVolume

    constructor(volume: SharedVolume) {
        this.volume = volume;
    }

    async installFile(filename: string, content: string | Uint8Array | Resource) {
        var c = content instanceof Resource ? await content.fetch() : content;
        return this._installFile(filename, c);
    }

    async _installFile(filename: string, content: string | Uint8Array) {
        this.volume.mkdirpSync(path.dirname(filename));
        if (content instanceof Uint8Array && content.length > (1 << 14))
            return this.volume.writeBlob(filename, content);
        else
            return this.volume.promises.writeFile(filename, content);
    }

    async installZip(rootdir: string, content: Resource) {
        var z = await JSZip.loadAsync(content.arrayBuffer()),
            waitFor = [];
        z.forEach((filename: string, entry: any /*ZipEntry*/) => {
            let fullpath = path.join(rootdir, filename);
            waitFor.push((async () => {
                if (this.isSymlink(entry.unixPermissions)) {
                    let target = await entry.async('text');
                    this.volume.createSymlink(target, fullpath)
                }
                else if (entry.dir)
                    this.volume.mkdirpSync(fullpath);
                else {
                    let ui8a = await entry.async('uint8array');
                    this._installFile(fullpath, ui8a)
                }
            })());
        });
        await Promise.all(waitFor);
    }

    async install(bundle: ResourceBundle, verbose = true) {
        let start = +new Date;
        for (let kv of Object.entries(bundle)) {
            let [filename, content] = kv;
            if (!filename.endsWith('/')) {
                // install regular file
                await this.installFile(filename, content);
            }
            else {
                // install into a directory
                if (content instanceof Resource)
                    await this.installZip(filename, content);
                else
                    this.volume.mkdirpSync(filename);
            }
            if (verbose)
                console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');
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

    async fetch() {
        return new Uint8Array(
            await this.arrayBuffer()
        );    
    }
}


// - from fs.constants
const S_IFMT = 0o170000,
      S_IFLNK = 0o120000;



export { PackageManager, Resource, ResourceBundle }