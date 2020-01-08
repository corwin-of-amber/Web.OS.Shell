import { EventEmitter } from 'events';
import { Terminal } from 'xterm';

import { Process } from 'wasi-kernel/src/kernel';
import { WorkerPool, ProcessLoader } from 'wasi-kernel/src/kernel/services/worker-pool';

import { Pty } from './pty';
import path from 'path';



class Shell extends EventEmitter implements ProcessLoader {

    workerScript: string
    mainProcess: Process
    fgProcesses: Process[]
    pool: WorkerPool
    env: {[name: string]: string}
    files: {[fn: string]: string | Uint8Array}

    constructor() {
        super();
        this.workerScript = getWorkerUrl();
        this.fgProcesses = [];
        this.pool = new WorkerPool(this.workerScript);
        this.pool.loader = this;
        this.pool.on('worker:data', (_, x) => this.emit('data', x));
        this.env = {TERM: 'xterm-256color'};
        this.files = {
            '/bin/dash':    '#!/bin/dash.wasm',
            '/bin/ls':      '#!/bin/ls.wasm',
            '/bin/touch':   '#!/bin/touch.wasm'
        };
    }

    start() {
        this.mainProcess = this.spawn('/bin/dash', ['dash', '-E'], this.env).process;
    }

    spawn(prog: string, argv: string[], env?: {[name: string]: string}) {
        if (!path.isAbsolute(prog) && env.CWD)
            prog = path.join(env.CWD, prog);

        var wasm: string, file = this.files[prog];
        if (typeof file == 'string' && file.startsWith('#!')) {
            let iargs = file.substring(2).split(/\s+/);
            wasm = iargs[0];
            argv = [argv[0], ...iargs.slice(1), ...argv.slice(1)];
        }
        else
            wasm = prog;

        var p = this.pool.spawn(wasm, argv, env);
        this.fgProcesses.unshift(p.process);

        this.populate(p.process);

        p.promise
            .then((ev: {code:number}) => console.log(`${name} - exit ${ev.code}`))
            .catch((e: Error) => console.error(`${name} - error;`, e))
            .finally(() => this.fgProcesses[0] === p.process 
                            && this.fgProcesses.shift());

        return p;
    }

    populate(p: Process) {
        if (!(<any>p)._populated) {
            (<any>p)._populated = true;
            (<any>p).worker.postMessage({upload: this.files});
            p.on('syscall', ev => {
                if (ev.func === 'ioctl:tty' && ev.data.fd === 0)
                    this.emit('term-ctrl', ev.data.flags);
            });
        }
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



export {Shell, TtyShell}