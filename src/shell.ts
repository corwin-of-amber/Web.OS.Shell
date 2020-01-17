import { EventEmitter } from 'events';
import { Terminal } from 'xterm';

import { Process, WorkerProcess } from 'wasi-kernel/src/kernel';
import { SharedVolume } from 'wasi-kernel/src/kernel/services/shared-fs';
import { WorkerPool, ProcessLoader, WorkerPoolItem } from 'wasi-kernel/src/kernel/services/worker-pool';

import { Pty } from './pty';
import path from 'path';
import { PackageManager } from './package-mgr';



class Shell extends EventEmitter implements ProcessLoader {

    workerScript: string
    mainProcess: Process
    fgProcesses: Process[]
    pool: WorkerPool
    env: {[name: string]: string}
    volume: SharedVolume
    packageManager: PackageManager
    files: {[fn: string]: string | Uint8Array}
    filesUploaded: boolean

    constructor() {
        super();
        this.workerScript = getWorkerUrl();
        this.fgProcesses = [];
        this.pool = new WorkerPool();
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
        this.env = {PATH: '/bin', TERM: 'xterm-256color'};
        this.volume = new SharedVolume({dev: {size: 1 << 26}});
        this.packageManager = new PackageManager(this.volume);
        this.files = {
            '/bin/dash':    '#!/bin/dash.wasm'
        };
        this.filesUploaded = false;
    }

    start() {
        this.mainProcess = this.spawn('/bin/dash', ['dash', '-E'], this.env).process;
    }

    spawn(prog: string, argv: string[], env?: {[name: string]: string}) {
        if (!path.isAbsolute(prog) && env.CWD)
            prog = path.join(env.CWD, prog);

        var wasm: string,
            file = this.files[prog] || this.volume.readFileSync(prog),
            interp = this.shebang(file);

        if (interp) {
            let iargs = interp.ln.split(/\s+/);
            if (interp.nl) iargs.push(prog);
            wasm = iargs[0];
            argv = [argv[0], ...iargs.slice(1), ...argv.slice(1)];
        }
        else
            wasm = prog;

        var p = this.pool.spawn(wasm, argv, env);
        this.fgProcesses.unshift(p.process);

        p.promise
            .then((ev: {code:number}) => console.log(`${name} - exit ${ev.code}`))
            .catch((e: Error) => console.error(`${name} - error;`, e))
            .finally(() => this.fgProcesses[0] === p.process 
                            && this.fgProcesses.shift());

        return p;
    }

    populate(p: WorkerPoolItem) {
        p.process.mountFs(this.volume);
        if (!this.filesUploaded) {
            p.process.worker.postMessage({upload: this.files});
            this.filesUploaded = true;
        }
        p.process.on('syscall', ev => {
            if (ev.func === 'ioctl:tty' && ev.data.fd === 0)
                this.emit('term-ctrl', ev.data.flags);
        });
    }

    shebang(script: string | Uint8Array) {
        var magic = "#!", idx: number, ln: string;
        if (typeof script == 'string') {
            if (script.startsWith(magic)) {
                idx = script.indexOf('\n');
                ln = (idx > -1) ? script.substring(2, idx)
                                : script.substring(2);
            }
        }
        else if (script instanceof Uint8Array) {
            if (script[0] == magic.charCodeAt(0) && script[1] == magic.charCodeAt(1)) {
                var idx = script.indexOf('\n'.charCodeAt(0));
                ln = Buffer.from((idx > -1) ? script.subarray(2, idx) 
                                            : script.subarray(2))
                      .toString('utf-8');
            }
        }
        return ln ? {ln, nl: idx > -1} : undefined;
    }

    write(data: string | Uint8Array) {
        if (typeof data === 'string')
            data = Buffer.from(data);
        var fgp = this.fgProcesses[0];
        if (fgp) fgp.stdin.write(data);
    }

    sendEof() {
        var fgp = this.fgProcesses[0];
        if (fgp) fgp.stdin.end();
    }
}


class TtyShell extends Shell {

    pty: Pty

    constructor() {
        super();
        this.pty = this.createPty();
    }

    createPty() {
        var pty = new Pty();
        pty.on('data', (x: Buffer) => this.write(x))
        pty.on('eof', () => this.sendEof());
        this.on('term-ctrl', (flags: number[]) => pty.setFlags(flags));
        return pty;
    }

    attach(term: Terminal) {
        term.setOption("convertEol", true)
        term.onData((x: string) => this.pty.termWrite(x));
        this.pty.on('term:data', (x: Buffer) => term.write(x));
        this.on('data', (x: Uint8Array) => term.write(x));
    }

}


/**
 * Note: Parcel updates the 'href' of links during build.
 */
function getWorkerUrl() : string {
    return (<any>document.head.querySelector('#wasi-worker')).href;
}



export {Shell, TtyShell }