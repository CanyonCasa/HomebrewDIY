/***
 * @module serverware.js
 * This module provides server-related utility methods and declarations for apps.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const sw = require('./serverware');
//  */


///*************************************************************
/// Dependencies...
///*************************************************************
const url = require('url');
const fs = require('fs');
const qs = require('querystring');
const { asBytes, asList, base64, jxCopy, jxFromCircular, jxFrom, jxTo, resolveSafePath, uniqueID, verifyThat } = 
  require('./helpers');
const { auth, httpStatusMsg, jwt, logins, statistics, mimeType } = require('./workers');  
const pathMatch = require("path-to-regexp").match;
const { sniff } = require('./streams');


///*************************************************************
/// declarations...
var serverware = {};    // export variable


///*************************************************************
/// serverware context building constructs...
let ResponseContext = function ResponseContext(...args) {
    if (args.length==2) {   // specifies type and buffer, i.e. ('xml',<Buffer 3c 6f 6b 3e 3c 2f 6f 6b 3e>)
        this.contents = args[1];
        this.headers = { 'Content-type': mimeType(args[0]), 'Content-length': this.contents.bytelength };
    } else {
        Object.keys(args[0]).map(k=>this[k]=args[0][k]);  // assign object as ResponseObject
    };
};
serverware.ResponseContext = ResponseContext;

/**
 * @function createContext creates the server context instance
 * @return {object} context for request
 */ 
serverware.createContext = () => ({
    // prototype for creating request context ...
    // consider only state as mutatable property; otherwise assume read-only values
    request: null,          // request placeholder
    state: {},              // custom middleware state data, app specific
    authenticated: false,   // request authenticated
    authorize: ()=>false,   // default, overridden in context when user authenticated
    jwt: '',                // JSON web token
    user: {                 // validated user info, default, overridden in context when user authenticated
        member: '',         // default group membership
        username: ''        // default username
    },
    headers: function hdrs(obj={}) {    // headers function sets or get response headers (internally)
        hdrs._hdrs=hdrs._hdrs||{}; obj.mapByKey((v,k)=>hdrs._hdrs[k.toLowerCase()]=v); 
        return hdrs._hdrs.filterByKey(v=>v!==undefined);
    },
    routing: {              // current context routing data
        route: [],          // current route
        index: 0,           // current route index
    },
    next: null              // placeholder for next route call
});

/**
* @function parseAuthHeader parses the Authorization header into parts used downstream
* @param {string} header - the Authorization header
* @reutrn {object} header object on success or {} on failure
*/
let parseAuthHeader = async (header) => {
    if (!header) throw { code: 401, msg: `Malformed Authorization header: ${header}` };
    let hdr = { header: header, tokens: (header+" ").split(/\s+/,2) };
    [hdr.method, hdr.token] = [hdr.tokens[0].toLowerCase(), hdr.tokens[1]];
    if (hdr.method=='basic') {
        hdr.text = base64.d64(hdr.token);
        [hdr.username, hdr.pw] = (hdr.text+':').split(':',2);
    } else if (hdr.method=='bearer') {
        hdr.fields = jwt.extract(hdr.token);    // just parse header!
        hdr.username = (hdr.fields.payload||{}).username||'';
    } else {
        throw { code: 401, msg: `Authentication Method Not Supported!: ${header}` };
    };
    return hdr;
};

let urlParse = (url) => {
    let tmp = new URL(url);
    let query = {};
    let params = tmp.searchParams;
    for (let k of params.keys()) { query[k]= params.getAll(k).length<2 ? params.get(k) : params.getAll(k); };
    return { href: tmp.href, origin: tmp.origin, protocol: tmp.protocol, host: tmp.host, hostname: tmp.hostname,
        port: tmp.port || tmp.protocol=='https' ? 443 : 80, pathname: tmp.pathname, search: tmp.search, query: query };
};

/**
 * @function parseRequestHeaders build context request properties ...
 * @param {Object} req - http request object
 * @param {buffer} buf - res data buffer
 * @return - parsed request headers object
*/
let parseRequestProperties = (req) => {
    let [contentType, boundary] = (req.headers['content-type'] || 'text/*').split('; ');
    let debug = req.url.endsWith('!');
    let protocol = req.headers['x-forwarded-proto'] || 'http';
    let host = req.headers.host || req.headers['x-forwarded-host'] || '';
    let url = debug ? req.url.slice(0,-1) : req.url;
    let rx = {
        HEADERS: req.headers,
        remote: {
            ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress || "",
            port: req.socket.remotePort || null
        },
        method: req.method.toLowerCase(),
        contentType: contentType,
        boundary: boundary ? boundary.split('=')[1] : null,
        dataType: contentType=='application/json' ? 'json' : contentType=='application/x-www-form-urlencoded' ? 'urlenc' :
          contentType.startsWith('text/') ? 'text' : contentType=='multipart/form-data' ? 'formdata' : 
          contentType=='application/octet-stream' ? 'octet' : '',
        original: { host: host, href: `${protocol}://${host}${url}`, protocol: protocol, url: url }
    };
    rx.mergekeys(urlParse(rx.original.href));
    let verbChk = (v,m) => v==m || (v=='get'&&m=='head') || v=='any';
    return { debug: debug, request: rx, verbIs: vs=>asList(vs).some(v=>verbChk(v.toLowerCase(),rx.method)) };
};

// URL rewrite process...
// rules = array of rule -> {pattern: <regex>|<string>, replace: <string>}
let urlRewrite = (rules,url) => {
    let tmp = url;
    rules.forEach(r=>{tmp = tmp.replace(r.pattern,r.replace)});
    return { changed: tmp!==url, url: tmp };
};

 /**
 * @function authorize validates a user's access to a particular resource based on group memebership
 * @param {string|array} allowed - list of groups allowed permission to the resource
 * @param {string|array} memberOf - list of groups of which user is a member
 * @return {boolean} indicates user's permission 
 */
let authorize = (allowed,memberOf) => { // user assumed authenticated if this gets called!
    if (allowed===undefined) return true;
    let granted = asList(allowed);
    let membership = asList(memberOf);
    return  membership.some(m=>granted.includes(m)) || membership.includes('admin');
};

/**
* @function auth performs user authentication based on the authorization header
* @param {object} [options]
* @return {object} middleware
*/
async function authenticate(ctx) {
    let header = await parseAuthHeader(ctx.request.HEADERS.authorization);  // always needed for authentication
    if (header.method==='bearer') { // JWT authentication requested
        if (!jwt.verify(header.token)) logins.log(header.username,'failed JWT', { code: 401, msg: 'Expired or Invalid JWT credentials' });
        ctx.user = header.fields.payload;  // valid JWT so authentication valid
        logins.log(ctx.user.username,'bearer');
    } else if (header.method==='basic') { // Basic authentication requested (i.e. login)
        if (!header.username && !header.pw) logins.log(header.username,'invalid', { code: 401, msg: 'Invalid authentication credentials' });
        let user = this.getUser(header.username);
        if (verifyThat(user,'isEmpty')) logins.log(header.username,'invalid', { code: 401, msg: 'Invalid user credentials' });
        if (user.status!=='ACTIVE') logins.log(user.username,'failed inactive', { code: 401, msg: 'Inactive user' });
        let valid = (await auth.checkPW(header.pw,user.credentials.hash)) ||    // may be a password (hash) login
            auth.checkCode(header.pw,user.credentials.passcode);                // or a passcode login
        if (!valid) logins.log(user.username,'failed login', { code: 401, msg: 'Authentication failed!' });
        delete user.credentials; // remove sensitive user information
        ctx.user = user;
        logins.log(ctx.user.username,'basic');
    };
    // only get here if user has been validated; other methods will be rejected in parseAuthHeader
    ctx.authenticated = header.method;  
    ctx.authorize = (allowed,membership=ctx.user.member) => authorize(allowed,membership);
};

/// Body parsers...
function bodyParseFormData(req,ctx,options) {
    return new Promise((resolve,reject)=>{
        const NL = '\r\n';
        const BLANKLINE = "\r\n\r\n";
        const TEMP = options.temp;
        let { request:max, upload } = options.limits;
        let boundary = '--' + ctx.request.boundary;
        let streamingToFile = false;    // !streamingToFile equates to scanning for boundary
        let dest = null;
        let parts = { files:[] };
        let buffer = Buffer.from('','binary');

        const overflow = ()=>jxFromCircular(parts).length>max; // pseudo/approximate length of recovered data

        function terminate(e) {
            buffer = null;
            if (parts.files.length==0) delete parts.files;
            if (dest && dest.writeable) dest.end();
            if (e) { reject(e) } else { ctx.request.body = parts; resolve(ctx); };
        };

        req.on('error', terminate);
        req.on('end', terminate);
        req.on('data',(chunk)=>{
            try {
                buffer = Buffer.concat([buffer,Buffer.from(chunk,'binary')]);
                while (buffer.length > boundary.length+4) {    // potential terminal boundary + '--\r\n'
                    if (!streamingToFile) { // looking for part boundary
                        if (buffer.indexOf(boundary)!==0) throw 'Malformed starting boundary!';
                        if (buffer.indexOf('--',boundary.length)-boundary.length==0) throw ''; // final boundary, empty error!
                        let i = buffer.indexOf(BLANKLINE); // starting boundary found so locate blank line (end of subheaders)
                        let subheaders = {};
                        let raw = buffer.slice(0,i).toString();   // remove everything up to blank line from buffer
                        buffer = buffer.slice(i+4);                  // everything after blank line
                        let head = raw.split(NL).filter(l=>l.length).slice(1); // parse head into lines (which removes NL's)
                        head.map(h=>{ let [k,v] = h.split(':'); subheaders[k.toLowerCase()]=v;});  // extract subheaders
                        // look for optional filename...
                        if (!subheaders['content-disposition'].includes('filename=')) {    // no filename means a simple property
                            if (!subheaders['content-disposition'].includes(' name=')) throw 'Missing required name field!';
                            let name = subheaders['content-disposition'].match(/ name="?([^";]*)/)[1];
                            let n = buffer.indexOf(NL);
                            parts[name] = buffer.slice(0,n).toString();
                            if (overflow()) throw {code: 413, msg: `Body overflow detected (max: ${max})`};
                            buffer = buffer.slice(n+2);
                        } else {    // otherwise embedded file so prep file object and transistion to streaming mode
                            let file = { size: 0 };
                            file.filename = subheaders['content-disposition'].match(/filename="?([^";]*)/)[1];
                            file.mime = (subheaders['content-type'] || 'text/plain').trim();
                            file.tempFile = resolveSafePath(TEMP,uniqueID(8,36)+'.tmp');
                            dest = fs.createWriteStream(file.tempFile,'binary');
                            parts.files.push(file); // save file information in both cases
                            if (overflow()) throw {code: 413, msg: `Body overflow detected (max: ${max})`};
                            streamingToFile = true;
                        };
                    } else {    // streaming mode
                        let active = parts.files[parts.files.length-1]; // point to active file (last on files list)
                        let nextBoundary = buffer.indexOf(boundary);   // may or may not be found, always prefixed with NL!
                        // either the entire/remaining file contents is already in buffer (nextBoundary!=-1) or a portion
                        if (nextBoundary!=-1) { // stream to file
                            active.size += nextBoundary - 2;
                            if (active.size>upload) throw {code: 413, msg: `File upload limit (${upload}) exceeded`};
                            dest.write(buffer.slice(0,nextBoundary-2));
                            dest.end();
                            buffer = buffer.slice(nextBoundary);
                            streamingToFile = false;
                        } else {
                            let portionSize = buffer.length - boundary.length - 2; // write up to potential boundary string
                            active.size += portionSize;
                            if (active.size>upload) throw {code: 413, msg: `File upload limit (${upload}) exceeded`};
                            dest.write(buffer.slice(0,portionSize));
                            buffer = buffer.slice(portionSize);
                        };
                    };
                };
            } catch(e) { terminate(e); }; 
        });
    });
};

function bodyParseJSON(req,ctx,options) {
    return new Promise((resolve,reject)=>{
        const MARKER = /data:(.*?)?;?(base64)?,/;
        const TEMP = options.temp;
        let { request:max, upload } = options.limits;
        let streamingToFile = false;    // !streamingToFile equates to scanning for boundary
        let dest = null;
        let jstr = '';
        let file = {};
        let buffer = '';

        const capture = (blk) => {
            if ((jstr.length+blk.length)>max) throw {code: 413, msg: `Body overflow detected (max: ${max})`};
            jstr += blk;
        };

        function terminate(e) {
            if (dest && dest.writeable) dest.end();
            if (e) return reject(e);
            jstr += buffer;
            buffer = null;
            ctx.request.body = jxTo(jstr,{});
            resolve(ctx);
        };

        req.on('error', terminate);
        req.on('end', terminate);
        req.on('data',(chunk)=>{
            try {
                buffer += chunk;
                while (buffer.length) {
                    if (!streamingToFile) { // looking for data-url MARKER
                        let match = buffer.match(MARKER);
                        if (match) {
                            capture(buffer.slice(0,match.index-1));             // buffer before QUOTE before MARKER is JSON
                            buffer = buffer.slice(match.index+match[0].length); // buffer after MARKER is file contents
                            let tempFile = resolveSafePath(TEMP,uniqueID(8,36)+'.tmp');
                            dest = fs.createWriteStream(tempFile,'binary');
                            file = { size: 0, tag: match[0], tempFile: tempFile, mime: match[1], encoding: match[2] };
                            streamingToFile = true;
                        } else {
                            let index = buffer.lastIndexOf('"');
                            capture(buffer.slice(0,index));                     // buffer contents before QUOTE is assumed JSON
                            buffer = buffer.slice(index);                       // buffer contents from QUOTE on
                            break;                                              // wait for more content
                        };
                    } else {    // streaming mode
                        let eof = buffer.includes('"');
                        // move up to next QUOTE or end of buffer to file; however, must move %4 for decode
                        let end = eof ? buffer.indexOf('"') : (buffer.length - (buffer.length%4));
                        let bbuf = Buffer.from(buffer.slice(0,end),'base64');   // decode base64...
                        file.size += bbuf.length;
                        if (file.size>upload) throw {code: 413, msg: `File upload limit (${upload}) exceeded`};
                        dest.write(bbuf);                               // write buffer
                        buffer = buffer.slice(end+(eof?1:0));           // flush file contents from buffer + quote
                        if (!eof) break;                                // nothing left in buffer to stream until next chunk
                        dest.end();
                        capture(jxFrom(file,false));            // replace file contents in stream with file record
                        streamingToFile = false;
                    };
                };
            } catch(e) { terminate(e); }; 

        });
    });
};

function bodyParseOctet(req,ctx,options) {
    let limit = options.limits.upload;
    let fileSpec = resolveSafePath(options.temp,uniqueID(8,36)+'.tmp');
    let file = fs.createWriteStream(fileSpec,'binary');
    let size = 0;
    return new Promise((resolve,reject)=>{
        try {
            req.setEncoding('binary');
            req.on('data',chunk=>{ if (limit>size) { size +=chunk.length; file.write(chunk); } });
            req.on('end',()=>{ file.close(); ctx.request.body={tmpfile: fileSpec, size: size}; resolve(ctx); });
            req.on('error',(e)=>{ reject({ code: 500, msg:'Body parsing error', detail: e.toString() }); });
            file.on('error',(e)=>{ reject({ code: 500, msg:'Body file streaming error', detail: e.toString() }); });
        } catch(e) { reject(e); }; 
    });
};

function bodyParseText(req,ctx,options) {
    let limit = options.limits.request;
    req.setEncoding('utf8');
    let raw = '';
    return new Promise((resolve,reject)=>{
        try {
            req.on('data',chunk=>{ if ((raw.length+chunk.length<limit)) raw += chunk; });
            req.on('end',()=>{ ctx.request.body = raw; resolve(ctx); });
            req.on('error',(e)=>reject({ code: 500, msg:`Body parsing error: ${e.toString()}` }));
        } catch(e) { reject(e); }; 
    });
};

function bodyParseUrlEnc(req,ctx,options) {
    let limit = options.limits.request;
    req.setEncoding('utf8');
    ctx.request.raw = '';
    return new Promise((resolve,reject)=>{
        try {
        req.on('data',chunk=>{ if ((ctx.request.raw.length+chunk.length<limit)) ctx.request.raw += chunk; });
        req.on('end',()=>{ ctx.request.body=qs.parse(ctx.request.raw); resolve(ctx); });
        req.on('error',(e)=>reject({ code: 500, msg:`Body parsing error: ${e.toString()}` }));
        } catch(e) { reject(e); }; 
    });
};

/**
 * @function bodyParse parses the request body for a site
 * @param {object} [options]
 * @return {object} ctx
 */
async function bodyParse(req,ctx,options) {
    if (!['post', 'put'].includes(ctx.request.method)) return;
    let opts = ({}).mergekeys(options);
    if (!ctx.authorize('upload')) opts.limits.upload = 0;
    switch (ctx.request.dataType) {
        case 'json': return await bodyParseJSON(req,ctx,opts);
        case 'urlenc': return await bodyParseUrlEnc(req,ctx,opts);
        case 'text': return await bodyParseText(req,ctx,opts);
        case 'formdata': return await bodyParseFormData(req,ctx,opts);
        case 'octet': return await bodyParseOctet(req,ctx,opts);
        default: throw { code: 501, msg: `Unknown body data type[${ctx.request.dataType}]...}` };
    };
};


///*************************************************************
/// serverware routing support...

/**
 * @function addroute adds a middleware route to a specified table
 * @param {String} table - refernce name for app specific route table
 * @param {String} method - request method filter for route, i.e. get, post, any, ...
 * @param {String} [route] - route path for middleware, default match any
 * @param {Function} asyncFunc - async function called for middleware
 * @return {Object} - returns the current route table
 */
serverware.addRoute = (table,method,route,asyncFunc) => {
    if (!(asyncFunc instanceof Function)) throw "ERROR: middleware requires function declaration";
    let routeFunc = route ? pathMatch(route, { decode: decodeURIComponent }) : null;    // define route parse/test function
    table.push({ method:method, route: route, test:routeFunc, afunc:asyncFunc, op: asyncFunc.name});       // add to the route table
    return table;
};

/**
 * @function router sequences middleware
 * @param {*} ctx - request context
 * @return {*} - server (i.e. middleware) response
 */
serverware.router = async function(ctx) {
    let self = this;
    if (!ctx.next) ctx.next = async function(err) { if (err) throw err; return await serverware.router.call(self,ctx); };
    let check = false;
    while (!check) {    // find next middleware that matches route and method
        ctx.routing.route = self.routes[ctx.routing.index++];  // get next route or undefined
        if (!ctx.routing.route) throw 404;   // not found if last route already processed
        //check = (ctx.routing.route.method=='any' || ctx.routing.route.method==ctx.request.method) && 
        check = ctx.verbIs(ctx.routing.route.method) && (!ctx.routing.route.test || ctx.routing.route.test(ctx.request.pathname));
        ctx.request.params = ({}).mergekeys(typeof check == 'object' && check.params);
        ctx.args = ({}).mergekeys(ctx.request.params).mergekeys(ctx.request.query);
    };
    return await ctx.routing.route.afunc.call(self,ctx);   // call middleware and wait for response or error
};


///*************************************************************
/// Request, response and error handling...

serverware.defineRequestPreprocessor = function(cfg={}) {
    let self = this;
    let scribble = this.scribe;
    let authenticating = this.authenticating;
    let opts = { temp: '../tmp', limits: {request: '64K', upload: '10M'}, 
      log: "RQST[${ctx.request.method}]: ${ctx.request.href}" }.mergekeys(cfg.options);
    let prompt = (msg,vars) => new Function("let ctx=this; return `"+msg+"`;").call(vars);  // ctx->vars->this->ctx
    let bodyParseOptions = {temp: resolveSafePath(opts.temp), 
        limits: { request: asBytes(opts.limits.request), upload: asBytes(opts.limits.upload) }};
    if (!fs.existsSync(bodyParseOptions.temp)) fs.mkdirSync(bodyParseOptions.temp);
    
    return async function requestProcessor(req,ctx) {
        let props = parseRequestProperties(req);                                // parse request properties
        ctx.mergekeys(props);
        if (authenticating && 'authorization' in ctx.request.HEADERS) await authenticate.call(self,ctx);
        await bodyParse(req,ctx,bodyParseOptions);
        scribble.log(prompt(opts.log,ctx));                 // log request
        if (opts.rewrite) {
            let rewrite = urlRewrite(opts.rewrite,ctx.request.href);
            if (rewrite.changed) {
                ctx.request.mergekeys(urlParse(rewrite.url));
                scribble.log(`REWRITE -> ${rewrite.url}`);  // log request
            };
        };
        statistics.inc(scribble.tag,'requests');
    };
};


/**
 * @function defineResponseHandler returns the handler to returning requested data
 * @param {object} ctx - request/response context 
 */
serverware.defineResponseProcesser = function(cfg={}) {
    let scribble = this.scribe;

    return async function processResponse(ctx,res) {
        let headOnly = ctx.verbIs('head');
        if (ctx.data instanceof ResponseContext) {      // streaming or buffered content
            ctx.headers(ctx.data.headers);     // any included headers
            if (headOnly) ctx.headers({'Content-length': 0})
            ctx.headers().mapByKey((v,h)=>res.setHeader(h,v));   // set response headers
            if (headOnly) {
                res.end();
            } else if (ctx.data.streaming) {
                let bytesSent = 0;
                let sniffer = sniff(buf=>{bytesSent+=buf.length});
                ctx.data.contents.pipe(sniffer).pipe(res);
                ctx.data.contents.on('close',()=>{
                    let { compressed, size } = ctx.data;
                    let ratio = bytesSent ? (size/bytesSent).toFixed(2)+'X' : '1X';
                    let summary = `${size}/${bytesSent}/${ratio} bytes`;
                    scribble.trace(`Streaming ${compressed?'compressed ':''}response sent for ${ctx.request.href} (${summary})`);
                    res.end();
                });
            } else {    // buffered response
                res.end(ctx.data.contents);
                scribble.trace(`Buffered response sent for ${ctx.request.href} (${ctx.data.contents.byteLength} bytes)`);
            };
        } else {        // treat all other responses as JSON
            let tmp = !headOnly ? (jxFromCircular(ctx.debug ? ({}).mergekeys(ctx) : ctx.data, false)) : '';
            ctx.headers({'Content-Type': 'application/json', 'Content-Length': tmp.length}).mapByKey((v,h)=>res.setHeader(h,v));
            while (tmp.length>16384) {
                res.write(tmp.slice(0,16384));
                tmp = tmp.slice(16384);
            };
            res.end(tmp);
            if (!headOnly) scribble.trace(`JSON response sent for ${ctx.request.href} (${tmp.length} bytes)`);
        };
        if (headOnly) scribble.trace(`HEAD response sent for ${ctx.request.href}`);
    };
};

/**
 * @function defineErrorHandler returns the handler for http response errors
 * @param {object} ctx - request/response context 
 */
serverware.defineErrorHandler = function(cfg={}) {
    let scribble = this.scribe;
    let redirect = cfg.redirect || null;

    return async function errorHandler(err,ctx,res) {
        try {
            let ex = httpStatusMsg(err);            // standard HomebrewDIY error format
            if (ex.code==404 && redirect) {         // if not found provide the option of redirecting
                let destination = ctx.request.href.replace(...redirect);
                scribble.trace(`Redirect[${ctx.request.method}] ${ctx.request.href} -> ${destination}`);
                res.writeHead(301,{Location: destination});
            } else if (ex.code < 400) {             // status response only, not an error!
                res.writeHead(ex.code,ex.msg);
                scribble.trace(`Status[${ctx.request.method}] ${ctx.request.href} -> ${ex.code}:${ex.msg}`);
            } else {                                // response with error message, if possible
                let eText = JSON.stringify(ex);
                if (!res.headersSent) {
                    res.setHeader('Content-Type', 'application/json');
                    res.setHeader('Content-Length', eText.length);
                    res.write(eText);
                    scribble.error(`HTTP Error[${ex.code}]: ${ex.msg}${ex.detail?'\n'+ex.detail:''}`);
                    if (ex.code==500 && ctx.debug) console.log(err);
                } else {
                    scribble.error(`${ex.detail}`);
                };
            };
        } catch(e) {            // trap any errors that happen in the process of sending error response
            scribble.error(`HTTP Error: Error terminating request -> ${e.toString()}`);
        };
        res.end();          // terminate all request errors
    };
};


// Export functions...
module.exports = serverware;
