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
            if (entry.dir)
                this.volume.mkdirpSync(fullpath);
            else
                waitFor.push(entry.async('uint8array').then((ui8a: Uint8Array) =>
                    this._installFile(fullpath, ui8a)
                ));
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



export { PackageManager, Resource, ResourceBundle }