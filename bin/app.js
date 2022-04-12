/*
 * HomebrewDIY backend baseline app (operating behind an https proxy) with built-in support for ...
 *  - Authentication, authorization, login, and user account management
 *  - Request logging
 *  - Parsing for JSON, urlencoded, and simple multipart/form-data bodies with file upload
 *  - Configurable middleware for serving static content, data, microservices, ...
 *  - Response compression and streaming
 *  - Error handling
 *  - No external framework required
 */

// dependencies...
const http = require('http');
const { jxFrom, markTime } = require('./helpers');  // low level utility functions
const { Scribe } = require('./workers');            // higher level service workers
const jxDB = require('./jxDB');
// middleware libraries...
const sw = require('./serverware');         // built-in server functions, request parser, router, and response handler, ...
const nw = require('./nativeware');         // application built-in middleware functions, including (static) content handler
const aw = require('./apiware');            // Homebrew API middleware handler
// optional custom user middleware (highest precedence), defined as empty module if not found, overrides native and api functions
const cw = (()=>{ try { return require('./customware'); } catch (e) { return {}; }; })();   // IIFE

/**
 * @module App constructor for basic HomebrewDIY application
 * @param {object} context - site specific context (setup options and diy shared context) passed from diy script
 * @return App server object
 */
function App(context) {
    // context: { cfg: {...}, secure: <boolean>, shared: {db:{...}, headers:{...}}, tag: <string> }
    this.mergekeys({cfg: context.cfg, isSecure: context.secure, routes: [], shared: context.shared, tag: context.tag});
    this.scribe = Scribe(context.tag);
    this.db = context.shared.db.mapByKey(connection=>connection);   // reference any shared db conections, can't be merged
    (context.cfg.databases||{}).mapByKey((def,tag)=>{ def.tag = def.tag || tag; this.db[tag] = new jxDB(def); }); // add new db's
    // authentication setup required by auth & account middleware
    this.authenticating = !(context.cfg.options===null || context.cfg.options?.auth === null);
    if (this.authenticating && !this.db.users) self.scribe.fatal('Users database not found, required for authentication');
    this.getUser = this.db.users ? (usr) => this.db.users.query('userByUsername',{username:usr.toLowerCase()}) : ()=>{};
    this.chgUser = this.db.users ? (usr,data) => this.db.users.modify('changeUser',[{ref: usr, record: data}]) : ()=>{};
    this.build();       // build route table...
    this.start();       // start the server...
    this.scribe.debug(`HomebrewDIY App initialized`);
};

/**
 * @function build defines the appplication specific route table for processing requests
 */ 
App.prototype.build = function() {
    let routeTable = this.routes;
    let [anw, aaw, acw] = [nw, aw, cw].map(w=>w.mapByKey(v=>typeof v=='function' ? v.bind(this) : v));  // bind f()'s to App scope
    function addRoute (method,route,afunc) { sw.addRoute(routeTable,method||'',route,afunc); };
    let { handlers=[], options={}, root } = this.cfg;
    let { account={}, analytics, cors, login } = options===null ? { analytics: null, cors: null } : options;
    // create and build middleware stack starting with priority built-in configurable features...
    if (analytics!==null) addRoute('any','',anw.logAnalytics(analytics));
    if (cors!==null) addRoute('any','',anw.cors(cors));
    if (this.authenticating) {
        addRoute('any',account.route||'/user/:action/:user?/:opt?',anw.account(account));
        addRoute('any','/:action(login|logout)',anw.login(login));
    };
    // custom handlers specified by configuration...
    handlers.forEach(h=>{
        let { code='', method='any', route='' } = h;
        let codeWare = acw[code] || aaw[code] || anw[code] || null;
        if (codeWare) addRoute(method.toLowerCase(),route,codeWare(h));
    });
    if (root) addRoute('get','',anw.content({root:root}));  // default open static server, if site root defined
};

/**
 * @function start defines the http server
 */
App.prototype.start = function start() {
    let siteHeaders = {}.mergekeys(this.shared.headers).mergekeys(this.cfg.headers); // merge server and site headers
    let prepRequest = sw.defineRequestPreprocessor.call(this,this.cfg);
    let sendResponse = sw.defineResponseProcesser.call(this,this.cfg);
    let handleError = sw.defineErrorHandler.call(this,this.cfg);
    try {
        http.createServer(async (req,res) => { // Instantiate the HTTP server with async request handler...
            // this code called for each http request...
            let ctx = sw.createContext();                       // define context for the request response
            ctx.headers(siteHeaders);                           // append site specific headers to context
            try {                                               // wrap all processing to trap all errors
                await prepRequest(req,ctx);                     // parse request headers and body, optionally authenticate
                ctx.data = await sw.router.call(this,ctx);      // route context through middleware chain, return data
                await sendResponse(ctx,res);                    // return response to client
            } catch(err) { await handleError(err,ctx,res); };   // handle any error that occurs
        }).listen(this.cfg.port);
        this.scribe.info(`HomebrewDIY App running on ${this.cfg.host}:${this.cfg.port}`);
    } catch(e) { this.scribe.fatal(`HomebrewDIY App failed to start --> ${e.toString()}`) };
};


module.exports = App;
