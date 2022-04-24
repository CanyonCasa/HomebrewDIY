/***
 * @module apiware.js
 * This modules provides an endpoint handler for the homebrew API.
 * (c) 2020 Enchanted Engineering, MIT license
 * The app.js file conditionally loads this file and treats all exported functions as middleware
 * It can be used as is or as a skeleton for user customizable API. 
 * @example
 *   const cw = require('./apiware');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const { asList, asTimeStr, jxFrom, jxSafe, verifyThat } = require('./helpers');
const { analytics, auth: {genCode}, blacklists, logins, mail, sms, statistics } = require('./workers');  
const { ResponseContext } = require('./serverware');
const jxDB = require('./jxDB');


///*************************************************************
/// declarations...
var apiware = {};               // serverware middleware container    


///*************************************************************
/// apiware Homebrew API handler
///*************************************************************
/**
 *  All apiware have the signature 'function defineMiddleware(options) { ... ; return async function (ctx) {...}; }'
 *  app.js binds all functions to the site scope for access to objects such as scribe 
 */

 
///*************************************************************
/// Homebrew API workers...
/**
 * @function grant authorizes specified users temporary login access by text or email
 * @param {object} ctx request context
 * @return {object} summary message
 */
async function grant(ctx) {
    let site = this;
    let scribble = this.scribe;
    if (!('users' in site.db)) throw 501;
    if (!ctx.authorize('grant')) throw 401;
    let user = asList(ctx.args.user || ctx.args.opts[0] || '');
    let exp = ((e)=>e>10080 ? 10080 : e)(ctx.args.exp || ctx.args.opts[1] || 30); // limited expiration in min; IIFE
    let byMail = ctx.args.mail || ctx.args.opts[1];
    let ft = (t,u)=>{return u=='d' ? (t>7?7:t)+' days' : u=='h' ? (t>24?ft(t/24,'d'):t+' hrs') : t>60? ft(t/60,'h') : t+' mins'};
    let expStr = ft(exp);
    let contacts = site.db.users.query('contacts',{ref:'.*'});
    return new Promise((resolve,reject)=>{
        Promise.all(user.map(u=>{
            if (!contacts[u]) return {};
            let passcode = genCode(7,36,exp);
            site.chgUser(u,{credentials:{ passcode: passcode}});
            let msg =`${ctx.user.username} granted access to...\n  user: ${u}\n  passcode: ${passcode.code}\n  valid: ${expStr}`;
            return byMail ? sendMail.call(site,{to: contacts[u].email, time:true,text:msg}) : 
              sendText.call(site,{to: contacts[u].phone, time:true,text:msg});
        }))
        .then(x=>{
            let ok=[], fail=[];
            x.map((r,i)=>(!!(r.report) ? ok : fail).push(user[i]));
            scribble.info(`Action[grant]: Login code sent by ${byMail?'mail':'text'} to ${ok.join(',')}`);
            if (fail.length) scribble.warn(`Action[grant]: Login code send failures for ${fail.join(',')}`);
            resolve ({msg:`Login code sent by ${byMail?'mail':'text'} to ${ok.join(',')}`, ok: ok, fail: fail});
        })
        .catch(e=>{
            let emsg = `Action[grant]: Granting permission failed => ${e.toString()}`;
            scribble.error(emsg);
            reject ({code:500, msg: emsg});
        });
    });
};

/**
 * @function info gets client and authorized internal server data
 * @param {object} ctx request context
 * @return {object} client and authorized server information
 */
function info(ctx) {
    let ok = ctx.authorize('server');
    let { ip:raw, port } = ctx.request.remote;
    let v4 = raw.replace(/:.*:([\d.]+)/,($0,$1)=>$1.includes('.')?$1:'127.0.0.'+$1);
    let v6 = (v4!=raw) ? raw : "0:0:0:0:0:0:0:0";
    let dx = new Date().style();
    if (ctx.request.params.recipe==='iot') return { ip: v4, time: dx.e, iso: dx.iso };
    let internals = { statistics: statistics.get() };
    internals.statistics.$diy.uptime = asTimeStr(new Date(dx.iso) - new Date(internals.statistics.$diy.start));
    if (ok) internals.mergekeys({ analytics: analytics.get(), app: this, blacklists: blacklists.get(), logins: logins.get() });
    return { ip: {raw: raw, v4: v4, v6: v6, port: port}, date: dx }.mergekeys(internals);
};

/**
 * @function mask gets or sets scribe mask level to control level of detail transcripted
 * @param {object} ctx request context
 * @return {object} current mask level
 */
function scribeMask(ctx) {
    let mask = this.scribe.mask(ctx.authorize('server') ? ctx.args.level||ctx.args.opts[0] : '');
    return { msg: `Scribe mask: ${mask}`, mask: mask };
};

/**
 * @function sendMail site specific preprocessor to translate user identities into valid email addresses
 * @param {object} msg email message containing text and identities to which it is sent
 * @return {object} a report summary 
 */
async function sendMail(msg) {
    let site = this;
    let scribble = this.scribe;
    if (!('users' in site.db)) throw 501;
    let addressBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.email);
    let letter = {id: msg.id, time: msg.time, subject: msg.subject, hdr: msg.header||msg.hdr, text: msg.text, body: msg.body, html: msg.html};
    ['to','cc','bcc'].forEach(addr=>{  // resolve email addressing
       let tmp = msg[addr] instanceof Array ? msg[addr] : typeof msg[addr]=='string' ? msg[addr].split(',') : [];
       tmp = tmp.map(a=>a.includes('@')?a:addressBook[a]).filter(a=>a).filter((v,i,a)=>v && a.indexOf(v)===i).join(',');
       if (tmp) letter[addr] = tmp;
    });
    if (msg.from) letter.from = msg.from.includes('@')?msg.from:addressBook[msg.from];
    scribble.trace(letter);
    return await mail(letter);
};

/**
 * @function sendText site specific preprocessor to translate user identities into valid phone numbers
 * @param {object} msg text message containing text and identities to which it is sent
 * @return {object} a report summary and queue details 
 */
async function sendText(msg) {
    let site = this;
    let scribble = this.scribe;
    if (!('users' in site.db)) throw 501;
    let phoneBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.phone);
    let text = { callback: msg.callback, id: msg.id || '' };    // format optional header with id and/or time
    text.timestamp = msg.time ? '['+new Date().toISOString()+']' : '';
    text.body = (msg.header || msg.hdr || ((text.id||text.timestamp) ? text.id+text.timestamp+':\n' : '')) + msg.text;
    // map recipients, group or to "users and/or numbers" to prefixed numbers...
    let list = [msg.recipients,msg.group,msg.to].map(g=>(g||'').toString()).filter(n=>n).join(',').split(',');
    text.numbers = list.map(n=>isNaN(n)?phoneBook[n]:n).filter(n=>n);
    scribble.trace('sendText:',list, msg, text);
    return await sms(text);
};

/**
 * @function twilio handles Twilio status callback messages as well as no reply responses
 * @param {object} rpt Twilio message report data (JSON)
 * @return {string} XML response data
 */
function twilio(ctx) {
    let scribble = this.scribe;
    if ((ctx.args.opts||[])[0]!=='status') 
        return "<Response><Message>No one receives replies to this number!</Message></Response>";
    let rpt = ctx.request.body || {};
    if (rpt.MessageStatus=='undelivered') {
        let notice = `Message to ${rpt.To} failed, ref: ${rpt.MessageSid}`;
        scribble.warn(`Action[twilio]: ${notice}`);
        sms({contact: ctx.args.opts[1], text: notice})
          .then(data=>{ scribble.log(`Twilio callback made to ${ctx.args.opts[1]} for ${rpt.MessageSid}`); })
          .catch(err=>{ scribble.error("Action[twilio] ERROR: %s", err); }); 
    };
    return "<Response></Response>"; // empty XML response == 'OK'
};

async function inquire(db,ctx) {
    let scribble = this.scribe;
    let recipe = db.lookup(ctx.args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) throw 404;
    if (recipe.auth && !ctx.authorize(recipe.auth)) throw 401;  // check auth
    let bindings = verifyThat(ctx.request.query,'isNotEmpty') ? ctx.request.query : ctx.request.params.opts||[];
    scribble.trace(`bindings[${bindings instanceof Array ? 'array' : typeof bindings}]: ${jxFrom(jxSafe(bindings,recipe.filter||'*'),false)}`)
    return db.query(recipe,jxSafe(bindings,recipe.filter||'*'));   // query db
};

async function cache(db,ctx) {
    let scribble = this.scribe;
    let recipe = db.lookup(ctx.args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) throw 404;
    if (recipe.auth && !ctx.authorize(recipe.auth)) throw 401;  // check auth
    let data = ctx.request.body;
    if (!verifyThat(data,'isArrayOfAnyObjects')) return [];
    return db.modify(recipe,jxSafe(data,recipe.filter||'*'));
};


/**
 * @function api serves request endpoints defined by the Homebrew API.
 * @param {object} [options]
 * @return {object} middleware
 */
apiware.api = function api(options={}) {
    let site = this;
    let scribble = this.scribe;
    let db = options.database ? (typeof options.database=='string' ? site.db[options.database] : new jxDB(options.database)) : site.db.site;
    if (!db) scribble.fatal('Required database NOT defined for Homebrew API middleware!');
    scribble.trace(`Homebrew API middleware configured to use ${db.file} database.`);
    scribble.info(`Homebrew API middleware initialized with route '${options.route}'...`);
    return async function apiCW(ctx) {
        scribble.trace(`route[${ctx.routing.route.method}]: ${ctx.routing.route.route}`);
        switch (ctx.request.params.prefix) {
            case '$': return await (ctx.verbIs('get') ? inquire.call(site,db,ctx) : ctx.verbIs('post') ? cache.call(site,db,ctx) : null);
            case '@':   // built-in actions
                if (ctx.request.method!=='post') throw 405;
                switch (ctx.request.params.recipe) {
                    case "grant": return await grant.call(site,ctx);
                    case "scribe": return scribeMask.call(site,ctx);
                    case "mail": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendMail.call(site,ctx.request.body||{});
                    case "text": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendText.call(site,ctx.request.body||{});
                    case "twilio": return new ResponseContext('xml',Buffer.from(twilio.call(site,ctx)));
                };
            case '!':
                if (ctx.request.method!=='get') throw 405;
                return info.call(site,ctx);
            default: 
                return await ctx.next();
        };
    };
};

// Export functions...
module.exports = apiware;