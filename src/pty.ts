import {EventEmitter} from 'events';



class Pty extends EventEmitter {

    mode: PtyMode
    lnbuf: number[];

    constructor() {
        super();
        this.mode = PtyMode.COOKED;
        this.lnbuf = [];
    }

    termWrite(buf: Buffer | string) {
        if (typeof buf == 'string')
            buf = Buffer.from(buf, 'binary');

        switch (this.mode) {
        case PtyMode.COOKED:
            this.cookedLineEdit(buf); break;
        default:
            this.emit('term:data', buf);
        }
    }

    cookedLineEdit(data) {
        let write = (d) => this.emit('term:data', d),
            writeStr = (s) => write(Buffer.from(s)),
            writeUInt8 = (c) => write(Buffer.from([c]));

        for (let i = 0; i < data.length; ++i) {
            let c = data[i];
            switch (c) {
            case 0x04:
                this.emit('eof');
                break;
            case 0x7f: case 0x08:
                if (this.lnbuf.length > 0) {
                    var  ndel = this.lnbuf.pop() == 0x1B ? 2 : 1;
                    writeStr("\x08".repeat(ndel) + "\x1B[K"); 
                }
                break;
            case 0x0D:
                this.lnbuf.push(0x0A);
                this.cookedFlush();
                writeStr("\r\n"); break;
            case 0x1B:   // ^[, ESC
                this.lnbuf.push(c);
                writeStr("^["); break;
            case 0x15:   // ^U
                this.lnbuf = [];
                writeStr("\r\x1B[K"); break;
            default:
                this.lnbuf.push(c);
                writeUInt8(c);
            }
        }
    }

    cookedFlush() {
        if (this.lnbuf.length > 0) {
            this.emit('data', Buffer.from(this.lnbuf));
            this.lnbuf = [];
        }
    }
}

enum PtyMode { RAW, COOKED };



export {Pty}
