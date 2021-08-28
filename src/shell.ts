import { EventEmitter } from 'events';
import { Terminal } from 'xterm';

import { Process } from 'wasi-kernel/src/kernel';
import { TtyProps } from 'wasi-kernel/src/kernel/bits/tty';
import { SharedVolume } from 'wasi-kernel/src/kernel/services/shared-fs';
import { WorkerPool, ProcessLoader, WorkerPoolItem, SpawnArgs } from 'wasi-kernel/src/kernel/services/worker-pool';

import { Pty } from './pty';
import path from 'path';
import { PackageManager } from './package-mgr';



class Shell extends EventEmitter implements ProcessLoader {

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
        this.fgProcesses = [];
        this.pool = new WorkerPool();
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
        this.env = {PATH: '/bin', HOME: '/home', TERM: 'xterm-256color'};
        this.volume = new SharedVolume({dev: {size: 1 << 27}});
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
        if (!path.isAbsolute(prog) && env.PWD)
            prog = path.join(env.PWD, prog);

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
            .then(<any>((ev: {code:number}) => console.log(`${prog} - exit ${ev.code}`)))
            .catch((e: Error) => console.error(`${prog} - error;`, e))
            .finally(() => this.fgProcesses[0] === p.process 
                            && this.fgProcesses.shift());

        return p;
    }

    populate(p: WorkerPoolItem, spawnArgs: SpawnArgs) {
        p.process.mountFs(this.volume);
        if (!this.filesUploaded) {
            p.process.worker.postMessage({upload: this.files});
            this.filesUploaded = true;
        }
        p.process.on('syscall', ev => {
            if (ev.func === 'ioctl:tty' && ev.data.fd === 0)
                this.emit('term-ctrl', ev.data.flags);
        });
        p.process.opts.proc = {funcTableSz: 16348}; // @todo get size from wasm somehow?
    }

    exec(p: WorkerPoolItem, spawnArgs: SpawnArgs) {
        if (spawnArgs.wasm.startsWith('/bin/ocaml')) {  // @todo this is OCaml-specific; just an experiemnt for now
            var preload = ['dllcamlstr', 'dllunix', 'dllthreads'].map(b => ({
                name: `${b}.so`, uri: `/bin/ocaml/${b}.wasm`
            }));
            
            p.process.worker.postMessage({dyld: {preload}});
        }

        this.pool.exec(p, spawnArgs);
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
        var fgp = this.fgProcesses[0];
        if (fgp) {
            if (typeof data === 'string')
                fgp.stdin.write(data);
            else
                fgp.stdin_raw.write(data);
        }
    }

    sendEof() {
        var fgp = this.fgProcesses[0];
        if (fgp) fgp.stdin.end();
    }
}


class TtyShell extends Shell {

    pty: Pty
    term: Terminal

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
        this.term = term;
        term.setOption("convertEol", true)
        term.onData((x: string) => this.pty.termWrite(x));
        this.pty.on('term:data', (x: Buffer) => term.write(x));
        this.on('data', (x: Uint8Array) => term.write(x));
    }

    populate(p: WorkerPoolItem, spawnArgs: {wasm: string, argv: string[], env?: {}}) {
        super.populate(p, spawnArgs);
        p.process.worker.addEventListener('message', (ev) => {
            if (ev.data.tty && this.term) {
                this.bindTermios(ev.data.tty);
            }
        });
    }

    bindTermios(tty: TtyProps) {
        var win = tty.termios.win;
        this._updateWindowSize(win);
        this.term.onResize((dim) => this._updateWindowSize(win, dim));
    }

    _updateWindowSize(win: Uint16Array,
                      dimensions: TerminalDimensions = this.term) {
        Atomics.store(win, 0, dimensions.rows);
        Atomics.store(win, 1, dimensions.cols);
    }

}


type TerminalDimensions = {cols: number, rows: number};



export { Shell, TtyShell }