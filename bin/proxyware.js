/***
 * @module proxyware.js
 * This modules provides reverse proxy server support
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const pw = require('./proxyware');
 * 
 * 
 * TBD...
 *      JSDOCS
 */





///*************************************************************
/// Dependencies...
const exec = require('util').promisify(require('child_process').exec);
const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const tls = require('tls');
const fs = require('fs');
const fsp = fs.promises;
const { blacklists, httpStatusMsg, Scribe, statistics } = require('./workers');


///*************************************************************
/// worker definitions...
let proxies = {};

// instance closure for (error handler and) router...
let proxyRouter = (tag) => {
    var self = proxies[tag];
    self.proxy.on('error',(err,req,res)=>{
        self.scribble.error('Trapped internal proxy exception!:',err.toString());
        statistics.inc(self.tag,'errors');
        try {
            res.writeHead(500, "Oops!, Proxy Server Error!" ,{"Content-Type": "application/json"});
            res.write(JSON.stringify(httpStatusMsg({code: 500, msg: 'Oops!, Proxy Server Error!'})));
        } catch (e) {self.scribble.error('Exception handling Proxy Exception!:',e.toString())};
        res.end();
    });
    return function router(req,res) {
        let [host, method, url] = [(req.headers.host||'').split(':')[0], req.method, req.url];
        let route = self.routes[host] || self.routes['*.' + host.substr(host.indexOf('.')+1)];
        let ip = req.headers['x-forwarded-for']||req.connection.remoteAddress||'?';
        if (route) {
          statistics.inc(self.tag,'served');
          self.scribble.debug(`Proxy ${ip} -> ${host} -> ${method} ${url} (${route.host}:${route.port})`);
          self.proxy.web(req, res, {target: route});
        } else {
          let localIP = ip.match(/(?:192\.168|127\.\d+|10\.\d+|169\.254)\.\d+\.\d+$/);
          if (!localIP || self.cfg.verbose) { // ignore diagnostics for local addresses unless verbose
            let probes = statistics.inc(self.tag,'probes');
            let perIP = blacklists.inc(self.tag,ip);
            self.scribble.dump(`NO PROXY ROUTE[${probes},${perIP}]: ${ip} -> ${host}`);
          };
          res.end(); // invalid routes close connection!
        };
    };
};

let sslContext = async function sslContext(tag) {
    self = proxies[tag] || {};
    if (!self.cfg.ssl) throw 'Required proxy secrets files (key/cert) not defined!';    // context cfg options
    try {
        for (let k in self.cfg.ssl) {
            self.scribble.trace(`Loading TLS '${k}' file: ${self.cfg.ssl[k]}`);
            self.ssl.data[k] = await fsp.readFile(self.cfg.ssl[k], 'utf8');
        };
        self.scribble.debug('Key/certificate files loaded...');
        self.ssl.context = tls.createSecureContext(self.ssl.data);
        let now = new Date().toISOString();
        let stdout = (await exec(`openssl x509 -noout -enddate -in ${self.cfg.ssl.cert}`)).stdout;
        let exp = new Date(stdout.replace(/.*=/,'').trim()).toISOString();
        self.scribble.info('SSL Certificate valid until:',exp);
        return statistics.set('proxy',self.tag,{expires: exp, loaded: now, tag: self.tag});
    } catch (e) {self.scribble.error(`Secure Proxy[${self.tag}] key/certificate file error`); throw e; };
};

let Proxy = async function(config) {
    let tag = config.tag;
    let scribble = Scribe(tag);
    let pOptions = {ws: false, hostnameOnly: true, xfwd: true}.mergekeys(config.options);
    let proxy = httpProxy.createServer(pOptions);
    proxies[tag] = { cfg: config, isSecure: !!config.ssl, proxy: proxy, routes: config.routes, scribble: scribble, tag: tag };
    statistics.set(tag,undefined,{errors: 0, probes: 0, served: 0});
    try {
        if (config.ssl) {   // build secure (i.e. https) context
            proxies[tag].ssl = {
                busy: false,
                context: {},    // must define after ssl defined
                data: {},       // loaded by sslContext
                files: config.ssl,
                options: { SNICallback: ((px)=>(host,cb)=>cb(null,px.ssl.context))(proxies[tag]) },
                timestamp: (await fsp.stat(config.ssl.cert)).mtime.toISOString()
            };
            await sslContext(tag),   // add context to proxy, later calls will update SNICallback
            fs.watch(config.ssl.cert,(evt,fn)=>{
                let ssl = proxies[tag].ssl;
                if (ssl.busy) return;
                ssl.busy = evt=='change';
                if (ssl.busy) fs.stat(ssl.files.cert,(e,s)=>{
                    if (s.mtime.toISOString()!==ssl.timestamp) sslContext(tag)
                        .then(x=>{ ssl.timestamp = s.mtime.toISOString(); ssl.busy = false; })
                        .catch(e=>{console.log('e:',e)});
                });
           });
            proxies[tag].server = https.createServer(proxies[tag].ssl.options,proxyRouter(tag));
        } else {            // build insecure (i.e. http) context
            proxies[tag].server = http.createServer(proxyRouter(tag));
        };
        // handle web sockets and start server
        proxies[tag].server.on('upgrade',(req,socket,head) => { proxies[tag].proxy.ws(req,socket,head); });
        proxies[tag].server.listen(config.port);
        scribble.info(`${config.ssl?'SECURE ':''}Proxy initialized on port ${config.port}`); 
    } catch (e) { scribble.error(e.toString()); throw e; };
};

module.exports = {Proxy:Proxy, sslContext: sslContext};
