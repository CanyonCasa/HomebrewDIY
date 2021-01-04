/***
 * @module apiware.js
 * This modules provides an endpoint handler for the homebrew API.
 * (c) 2020 Enchanted Engineering, MIT license
 * The app.js file conditionally loads this file and treats all exported functions as middleware
 * It can be ueed as is or as a skeleton for user customizable API. 
 * @example
 *   const cw = require('./apiware');
 */


///*************************************************************
/// Dependencies...
///*************************************************************
const { asList, jxCopy, jxSafe, verifyThat } = require('./helpers');
const { analytics, auth: {genCode}, mail, sms, statistics } = require('./workers');  
const { ResopnseContext } = require('./serverware');
const jxDB = require('./jxDB');


///*************************************************************
/// declarations...
var apiware = {};               // serverware middleware container    
let args, db, scribble, site;   // module globals


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
    if (!('users' in site.db)) throw 501;
    if (!ctx.authorize('grant')) throw 401;
    let user = asList(args.user || args.opts[0] || '');
    let exp = ((e)=>e>10080 ? 10080 : e)(args.exp || args.opts[1] || 30); // limited expiration in min; self-executing function
    let byMail = args.mail || args.opts[1];
    let ft = (t,u)=>{return u=='d' ? (t>7?7:t)+' days' : u=='h' ? (t>24?ft(t/24,'d'):t+' hrs') : t>60? ft(t/60,'h') : t+' mins'};
    let expStr = ft(exp);
    let contacts = site.db.users.query('contacts',{ref:'.*'});
    return new Promise((resolve,reject)=>{
        Promise.all(user.map(u=>{
            if (!contacts[u]) return {};
            let passcode = genCode(7,36,exp);
            site.chgUser(u,{credentials:{ passcode: passcode}});
            let msg =`${ctx.user.username} granted access to...\n  user: ${u}\n  passcode: ${passcode.code}\n  valid: ${expStr}`;
            return byMail ? sendMail({to: contacts[u].email, time:true,text:msg}) : 
              sendText({to: contacts[u].phone, time:true,text:msg});
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
    if (raw==='::1') raw = '::127.0.0.1';
    let v4 = raw.replace(/:(.*):([\d.]+)/,($0,$1,$2)=>$1?$2:'127.0.0.'+$2);
    let v6 = (v4!=raw) ? raw : "0:0:0:0:0:0:0:0";
    let dx = new Date().style();
    let iot = { ip: v4, time: dx.e, iso: dx.iso };
    let internals = ok ? { stats: statistics.get(), analytics: analytics.get() } : {};
    let full = internals.mergekeys({ ip: {raw: raw, v4: v4, v6: v6, port: port}, date: dx });
    return (ctx.request.params.recipe!=='iot') ? full : iot;
};

/**
 * @function mask gets or sets scribe mask level to control level of detail transcripted
 * @param {object} ctx request context
 * @return {object} current mask level
 */
function mask(ctx) {
    let mask = scribble.maskLevel(ctx.authorize('server') ? args.level||args.opts[0] : '');
    return {msg: `Scribe mask: ${mask}, mask: ${mask}`};
};

/**
 * @function sendMail site specific preprocessor to translate user identities into valid email addresses
 * @param {object} msg email message containing text and identities to which it is sent
 * @return {object} a report summary 
 */
async function sendMail(msg) {
    if (!('users' in site.db)) throw 501;
    let addressBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.email);
    let letter = {id: msg.id, time: msg.time, subject: msg.subject, hdr: msg.hdr, text: msg.text, body: msg.body, html: msg.html};
    ['to','cc','bcc'].forEach(addr=>{  // resolve email addressing
       let tmp = msg[addr] instanceof Array ? msg[addr] : typeof msg[addr]=='string' ? msg[addr].split(',') : [];
       tmp = tmp.map(a=>a.includes('@')?a:addressBook[a]).filter(a=>a).filter((v,i,a)=>v && a.indexOf(v)===i).join(',');
       if (tmp) letter[addr] = tmp;
    });
    if (msg.from) letter.from = msg.from.includes('@')?msg.from:addressBook[msg.from];
    return await mail(letter);
};

/**
 * @function sendText site specific preprocessor to translate user identities into valid phone numbers
 * @param {object} msg text message containing text and identities to which it is sent
 * @return {object} a report summary and queue details 
 */
async function sendText(msg) {
    if (!('users' in site.db)) throw 501;
    let phoneBook = site.db.users.query('contacts',{ref:'.+'}).mapByKey(v=>v.phone);
    let text = { callback: msg.callback, id: msg.id || '' };    // format optional header with id and/or time
    text.timestamp = msg.time ? '['+new Date().toISOString()+']' : '';
    text.body = (msg.hdr || ((text.id||text.timestamp) ? text.id+text.timestamp+':\n' : '')) + msg.text;
    // map recipients, group or to "users and/or numbers" to prefixed numbers...
    let list = [msg.recipients,msg.group,msg.to].map(g=>(g||'').toString()).filter(n=>n).join(',').split(',');
    text.numbers = list.map(n=>isNaN(n)?phoneBook[n]:n).filter(n=>n);
    return await sms(text);
};

/**
 * @function twilio handles Twilio status callback messages as well as no reply responses
 * @param {object} rpt Twilio message report data (JSON)
 * @return {string} XML response data
 */
function twilio(rpt) {
    if (args.opts[0]!=='status') return "<Response><Message>No one receives replies to this number!</Message></Response>";
    if (rpt.MessageStatus=='undelivered') {
        let notice = `Message to ${rpt.To} failed, ref: ${rpt.MessageSid}`;
        scribble.warn(`Action[twilio]: ${notice}`);
        sms({contact: args.opts[1], text: notice})
          .then(data=>{ scribble.log(`Twilio callback made to ${args.opts[1]} for ${rpt.MessageSid}`); })
          .catch(err=>{ scribble.error("Action[twilio] ERROR: %s", err); }); 
    };
    return "<Response></Response>";
};

async function inquire(ctx) {
    let recipe = db.lookup(args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) return null;
    if (recipe.auth && !ctx.authorize(recipe.auth)) throw 401;  // check auth
    let bindings = verifyThat(ctx.request.query,'isNotEmpty') ? ctx.request.query : ctx.request.params.opts||[];
    return db.query(recipe,jxSafe(bindings,recipe.filter||'*'));   // query db
};

async function cache(ctx) {
    let recipe = db.lookup(args.recipe||'');    // get recipe
    if (verifyThat(recipe,'isEmpty')) return null;
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
    site = this;
    scribble = this.scribe;
    db = options.db ? (typeof options.db=='string' ? site.db[options.db] : new jxDB(options.db)) : site.db.site;
    if (!db) scribble.fatal('Required database NOT defined for Homebrew API middleware!');
    scribble.trace(`Homebrew API middleware configured to use ${db.file} database.`);
    scribble.info(`Homebrew API middleware initialized with route '${options.route}'...`);
    return async function apiCW(ctx) {
        args = {opts:[]}.mergekeys(ctx.request.params).mergekeys(ctx.request.query);
        scribble.trace("args:",args,ctx.request.params,ctx.request.query);
        switch (ctx.request.params.prefix) {
            case '$': return await (ctx.verbIs('get') ? inquire(ctx) : ctx.verbIs('post') ? cache(ctx) : null);
            case '@':   // built-in actions
                switch (ctx.request.params.recipe) {
                    case "grant": return await grant(ctx);
                    case "scribe": return mask(ctx);
                    case "mail": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendMail(ctx.request.body||{});
                    case "text": 
                        if (!ctx.authorize('contact')) throw 401;
                        return await sendText(ctx.request.body||{});
                    case "twilio": return new ResopnseContext('xml',Buffer.from(twilio(ctx.request.body||{})));
                };
            case '!':
                if (ctx.request.method!=='get') throw 400;
                return info(ctx);
            default: 
                return await ctx.next();
        };
    };
};

// Export functions...
module.exports = apiware;