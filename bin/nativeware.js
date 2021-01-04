/***
 * @module nativeware.js
 * This modules provides endpoint handler methods and declarations for apps.
 * (c) 2020 Enchanted Engineering, MIT license
 * @example
 *   const mw = require('./nativeware');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const fs = require('fs');
const fsp = fs.promises;
const { asList, asStr, resolveSafePath, verifyThat } = require('./helpers');
const { analytics, auth, jwt, listFolder, mail, safeStat, sms } = require('./workers');  
const { Cache, FileEntry } = require('./caching');
const { ResopnseContext } = require('./serverware');


///*************************************************************
/// declarations...
var nativeware = {};    // serverware nativeware container    


///*************************************************************
/// nativeware built-ins with specific worker/helper functions
///*************************************************************
/**
 *  All nativeware have the signature 'function defineMiddleware(options) { ... ; return async function (ctx) {...}; }'
 *      bound to the site scope for access to functions such as scribe 
 */


/**
 * @function account handles user account management, i.e. create, update, delete users
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.account = function account(options={}) {
    let usersDB = this.db.users;
    let self = this;
    let scribble = this.scribe;
    let { route='/user/:action/:user?/:opt?' } = options;
    scribble.info(`Account nativeware initialized for route ${route}`);
    return async function accountMW(ctx) {
        let admin = ctx.authorize('admin,manager');    // authenticated admin or manager
        let { action, user, opt } = ctx.request.params;
        let selfAuth = user && user==ctx.user.username;   // user authenticated as self
        if (ctx.verbIs('get')) {
            switch (action) {
                case 'code':        // GET /user/code/<username> (request activation code)
                    if (!user) throw 400;
                    let usr = self.getUser(user);
                    if (verifyThat(usr,'isEmpty')) throw 400;
                    usr.credentials.passcode = auth.getActivationCode();
                    self.chgUser(user,usr);
                    let { credentials, credentials: { passcode }, email, phone, username } = usr;
                    let text = `Challenge code: ${passcode.code} user: ${username}`;
                    // if any opt then by mail, i.e. GET /user/code/<username>/mail, otherwise by SMS
                    let { report, queue } = await ( opt ? mail({time: true, to: email, text: text}) :
                      sms({time: true, to: phone, text: text}) );
                    let msg = `Challenge code[${admin?passcode.code:'?'}] sent to ${username} at ${opt?email:phone}`
                    scribble.info(msg);
                    return { msg: msg, queue: admin?queue:null, report: report };
                case 'contacts':    // GET /user/contacts
                case 'groups':      // GET /user/groups
                case 'users':       // GET /user/users
                    if (!admin) throw 401;
                case 'names':       // GET /user/names
                    if (!ctx.authenticated) throw 401;
                    let uData = usersDB.query(action,{ref:user||'.+'});
                    if (uData) { return uData } else { throw 400; };
                default:
                    scribble.warn(`Unsupported user information request: ${action}`);
                    throw 400;
            };
        };
        if (ctx.verbIs('post')) {
            switch (action) {
                case 'code':        // POST /user/code/<username>/<code> (validate activation code)
                    let who = self.getUser(user);
                    if (verifyThat(who,'isEmpty')) throw 400;
                    if (ctx.checkCode(opt,who.credentials.passcode) && who.status=='PENDING') {
                        who.status = 'ACTIVE';
                        self.chgUser(who.username,who);
                    };
                    return {msg: `Status: ${who.status}`};
                case 'change':      // POST /user/change (new or update or delete)
                    if (!admin || !selfAuth) throw 401;
                    if (!verifyThat(ctx.request.body,'isArrayofAnyObjects')) throw 400;
                    let data = ctx.request.body;
                    let changes = [];
                    const DEFAULTS = usersDB.query('defaults');
                    for (let usr of data) {
                        let record = usr.record || usr[1]; // usr.ref||usr[0] not trusted, record.username used instead
                        if (verifyThat(record,'isTrueObject') && record.username) {
                            // if user exists change action, else create action...
                            let existing = usersDB.query('userByUsername',{username: record.username},true) || {};
                            let exists = verifyThat(existing,'isNotEmpty');
                            self.scribe.trace("existing[%s] ==> %s", record.username, JSON.stringify(existing));
                            // authorized if: new account (not exists), user is self, or admin
                            if (!exists || (record.username==ctx.user.username) || admin) { 
                                // build a safe record... filter credentials, membership, and status
                                record.credentials = record.password ? 
                                  ({ hash: await auth.createPW(record.password), code: {} }) : 
                                  exists ? existing.credentials : DEFAULTS.credentials;
                                delete record.password;
                                self.scribe.trace(`user record[${record.username}] ==> ${JSON.stringify(record)}`);
                                let entry = ({}).mergekeys(DEFAULTS).mergekeys(existing).mergekeys(record);
                                if (!admin) {   // can't change one's own membership or status
                                    entry.member = exists ? existing.member : DEFAULTS.member;
                                    entry.status = exists ? existing.status : DEFAULTS.status;
                                };
                                self.scribe.trace(`user entry[${entry.username}] ==> ${JSON.stringify(entry)}`);
                                changes.push(self.chgUser(record.username,entry)[0]||[]);
                            } else {
                                changes.push(['error',record.username,self.server.emsg(401)]);  // not authorized
                            };
                        } else {
                          changes.push(['error',record.username,self.server.emsg(400)]);        // malformed request
                        };
                    };
                    scribble.trace("user changes:", changes);
                    return changes;
                default: throw 400;
            };
        };
        throw 501;  // other methods not supported
   };
};


/**
 * @function cors injects cors headers for cross-site requests
 * @param {object} options
 * @return {object} nativeware
 */
nativeware.cors = function cors(options={}) {
    if (!options.origins) this.scribe.fatal("CORS handler must be defined as null or requires origins property");
    let origins = asList(options.origins);
    let headers = asStr(options.headers||'Authorization, Content-type');
    let methods = asStr(options.methods||'POST, GET, OPTIONS');
    let credentials = options.credentials===undefined ? true : !!options.credentials;
    return async function corsMW(ctx) {
        if (!ctx.request.origin) return await ctx.next();
        if (origins.includes(ctx.request.origin)) {
            ctx.headers({
                'Access-Control-Allow-Origin': ctx.request.origin, 
                'Access-Control-Expose-Headers': '*'    // headers browser may expose to JavaScript
            });
            if (ctx.verbIs('options')) {    // preflight check
                ctx.headers({
                    'Access-Control-Allow-Methods': methods,
                    'Access-Control-Allow-Headers': headers,    // headers browser may send
                    'Access-Control-Allow-Credentials': credentials
                });
                return null;
            };
            return await ctx.next();
        } else {
            throw {code: 403, msg: `Unauthorized cross-site request for ${ctx.request.origin}`};
        };
    };
};


/**
 * @function logAnalytics records requested analytics
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.logAnalytics = function logAnalytics(options={}) {
    let scribble = this.scribe;
    let log = options.log===undefined ? ['ip','page','user'] : asList(options.log);
    scribble.info('Analytics nativeware initialized...');
    return async function logAnalyticsMW(ctx) {
        log.forEach(a=>{
            if (a=='ip') analytics.inc('ip',ctx.request.ip);
            if (a=='page') analytics.inc('page',ctx.request.baseURL);
            if (a=='user' && ctx.user.username) analytics.inc('user',ctx.user.username);
        });
        return await ctx.next();
   };
};


/**
 * @function login generates a JSON Web Token for user access authentication
 * @param {object} [options]
 * @return {object} nativeware
 * 
 */
nativeware.login = function login(options={}) {
    this.scribe.info('Login nativeware initialized...');
    return async function loginMW(ctx) {
        if (args.action=='logout') return {};
        if (!ctx.authenticated) throw 401;
        if (ctx.authenticated=='bearer' && !jwt.cfg.renewal) throw { code: 401, msg: 'Token renewal requires login' };
        ctx.jwt = jwt.create(ctx.user);
        ctx.headers({authorization: `Bearer ${ctx.jwt}`});
        return {jwt: ctx.jwt}.mergekeys(jwt.extract(ctx.jwt)); // login response
    };
};


/**
 * @function content serves (static) content, including folder listing and file upload
 * @param {object} [options]
 * @return {object} nativeware
 */
nativeware.content = function content(options={}) {
    let scribble = this.scribe;
    let { auth='', cache={}, compress:compressTypes, index='index.html', indexing, root, route='', tag=this.tag } = options;
    let [ authGet, authPost ] = asList(auth,'|');
    cache.header = cache.header || 'max-age=600';
    if (auth && !cache.header.includes('private')) 
        scribble.warn(`Content[${tag}]: 'Cache-header' for authorized access should include 'private' setting`);
    compressTypes = asList(compressTypes||'css,csv,html,htm,js,json,pdf,txt');
    if (!root) throw `Content[${tag}] nativeware requires a root definition`;
    let theCache = new Cache(cache); // add pre-caching???
    scribble.info(`Content[${tag}] nativeware initialized for route '${route}' and root ${root}`);
    return async function contentMW(ctx) {
        scribble.trace(`Content[${tag}]: ${ctx.request.method} ${ctx.request.baseURL}`);
        if (ctx.verbIs('get')) {
            if (authGet && !ctx.authorize(authGet)) throw 401;    // not authorized
            let base = ctx.request.baseURL + (ctx.request.baseURL==='/' ? index : '');
            let fileSpec = resolveSafePath(root,base);
            let stats = await safeStat(fileSpec);
            scribble.trace(`Content[${tag}]: ${fileSpec}, ${stats && stats.isDirectory() ? 'DIR' : 'FILE'}`);
            if (!stats || stats.isSymbolicLink()) return await ctx.next();  // not found (or found link), continue looking
            if (stats.isDirectory()) {
                if (!indexing) throw 403;
                ctx.headers({'Cache-control': 'no-cache'});
                return await listFolder(fileSpec,indexing===true?{}:indexing);
            };
            let newEntry = new FileEntry(fileSpec,{url: base, size: stats.size, time: stats.mtime});
            let oldEntry = theCache.getEntry(fileSpec);
            let modified = !(oldEntry && oldEntry.matches(newEntry));
            ctx.headers({'Last-Modified': newEntry.modified});
            let since = ctx.request.HEADERS['if-modified-since'];
            if (since && new Date(since)>new Date(newEntry.modified))  throw 304;   // not modified notice
            let etags = ctx.request.HEADERS['if-none-match'] || '';
            let etagMatch = oldEntry && oldEntry.hasTagMatch(etags)
            if (etags && !modified && etagMatch) throw 304;   // not modified notice
            try {        
                if (modified) {
                    let store = newEntry.size < theCache.max;
                    let compress = compressTypes.includes(newEntry.ext);
                    await newEntry.load(store,compress);
                    theCache.addEntry(newEntry);
                    oldEntry = newEntry;
                };
                ctx.headers({'Cache-Control': cache.header});
                // build return record
                let compressed = (ctx.request.HEADERS['accept-encoding'] || '').includes('gzip');
                let data = new ResopnseContext(oldEntry.content(compressed));
                return data;
            } catch(e) { throw e; };
        } else if (ctx.verbIs('post')) {
            if (!authPost || !ctx.authorize(authPost)) throw 401;    // not authorized
            if (!verifyThat(ctx.request.body,'isArrayOfTrueObjects')) throw {code:400, msg: 'Array of "file" objects expected!'};
            let data = [];
            for (let f of ctx.request.body) {
                let path = resolveSafePath(root,f.folder||ctx.request.baseURL,f.name);  // assumes baseURL OR f.folder
                let exists = await safeStat(path);
                if (exists && f.backup) {
                    let backup = resolveSafePath(root,f.folder,f.backup);
                    await fsp.copyFile(path,backup);
                };
                if (!exists || f.backup || f.force) {
                    await fsp.copyFile(f.contents.tempFile,path);
                    await fsp.rm(f.contents.tempFile);
                    data.push(true);
                } else {
                    data.push(false);
                }
            };
            return data;
        } else { ctx.next(405); };
   };
};


// Export functions...
module.exports = nativeware;
