// build with
// parcel watch --hmr-hostname=localhost --public-url '.' src/index.html &
import $ from 'jquery';
import { Terminal } from 'xterm';

import { Shell, TtyShell } from './shell';



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

async function uploadFiles(shell: Shell, files: {[filename: string]: string | Uint8Array | Resource}) {
    let start = +new Date;
    for (let kv of Object.entries(files)) {
        let [filename, content] = kv;
        if (content instanceof Resource)
            content = await content.fetch();
        await shell.uploadFile(filename, content);
        console.log(`%cwrote ${filename} (+${+new Date - start}ms)`, 'color: #99c');
    }
}


function main() {
    $(async () => {
        var term = new Terminal({cols: 60, rows: 19, allowTransparency: true,
        theme: {background: 'rgba(0,0,0,0.1)'}});
        term.setOption("convertEol", true)
        term.open(document.getElementById('terminal'));
        term.write(`\nStarting \x1B[1;3;31mdash\x1B[0m \n\n`)
        term.focus();

        var shell = new TtyShell();
        shell.attach(term);

        var files = {
            '/bin/fm':             '#!/bin/fileman.wasm',
            '/bin/ocamlrun':       '#!/bin/ocamlrun.wasm',
            '/bin/ocaml':          '#!/bin/ocamlrun.wasm /bin/ocaml.byte',
            '/bin/ocamlc':         '#!/bin/ocamlrun.wasm /bin/ocamlc.byte',
            '/home/camlheader':    '#!/bin/ocamlrun',
            '/bin/ocaml.byte':     new Resource('/bin/ocaml.byte'),
            '/bin/ocamlc.byte':    new Resource('/bin/ocamlc.byte'),
            '/home/stdlib.cmi':    new Resource('/bin/ocaml/stdlib.cmi'),
            '/home/stdlib.cma':    new Resource('/bin/ocaml/stdlib.cma'),
            '/home/std_exit.cmo':  new Resource('/bin/ocaml/std_exit.cmo'),
            '/home/a.ml':          'let _ = print_int @@ 4 + 5;\nprint_string "\n"\n'
        };
        
        shell.start();

        uploadFiles(shell, files);

        Object.assign(window, {term, shell, dash: shell.mainProcess});
    });
}

Object.assign(window, {main});
