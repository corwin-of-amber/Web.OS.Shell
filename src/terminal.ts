// build with
// parcel watch --hmr-hostname=localhost --public-url '.' src/index.html &
import { EventEmitter } from 'events';
import $ from 'jquery';
import { Terminal } from 'xterm';

import { Process } from 'wasi-kernel/src/kernel';
import { WorkerPool, ProcessLoader } from 'wasi-kernel/src/kernel/services/worker-pool';
import { SharedVolume } from 'wasi-kernel/src/kernel/services/shared-fs';

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
        this.mainProcess = this.spawn('/bin/dash', ['dash'], this.env).process;
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

        p.promise
            .then((ev: {code:number}) => console.log(`${name} - exit ${ev.code}`))
            .catch((e: Error) => console.error(`${name} - error;`, e))
            .finally(() => this.fgProcesses[0] === p.process 
                            && this.fgProcesses.shift());

        (<any>p.process).worker.postMessage({upload: this.files});

        return p;
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

/**
 * Note: Parcel updates the 'href' of links during build.
 */
function getWorkerUrl() : string {
    return (<any>document.head.querySelector('link[href^=worker]')).href;
}



$(() => {
    var term = new Terminal({cols: 60, rows: 19});
    term.setOption("convertEol", true)
    term.open(document.getElementById('terminal'));
    term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
    term.focus();

    var pty = new Pty;
    term.onData((x: string) => pty.termWrite(x));
    pty.on('term:data', (x: Buffer) => term.write(x));

    var shell = new Shell();
    pty.on('data', (x: Buffer) => shell.write(x))
    pty.on('eof', () => shell.sendEof());
    shell.on('data', (x: string) => term.write(x))
    Object.assign(shell.files, {
        '/home/e': require('fs').readFileSync('./bin/example.ml.bin'),
        '/bin/ocaml.byte': require('fs').readFileSync('./bin/ocaml'),
        '/home/stdlib.cmi': require('fs').readFileSync('./bin/ocaml_stdlib.cmi'),
        '/bin/ocamlrun': '#!/bin/ocamlrun.wasm',
        '/bin/ocaml':   '#!/bin/ocamlrun.wasm /bin/ocaml.byte'
    });
    shell.start();

    Object.assign(window, {term, pty, shell, dash: shell.mainProcess, SharedVolume});
});

Object.assign(window, {Shell});
