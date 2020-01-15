import path from 'path';
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

    async install(bundle: ResourceBundle, verbose = true) {
        let start = +new Date;
        for (let kv of Object.entries(bundle)) {
            let [filename, content] = kv;
            await this.installFile(filename, content);
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

    async fetch() {
        return new Uint8Array(
            await (await fetch(this.uri)).arrayBuffer()
        );    
    }
}



export { PackageManager, Resource, ResourceBundle }