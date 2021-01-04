/***
 * @module workers.js
 * This modules provides high-level complex methods and declarations specific to applications
 * where workers are characterized as generally having dependencies, multiple actions, or logic.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const workers = require('./workers');
 * 
 * TBD...
 *      JSDOCS
 *      scribe save transcript
 */





///*************************************************************
/// Dependencies...
const cfg = require(process.argv[2] || '../restricted/config').workers || {};   // workers configuration
const frmt = require('util').format;
const fsp = require('fs').promises;
const path = require('path');
const qs = require('querystring');
const https = require('https');
const { asBytes, asList, asStyle, base64:x64, hmac, jxTo, pad, pluralize, uniqueID } = require('./helpers');
const bcrypt = require('bcryptjs');
const helpers = require('./helpers');


///*************************************************************
/// worker definitions...
var workers = {};   // container variable
var unsupported = async ()=>{ throw(501); };


///*************************************************************
/// Process error handling for graceful exit...
let cleanup = {
    callback: (code)=>scribe.write('','flush',[`Graceful exit[${code}]...`]), // default callback
    delay: 400,  
  };
let cleanupCalled = false;  // flag to prevent circular calls.
let gracefulExit = function (code=1) { // graceful exit call...
      if (!cleanupCalled) {
        cleanupCalled = true;
        cleanup.callback(code);  // do app specific cleaning once before exiting
        setTimeout(process.exit,cleanup.delay,code);  // no stopping!
      };
    };
  
  // catch clean exit ...
  process.on('beforeExit', function (code) { gracefulExit(code); });
  
  // catch forced exit ...
  process.on('exit', function (code) { gracefulExit(code); });
  
  // catch ctrl+c event and exit gracefully
  process.on('SIGINT', function () { gracefulExit(2); });
  
  //catch uncaught exceptions, trace, then exit gracefully...
  process.on('uncaughtException', function(e) { console.log('Uncaught Exception...\n',e.stack||e); gracefulExit(99); });

/**
 * @function cleanupProcess manages process exit operations for graceful exit; optional call for override
 * @param {} options - object for override of cleanup defaults
 * @param {function} [options.callback] - callback called on gracefull exit
 * @param {number} [options.delay] - callback called on gracefull exit
 * @return internal cleanup object for confirmation
 */
workers.cleanupProcess = (options={}) => { cleanup.mergekeys(options); return cleanup; };


///*************************************************************
/// Authentication code routines...

/**
 * @class auth provides routines to generate and check authentication codes and passwords
 * @function codeCheck validates a challenge code and returns a true/false result
 * @param {string} challengeCode - code to be tested
 * @param {object} credentials - object with validation parameters: code, iat, expiration
 * @returns {boolean} - validation check state: true = valid code
 * @function checkPW validates a password against a hash
 * @param {string} pw - clear text password being tested
 * @param {object} hash - valid password bcrypt hash
 * @returns {boolean} - validation check state: true = valid password
 * @function createPW encrypts a password for storing
 * @param {string} pw - clear text password being encrypted
 * @returns {string} - encrypted password
 * @function genCode returns a unique code formatted per given parameters
 * @param {number} size - length of result, default 7
 * @param {number} base - modulo of the result: 10, 16, 36, default 10
 * @param {number} exp - expiration time in minutes, default 10
 * @return {object} - code object containing code, iat, and exp
 * @function getActivationCode returns an activation code formatted per configuration
 * @function getLoginCode returns an activation code formatted per configuration
 */
workers.auth = {
    checkCode: (challengeCode,passcode) => {
        if (!passcode) return false;
        let expires = new Date((passcode.iat+passcode.exp)*1000);
        if (expires<new Date()) return false;
        return challengeCode===passcode.code; },
    checkPW: async (pw,hash) => await bcrypt.compare(pw,hash),
    createPW: async (pw) => await bcrypt.hash(pw,11),
    genCode: (size=7,base=10,exp=10) => ({code: uniqueID(size,base), iat: new Date().valueOf()/1000|0, exp: exp*60}),
    getActivationCode: function() { let { size, base, expiration } = (cfg.auth||{}).activation||{}; 
        return this.genCode(size, base, expiration); },
    getLoginCode: function() { let { size, base, expiration } = (cfg.auth||{}).login||{};
        return this.genCode(size, base, expiration); }
};


///*************************************************************
/// HTTP Error Messaging Service...
const httpCodes = {
    '200': "OK",                        // success messages
    '201': "Created",
    '202': "Accepted",
    '304': "Not Modified",              // Redirection messages
    '400': "Bad Request",
    '401': "NOT Authorized!",           // client errors
    '403': "Forbidden",
    '404': "File NOT found!",
    '405': "Method Not Allowed",
    '413': "Payload Too Large",
    '500': "Internal Server Error",     // server errors
    '501': "Not Supported",
    '503': "Service U?navailable"
};
/**
 * @function httpStatusMsg implements unified (JSON) error message formating for http server responses
 * @param {string|number|object} error - input error code
 * @return {{}} - object suitable for delivery as JSON
 */
workers.httpStatusMsg = error => {
    const validCode = (c) => Object.keys(httpCodes).includes(String(c));
    if (typeof error == 'object') { // internal error or standard error with detail msg
        let ext = workers.httpStatusMsg((('code' in error) && validCode(error.code)) ? error.code : '500');
        ext.detail = ('msg' in error ) ? error.msg : error.toString();
        return ext;
    } else {    // some system responses or http error
        let c =  validCode(error) ? parseInt(error) : 500;
        let e = { error: c>399, code: c, msg: httpCodes[String(error)]||'UNKNOWN ERROR'};
        e.detail = e.msg=='UNKNOWN ERROR' ? String(error) : '';
        return e
    };
};


///*************************************************************
/// JSON Web Token handling...
let cfgJWT = ({}).mergekeys({expiration: 60*24, secret: uniqueID(64,16)}).mergekeys(cfg.auth?.jwt); // sets defaults
/**
 * @class jwt provides JSON Web Token (JWT) functions
 * @function create defines a new JWT
 * @param {object} data - token data
 * @param {string} secret - encryption secret key, defaults to configured value of 256-bit unique value at startup
 * @param {number} expiration - time in seconds until JWT expires
 * @returns {object} a new JWT
 * @function expired checks if a JWT has expired
 * @param {number} expiration - time in seconds until JWT expires
 * @returns {boolean} true if expired
 * @function extract checks if a JWT has expired
 * @param {object} jwt - JWT string
 * @returns {object} JWT fields: header, payload, signature
 * @function verify checks validity of a JWT
 * @param {object} data - token data, accepts jwt string or jwt object (fields)
 * @param {string} secret - encryption secret key, defaults to configured value of 256-bit unique value at startup
 * @returns {object} JWT payload if valid, null if invalid
 */
workers.jwt = {
    cfg: cfgJWT,    // configuration defaults used by worker
    create: (data,secret,expiration) => {
        // payload always includes 'initiated at' (iat) and expiration in minutes (exp), plus data
        let exp = expiration*60 || data.exp || cfgJWT.expiration*60;   // expiration in seconds
        let payload = Object.assign({ iat: new Date().valueOf()/1000|0, exp: exp},data);
        let encHeader = x64.j64u({alg: 'HS256',typ: 'JWT'});  // only support for HS256
        let encPayload = x64.j64u(payload);
        let signature = x64.b64u(hmac(encHeader+'.'+encPayload,secret||cfgJWT.secret));
        return [encHeader,encPayload,signature].join('.');
    },
    expired: (data,expiration) => {  // accepts jwt string or jwt object or payload object (fields),  true if expired
        let payload = typeof data == 'string' ? workers.jwt.extract(data).payload : 'payload' in data ? data.payload : data;
        let exp = expiration*60 || payload.exp || cfgJWT.expiration*60;   // expiration in seconds
        let expDate = new Date(1000*(payload.iat + exp));
        return expDate < new Date();    // exp < now
    },
    extract: (jwt) => {
        let fields = (jwt+"..").split('.',3);
        return { header: x64.u64j(fields[0]), payload: x64.u64j(fields[1]), signature: fields[2] };
    },
    verify: (data,secret) => {  // accepts jwt string or jwt object (fields);  true if valid
        let { payload, signature } = typeof data == 'string' ? workers.jwt.extract(data) : data;
        let check = workers.jwt.extract(workers.jwt.create(payload,secret||cfgJWT.secret));
        return (signature===check.signature) && !workers.jwt.expired(payload) ? payload : null;
    }
};


///*************************************************************
/// Directory/folder/file (i.e. files system objects, FSO) listing function
/**
 * @function safeStat safely stats a file system object without throwing an error (null)
 * @param {string} spec - folder or file to stat
 * @param {object} [lnks] - follwos links as files and directories if true, else as links (ignored)
 * @return {object} stats for the given file system object
 */
let safeStat = async (spec,lnks) => { try { return await (lnks?fsp.stat(spec):fsp.lstat(spec)) } catch(e) { return null; }; };
/**
 * @function listFolder recursively scans a directory folder and lists files and folders and their basic stats
 * @param {string} dir - folder to scan
 * @param {object} [options] - listing options
 * @info options include, location: prefix for listing location, default '/', flat: flat listing flag (files only when true),
 *  links: flag to follow links when true
 * @return {object} hierarchical or flat folder listing of files and subfolders contents and their details (i.e. stats)
 */
async function listFolder(dir, options={}) {
    let listing = [];
    let location = options.location===undefined ? '/' : options.location;
    let recursive = options.recursive===undefined ? true : !!options.recursive;
    try {
        let fsoListing = await fsp.readdir(dir);
        for (let f in fsoListing) {
            let name = fsoListing[f]
            let spec = path.resolve(dir,name);
            let stats = await safeStat(spec,options.links);
            let fso = !stats || stats.isSymbolicLink() ? null :
              { location: location+name, name: name, size:stats.size, time: stats.mtime, 
                type: stats.isFile()?'file':stats.isDirectory()?'dir':stats.isSymbolicLink()?'link':'unknown' };
            if (fso) {
                if (fso.type == 'dir' && !recursive) continue;
                if (fso.type == 'dir') {
                    fso.listing = await listFolder(spec,options.mergekeys({location: fso.location+'/', recursive: recursive}));
                    if (options.flat) { listing = [...listing, ...fso.listing]; continue; };
                };
                if (fso.type!=='unknown' || options.unknown) listing.push(fso);
            };
        };
        return listing;
    } catch (e) { return e; };
};
workers.safeStat = safeStat;
workers.listFolder = listFolder;


///*************************************************************
/// Email Messaging Service...
const mailRequest = (payload) =>({
    protocol: 'https:',
    hostname: 'api.sendgrid.com',
    method: 'POST',
    path: '/v3/mail/send',
    headers: {
        'Authorization': `Bearer ${cfg.sendgrid.key}`,
        'Content-type': 'application/json',
        'Content-Length': Buffer.from(payload).byteLength
    }
});
const mailSend = function(msg) {
    let payload = JSON.stringify(msg);
    let rqst = mailRequest(payload);
    return new Promise((resolve,reject)=>{
        let req = https.request(rqst,res=>{
            let body = '';
            res.on('data',d=>{body +=d});
            res.on('end', ()=>{ resolve({msg: res.statusMessage, id: res.headers['x-message-id'], status: res.statusCode}); });
        });
        req.on('error',(e)=>reject(e));
        req.end(payload);
    });
};


/**
 * @function mail sends a text message via Twilio, throws an error if Twilio module not installed
 * @param {object} msg - email message object containing addresses and body
 * @param {string} [msg.id] - optional ID for header
 * @param {boolean} [msg.time] - optional flag to timestamp message
 * @param {string} msg.to - address list, optionally msg.cc and msg.bcc as well, at least one must be defined
 * @param {string} [msg.from] - optional from address, defaults to configuration
 * @param {string} [msg.subject] - optional subject line, defaults to configuration
 * @param {string} [msg.hdr] - optional custom header, defining time or cfg.name will create default header
 * @param {string} msg.text - plain text message,
 * @param {string} [msg.html] - alternate email HTML formatted text message, 
 * @param {object} [msg.body] - email text message, as well as optional msg.text
 * @return {} - object containing a summary report and transcript of action TBD
 */
workers.mail = !cfg.sendgrid ? async ()=>{ throw 503; } : async function mail(msg) {
    // email service wrapper assumes msg provides valid 'addresses' and a 'body/text' 
    msg.id = msg.id || cfg.sendgrid.name || ''; // format optional header with id and/or time and other defaults...
    msg.timestamp = msg.time ? '['+new Date().toISOString()+']' : '';
    msg.hdr = msg.hdr || ((msg.id ? '@'+msg.id:'') + (msg.timestamp ? msg.timestamp:''));
    msg.content = [];
    msg.text = (msg.hdr ? msg.hdr+':\n':'') + (msg.text||msg.body||'');
    if (msg.text) msg.content.push({type: 'text/plain', value: msg.text});
    if (msg.html) msg.content.push({type: 'text/html', value: msg.html});
    if (msg.body && typeof msg.body=='object') msg.content.push(msg.body);
    if (!msg.content.length) msg.content.push({type: 'text/plain', value: cfg.sendgrid.text});
    if (!(msg.to+msg.cc+msg.bcc)) msg.to = cfg.sendgrid.to;
    msg.from = msg.from || cfg.sendgrid.from;
    msg.subject = msg.subject || cfg.sendgrid.subject;
    msg.summary = `MAIL[${msg.subject}] sent to: ${[msg.to,msg.cc,msg.bcc].filter(a=>a).join(',')}`;
    let data = {from: {email: msg.from}, subject: msg.subject, template_id: msg.templateID, content: msg.content,
        personalizations: [{ to: msg.to?asList(msg.to).map(a=>({email: a})):undefined, 
        cc: msg.cc?asList(msg.cc).map(a=>({email: a})):undefined, bcc: msg.bcc?asList(msg.bcc).map(a=>({email: a})):undefined
    }]};
    return (await mailSend(data)).mergekeys({report: {summary: msg.summary}});
};


///*************************************************************
/// mime-types lookup ...
let mimes = { // define most common mimeTypes, extend/override with configuration
    'bin': 'application/octet-stream',
    'csv': 'text/csv', 
    'gz': 'application/gzip',
    'gif': 'image/gif',
    'htm': 'text/html',
    'html': 'text/html',
    'ico': 'image/vnd.microsoft.icon',
    'jpg': 'image/jpeg', 
    'json': 'application/json', 
    'mpg': 'video/mpeg',
    'png': 'image/png', 
    'pdf': 'application/pdf', 
    'txt': 'text/plain',
    'xml': 'application/xml'
}.mergekeys(cfg.mimeDefs);
Object.keys(mimes).map(e=>mimes[mimes[e]]=e);   // add keys for applications for reverse lookup of extensions

/**
 * @function mimeType returns the mime-type for a given extension or vice versa
 * @param {string} mime - lookup key
 * @param {*} fallback - default lookup
 * @return {string} - mime-type for extension or extension for mime-type
 */
workers.mimeType = (mime) => mimes[mime.replace('.','')] || mimes['bin'];   // application/octet-stream fallback


///*************************************************************
/// scribe, i.e. application logger ...
// scribe singleton object (worker)...
var scribe = {
    tag: 'diy',
    mask: 'log',
    transcript: {
        file: 'diy.log',
        bsize: 10000,
        fsize: 100000
    },
    buffer: '',
    busy: false,
    label: 'DIY...  ',  // tag formatted for output
    level: 3,           // mask rank equivalent for defined mask cfg
    // note levels, styles, and text must track
    levels: ['dump', 'trace', 'debug', 'log', 'info', 'warn', 'error', 'fatal', 'note', 'flush'],
    rank: lvl => scribe.levels.indexOf(lvl),
    styles: [['gray','dim'], ['magenta','bold'], ['cyan','bold'], ['white'], ['green'], ['yellow','bold'], 
        ['red','bold'], ['bgRed','white','bold'], ['gray'], ['bgCyan','black']],
    text: ['DUMP ', 'TRACE', 'DEBUG', 'LOG  ', 'INFO ', 'WARN ', 'ERROR', 'FATAL', 'NOTE ', 'FLUSH'],
    toTranscript: function(text,flush) {
        scribe.buffer += text + (flush ? '\n\n' : '\n');    // extra linefeed for "page-break" when flushing
        if ((scribe.buffer.length>scribe.transcript.bsize) || flush) 
          scribe.saveTranscript().catch(e=>{ console.log(`Transcripting ERROR: ${e.message||e.toString()}`); });
    },
    saveTranscript: async function() {
        if (scribe.busy) return;       // already in process of saving transcript, just buffer new input
        scribe.busy = true;
        let tmp = scribe.buffer;
        scribe.buffer = '';
        let stat = {};
        try { stat = await fsp.stat(scribe.transcript.file); } catch(e) {};   // undefined if not found
        if ((stat.size+tmp.length)>scribe.transcript.fsize) {   // roll the transcript log on overflow
            let dx = new Date().style('stamp','local');
            let parts = path.parse(scribe.transcript.file);
            let bak = path.normalize(parts.dir + '/' + parts.name +'-' + dx + parts.ext);
            await fsp.rename(scribe.transcript.file,bak);     // rename log to backup
            scribe.write(scribe.label,'trace',[`Rolled log: ${bak} [${stat.size}]`]);
        };
        await fsp.writeFile(scribe.transcript.file,tmp,{encoding:'utf8',flag:'a'});   // write tmp buffer to transcript file
        scribe.busy=false;
    },
   write: function(label,level,args) {
        let stamp = new Date().style('iso','local');
        let rank = scribe.rank(level);
        let msg = frmt.apply(this,args);
        let prefix = [stamp,scribe.text[rank],label||scribe.label].join(' ') + ' ';
        let lines = frmt.apply(this,args).replace(/\n/g,'\n'+' '.repeat(prefix.length));  // break msg lines and add blank prefix
        if (rank >= scribe.level || level=='note') console.log(asStyle(scribe.styles[rank],prefix + lines));
        if (level!='note') scribe.toTranscript(prefix + msg.replace(/\n/g,'|'), level=='fatal'||level=='flush');
    }
};

// scribe instance object prototype
const scribePrototype = {
    maskLevel: function(mask) { 
        if (scribe.levels.includes(mask)) {
            scribe.mask = mask;
            scribe.level = scribe.rank(mask);
        };
        return scribe.mask;
    },
    dump: function(...args) { scribe.write(this.label,'dump',args) },   // always transcript (only), no console output
    trace: function(...args) { scribe.write(this.label,'trace',args) },
    debug: function(...args) { scribe.write(this.label,'debug',args) },
    log: function(...args) { scribe.write(this.label,'log',args) },
    info: function(...args) { scribe.write(this.label,'info',args) },
    warn: function(...args) { scribe.write(this.label,'warn',args) },
    error: function(...args) { scribe.write(this.label,'error',args) },
    fatal: function(...args) { scribe.write(this.label,'fatal',args); process.exit(100); },     // always halts program!
    note: function(...args) { scribe.write(this.label,'note',args) },   // always to console (only), no transcript output
    flush: function(...args) { scribe.write(this.label,'flush',args) }  // flush, always writes transcript to empty buffer
};

// IIFE to initialize scribe configuration...
// configurable options include tag (default), mask (level), transcript: { bsize (buffer size), file, fsize (file size)}
(() => {
    let { tag, mask, transcript } = cfg.scribe || {};
    scribe.tag = tag || scribe.tag;
    scribe.label = pad(scribe.tag.toUpperCase(),8);
    if (scribe.levels.includes(mask)) {
        scribe.mask = mask;
        scribe.level = scribe.rank(mask);
    };
    scribe.transcript.file = transcript.file || scribe.transcript.file;
    scribe.transcript.bsize = asBytes(transcript.bsize || scribe.transcript.bsize);
    scribe.transcript.fsize = asBytes(transcript.fsize || scribe.transcript.fsize);
})();

/**
 * @function scribe creates transcripting instances from scribe prototype
 * @param {string} tag - tag name reference for scribe output, (8 character max) 
 */
workers.Scribe = function Scribe(tag='') {
    return Object.create(scribePrototype).mergekeys({tag: tag, label: pad(tag.toUpperCase()||scribe.tag,8)});
};


///*************************************************************
/// SMS Text Messaging service...
const prefix = (n)=>n && String(n).replace(/^\+{0,1}1{0,1}/,'+1'); // phone number formatting helper to prefix numbers with +1
/**
 * @function sms sends a text message via Twilio, throws an error if Twilio module not installed
 * @param {{}} msg - message object containing numbers list and text
 * @param {[]} [msg.numbers] - optional list of numbers,array or comma delimited string, default to cfg.twilio.admin 
 * @param {string} msg.body - required message text, alternate msg.text
 * @return {{}} - object containing a summary report and queue of action
 */
const smsPrefix = (n)=>n && String(n).replace(/^\+{0,1}1{0,1}/,'+1'); // prefix phomne numbers with +1
const smsRequest = (payload) =>({
    protocol: 'https:',
    hostname: 'api.twilio.com',
    method: 'POST',
    path: '/2010-04-01/Accounts/'+cfg.twilio.accountSID+'/Messages.json',
    auth: cfg.twilio.accountSID+':'+cfg.twilio.authToken,
    headers: {
        'Content-type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.from(payload).byteLength
    }
});
const smsSend = function(msg) {
    let payload = qs.stringify(msg);
    let rqst = smsRequest(payload);
    return new Promise((resolve,reject)=>{
        let req = https.request(rqst,res=>{
            let body = '';
            res.on('data',d=>{body +=d});
            res.on('end', ()=>resolve(jxTo(body,{})));
        });
        req.on('error',(e)=>reject(e));
        req.end(payload);
    });
};
workers.sms = !cfg.twilio ? async ()=>{ throw 503; } : async function sms(msg) {
    // convert numbers to list, prefix, filter invalid and duplicates
    let contacts = (cfg.twilio.callbackContacts||{})[msg.contact];
    let numbers = asList(msg.numbers||contacts||cfg.twilio.admin).map(p=>smsPrefix(p)).filter((v,i,a)=>v && (a.indexOf(v)==i));
    const cb = msg.callback || cfg.twilio.callback || null; // optional server acknowledgement
    let queue = await Promise.all(numbers.map(n=>
        smsSend({To: n, From: cfg.twilio.number, Body: msg.body||msg.text, statusCallback:cb})
            .then(mr=>{ mr.summary = { id:mr.sid, msg:`Text message queued to: ${n} as ${mr.sid}` }; return mr; })
            .catch(e=>{ throw e })));
    let summaries = queue.map(q=>q.summary);
    return { report: { summary: `Text message queued for ${numbers.length} ${pluralize(numbers.length,'number')}`, 
        summaries: summaries }, queue: queue };
};

///*************************************************************
/// Internal statistics and analytics management...
let internals = {
    analytics: {},
    stats: {}
};
/**
 * @class InternalsHandler maintains internal server state data
 */
let InternalsHandler = {
    /**
     * @function set assigns a give value to a tag and key
     * @param {string} tag - first level identifier
     * @param {string} key - second level identifier; may be undefined to assign a whole branch
     * @param {*} value - data assigned to statistic
     * @return {*} - statistic value
     */
    set: (tag,key,value) => {
        this[tag] = (tag in this) ? this[tag] : {};  // verify existance of tag object or create
        if (key===undefined) { this[tag] = value; return this[tag]; };  // value may be an object (i.e. branch)
        this[tag][key] = value;
        return this[tag][key];
    },
    /**
     * @function get retrieves statistics data by tag and key
     * @param {string} [tag] - first level identifier; may be undefined to retrieve all data under
     * @param {string} [key] - second level identifier; may be undefined to retrieve a whole branch
     * @return {*} - data as stored, which may be undefined as specified
     */
    get: (tag,key) => {
        if (tag===undefined) return this;
        if (tag in this) {
            if (key===undefined) return this[tag];
            if (key in this[tag]) return this[tag][key];
        };
        return undefined;
    },
    /**
     * @function inc increments a statistic, or defines it if it does not exist
     * @param {string} tag - first level identifier; required
     * @param {string} key - second level identifier; required
     * @return {*} - updated data value
     */
    inc: (tag,key) => {
        let value = InternalsHandler.get(tag,key);
        InternalsHandler.set(tag,key, value ? value+1 : 1);
        return InternalsHandler.get(tag,key);
    },
    /**
     * @function refs retrieves a list of tags or keys
     * @param {string} [tag] - undefined retrieves all data tags; or all keys for a defined tag 
     * @return {[]} - list of tags or keys
     */
    refs: (tag) => (tag) ? Object.keys(this[tag]) : Object.keys(this),
    /**
     * @function clear a statistic specified by tag and key or a branch specified by tag
     * @param {string} [tag] - first level identifier; may be undefined to clear all object data
     * @param {string} [key] - second level identifier; may be undefined to clear a whole branch
     * @return {*} - undefined
     */
    clear: (tag,key) => tag ? (key ? delete this[tag][key] : delete this[tag]) : Object.keys(this).forEach(k=>delete this(k))
};

/**
 * @function statistics records and returns internal server statistics
 * @function analytics records and returns internal analytics data
 */
workers.statistics = InternalsHandler.mapByKey(v=>v.bind(internals.stats));
workers.analytics = InternalsHandler.mapByKey(v=>v.bind(internals.analytics));


module.exports = workers;
