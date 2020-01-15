// build with
// parcel watch --hmr-hostname=localhost --public-url '.' src/index.html &
import $ from 'jquery';
import { Terminal } from 'xterm';

import { TtyShell } from './shell';
import { Resource, ResourceBundle } from './package-mgr';



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

        var baseSys = {
            '/bin/fm':             '#!/bin/fileman.wasm',
            '/bin/ocamlrun':       '#!/bin/ocamlrun.wasm',
            '/bin/ocaml':          '#!/bin/ocamlrun.wasm /bin/ocaml.byte',
            '/bin/ocamlc':         '#!/bin/ocamlrun.wasm /bin/ocamlc.byte',
            '/home/camlheader':    '#!/bin/ocamlrun.wasm\n',
            '/bin/ocaml.byte':     new Resource('/bin/ocaml.byte'),
            '/bin/ocamlc.byte':    new Resource('/bin/ocamlc.byte'),
            '/home/stdlib.cmi':    new Resource('/bin/ocaml/stdlib.cmi'),
            '/home/stdlib.cma':    new Resource('/bin/ocaml/stdlib.cma'),
            '/home/std_exit.cmo':  new Resource('/bin/ocaml/std_exit.cmo'),
            '/home/a.ml':          'let _ = print_int @@ 4 + 5;\nprint_string "\\n"\n'
        };
        
        // await fakeInstall(shell, baseSys);

        shell.start();

        shell.packageManager.install(baseSys);

        Object.assign(window, {term, shell, dash: shell.mainProcess});
    });
}

/**
 * Use this to install without sharing a volume.
 * (must finish before shell.start().)
 */
async function fakeInstall(shell: TtyShell, bundle: ResourceBundle) {
    for (let kv of Object.entries(bundle)) {
        let [fn, content] = kv;
        if (typeof content == 'string')
            shell.files[fn] = content;
        else if (content instanceof Resource)
            shell.files[fn] = await content.fetch();
    }
}



Object.assign(window, {main});
