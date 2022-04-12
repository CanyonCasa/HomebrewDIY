/***
 * @module caching.js
 * This modules provides caching methods and declarations for apps.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const caching = require('./caching');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const fs = require('fs');
const { resolve } = require('path');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { asBytes, hmac, asList } = require('./helpers');
const { mimeType } = require('./workers');

///*************************************************************
/// declarations...
var caching = {};    // serverware middleware container    


///*************************************************************
/// cache entries class declaraction...
class CacheEntry {
    constructor(ref,def) {
        this.ref = ref;
    }
}

class FileEntry extends CacheEntry {
    constructor(ref,def={}) {
        super(ref);
        this.spec =def.spec || ref;
        this.url = def.url || this.spec;
        this.ext = path.extname(def.url||this.spec).replace('.','');
        this.size = def.size;
        this.time = new Date(def.time).style('http');
        this.mime = mimeType(this.ext);
        this.tag = hmac(this.spec+this.size+this.time);     // wrapped in double-quotes by definition
        this.contents = { raw: undefined, gzip: undefined };
    }

    content(compressed){
        let data = { compressed: compressed, contents: null, headers: {'content-type': this.mime}, size: this.size,
          streaming: this.contents.raw===undefined };
        if (data.streaming) {
            let creek = fs.createReadStream(this.spec);
            if (compressed) {
                data.headers.mergekeys({'content-encoding': 'gzip', etag: '"'+this.tag+'-gz"'});
                let zipper = zlib.createGzip();
                data.contents = creek.pipe(zipper);
            } else {
                data.contents = creek;
            };
        } else {
            data.compressed = compressed && !!this.contents.gzip;     // only if compressed data exists
            if (data.compressed) {
                data.headers.mergekeys({'content-encoding': 'gzip', etag: '"'+this.tag+'-gz"'});
                data.contents = this.contents.gzip;
            } else {
                data.headers.mergekeys({etag: '"'+this.tag+'"'});
                data.contents = this.contents.raw;
            };
            data.headers.mergekeys({'content-length': data.contents.byteLength});
        };
        return data;
    }

    etag(weak) { return (weak?'W/"':'"')+this.tag+'"'; }

    get modified() { return this.time; }

    async load(store,compress) {
        function zip(raw) { return new Promise((resolve,reject)=>{zlib.gzip(raw,(e,buf)=>{resolve(buf||e);})}); };
        this.contents.raw = store ? await fsp.readFile(this.spec) : undefined;
        this.contents.gzip = (store&&compress) ? await zip(this.contents.raw) : undefined;
    }

    hasTagMatch = function(tags) { return tags.split(',').map(t=>t.trim()).filter(t=>t.includes(this.tag))[0] };

    matches(entry) { return this.etag() == entry.etag(); };

}

class Cache {
    constructor(options={}) {
        this.cache = {};
        this.max = asBytes(options.max || '100K');  // max contents size
        this.limit = asBytes(options.limit || 0);   // limit on number of files cached
     }

    addEntry(...args) {     // accepts a CacheEntry or a ref and def for and entry
        if (args[0] instanceof CacheEntry) {
            return this.cache[args[0].ref] = args[0];
        } else {
            return this.cache[args[0]] = this.cache.createEntry(args[1]);
        };
    }
    
    deleteEntry(ref) { return delete this.cache[ref]; }

    getEntry(ref) { return this.cache[ref] || null }

}

caching.CacheEntry = CacheEntry;
caching.FileEntry = FileEntry;
caching.Cache = Cache;

module.exports = caching;
