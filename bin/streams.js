/***
 * @module streams.js
 * This modules provides extensions to Node streams.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const streams = require('./streams');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const fs = require('fs');
const stream = require('stream');

let streams = {};


///*************************************************************
/// Line oriented processor...
const NL = /\r\n|\n|\r/;  // DOS, Mac, Linux line terminations, order matters!
/**
 * @function lineByLine parses a stream into lines for processing, pipe between source and line processing
 * @param {string} newline terminating newline character(s), default '', e.g. '\r\n'
 * @info following by a non-objectmode stream strips empty lines if newline is not defined
 * @return {object} transform stream
 */
streams.lineByLine = function lineByLine(newline='') {
    return new stream.Transform({
        objectMode: true,
        transform(chunk, encoding, done) {
            let lines = ((this._lastLine||'') + chunk.toString()).split(NL);    // any previous residual + new data, split into lines
            this._lastLine = lines.splice(-1,1)[0];                             // potential partial line, save for next chunk
            lines.forEach(line=>this.push(line+newline));                       // push each line to the output
            done();
        },
        flush(done) {
            if (this._lastLine) this.push(this._lastLine);                      // flush any remainging line if not terminated
            this._lastLine = '';                                                // empty line in case stream resumes?
            done();                                                             // signal finished with stream
        }
    });
};


///*************************************************************
/// Stream byte counter...
/**
 * @function countBytes wrapper function to count bytes processed by stream
 * @param {string} countVar name of instance varaiable to use for counting, default bytes
 */
streams.countBytes = function countBytes(countVar='bytes') {
    let countProcessedBytes = new stream.Transform();
    countProcessedBytes[countVar]=0;
    countProcessedBytes._transform = function (chunk, encoding, done) {
        this[countVar] += chunk.length;
        this.push(chunk);
        done();
    };
    return countProcessedBytes;
};


///*************************************************************
/// Stream sniffer function...
/**
 * @function sniff wrapper function to sniff stream contents (without modifying stream)
 * @param {function} tCallback name of (sync) transform callback, optional, default nop
 * @param {function} fCallback name of (sync) flush callback, optional, default nop
 * @return {object} tranform stream
 */
streams.sniff = function sniff(tCallback,fCallback,objectMode=false) {
    let passthrough = new stream.Transform({
        objectMode: !!objectMode,
        transform(chunk, encoding, done) {
            if (tCallback) tCallback(Buffer.from(chunk, encoding));
            this.push(chunk);
            done();
        },
        flush(done) { 
            if (fCallback) fCallback(); 
            done();
        }
    });
    return passthrough;
};


///*************************************************************
/// Stream transformer function...
/**
 * @function xform wrapper function to perform inline stream editing
 * @param {function} tCallback name of (async) transform callback, optional, default nop
 * @param {function} fCallback name of (async) flush callback, optional, default nop
 * @return {object} tranform stream
 */
streams.xform = function xform(tCallback,fCallback=async ()=>{},objectMode=false) {
    let xformer = new stream.Transform({
        //objectMode: objectMode,
        readableObjectMode: objectMode,
        writeableObjectMode: objectMode,
        transform(chunk, encoding, done) {
            if (tCallback) {
                (async function() {  return tCallback(Buffer.from(chunk, encoding)); })()
                    .then(x=>{ this.push(x); done(); }).catch(e=>{ this.push(chunk); done(); });
            } else {
               this.push(chunk);
               done();
            }
        },
        flush(done) { (async function() {return fCallback()})().then(done).catch(done); }
    });
    return xformer;
};


///*************************************************************
/// Stream debug line dump ...
streams.dump = function dump() {
    let line = 1;
    let log = new stream.Transform({ 
        objectMode: true,
        transform(chunk, encoding, done) {
            console.log(`${line++}: '${chunk.toString().trim()}'`);
            this.push(chunk);
            done();
        }
    });
    return log;
};


module.exports = streams;
