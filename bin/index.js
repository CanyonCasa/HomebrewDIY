/*
index.js: HomebrewDIY implements a multi-domain (i.e. multiple hostnames or domains) scratch homebrew web hosting server 
issued: 20201025 by CanyonCasa, (c)2020 Enchanted Engineering, Tijeras NM.

Sets up a small multi-domain (~1-6 each) NodeJS based web hosting service providing site-specific custom apps for webs, 
blogs, sockets, etc. Similar to other Homebrew projects with simpler configuration requirements. This version, written from 
scratch, has no required dependencies besides NodeJS (exceptions being only optional support for Twilio SMS and email services).

HomebrewDIY implements "async" middleware for simplified processing that includes static serving, "recipe'based" endpoints for  
retrieval of data ($<recipe>), actions (@<action>), and information (!<info>). (See HomebrewDIYAPI for details.) For example,
  https://example.net/$snowfall   Recipe driven database query/modify
                                  including Extensible JSON format
  https://example.net/@text       Specific actions such as sending text
  https://example.net/!ip         Server/Client (internal) information

HomebrewDIY CMS provides a supporting content management system.

This script ...
  1. Configures server (AKA global or top level) shared context and services such as transcripting
  2. Configures and starts individual "site" apps/services
  3. Configures and starts reverse proxies to redirect requests to respective sites

SYNTAX:
  node index [<configuration_file>]
  NODE_ENV=production node index [<configuration_file>]
  NODE_ENV=production forever node index [<configuration_file>]
  
  where <configuration_file> defaults to ../restricted/config[.js or .json]
*/

// load external dependencies...
require('./Extensions2JS');                         // personal library of additions to JS language
// read the server configuration from (cmdline specified arg or default) JS or JSON file ...
const cfg = require(process.argv[2] || '../restricted/config');
const jxjDB = require('./jxjDB');                     // JSON database module
const helpers = require('./helpers');               // utility helper functions
const workers = require('./workers')(cfg.workers);  // server workers
const scribe = workers.Scribe('DIY');               // server transcripting worker

// message identifiers...
const VERSION = cfg.$VERSION || '?'; // default to filestamp as version identifier
const HOST = cfg.$HOST || '???'; // identifier for messages
const MODE = process.env.NODE_ENV||'development';
scribe.info(`HomebrewDIY[${VERSION}] setup on '${HOST}' in '${MODE}' mode...`);

// configure server context passed to sites...
let server = {};

// load server level databases...
server.db = cfg.databases.mapByKey((def,tag)=>{
    scribe.trace(`Creating and loading '${tag}' database (file: ${def.file}) ...`);
    let db = new jxjDB(def);
    db.load()
        .then(x=>scribe.debug(`Server '${tag}' database loaded successfully!`))
        .catch(e=>{scribe.fatal(`Server '${tag}' database load error!`,e)});
    return db;
});

// default headers; configured {"x-powered-by" header overrides builtin...
server.headers = {"x-powered-by": "Raspberry Pi HomebrewDIY NodeJS Server "+VERSION}.mergekeys(cfg.headers)

// filter any sites listed as served by proxy from cfg that lack a site specific configuration
let cfgdSites = Object.keys(cfg.sites);
let proxiedSites = []; cfg.proxies.mapByKey(p=>proxiedSites=[...proxiedSites,...p.sites]);
let activeSites = cfg.proxies.mapByKey(p=>p.sites).mapByKey(v=>v.filter(s=>s in cfg.sites));    // object, sites by proxy
cfgdSites.filter(s=>!proxiedSites.includes(s)).forEach(s=>scribe.warn(`Site '${s}' configured but not proxied! `));
proxiedSites.filter(s=>!cfgdSites.includes(s)).forEach(s=>scribe.warn(`Site '${s}' proxied but not configured - removed!`));
activeSites.mapByKey((x,p)=>x.forEach(s=>scribe.info(`Site '${s}' configured and proxied by ${p}!`)));

// backends need to start before proxies...
// prep each site configuration and start app for each proxied site that's defined...
scribe.info("HomebrewDIY site setups...");
activeSites.mapByKey((sites,proxy)=>{
    sites.map(s=>{
        let scfg = cfg.sites[s]; // site configuration shorthand reference
        scfg.tag = scfg.tag || s; // ensure site configuration tag default (i.e. transcript reference)
        let context = { cfg: scfg, proxy: proxy, secure: !!cfg.proxies[proxy].ssl, server: server, tag: scfg.tag };
        scribe.debug(`Creating ${context.secure?'':'in'}secure site ${s} ...`);
        /* site startup goes here */
        scribe.info(`Site[${scfg.tag}]: initialized, hosting ${scfg.host}:${scfg.port}`);
    });
});

// define and start reverse proxy servers...
scribe.info("HomebrewDIY proxy setup...");
Promise.all(Object.keys(activeSites).map(p=>{
    let pcfg = cfg.proxies[p];  // shorthand reference
    let tag = pcfg.tag || p;    // default tag to index value.
    scribe.debug(`Creating proxy[${tag}] context...`);
    let routes = pcfg.routes || {};  // default routes
    activeSites[p].forEach(s=>{ // dynamically generate active site specific routes...
        let route = {host: cfg.sites[s].host, port: cfg.sites[s].port||(pcfg.ssl?443:80)};
        (cfg.sites[s].aliases||[]).forEach(a=>{ routes[a] = route; 
            scribe.debug(`Proxy[${p}] route added: ${a} --> ${route.host}:${route.port}`);});
    });
    return workers.Proxy(tag,pcfg,routes); }))
    .then(x=>{
        workers.statistics.set('$server','host',HOST);
        workers.statistics.set('$server','start',new Date().toISOString());
        workers.statistics.set('$server','mode',MODE);
        if (MODE=='production') workers.sms({text:`HomebrewDIY Server started on host ${HOST}`})
          .catch(e=>{console.log('sms failure!:',e); });
        scribe.info("HomebrewDIY setup complete...");
    })
    .catch(e=>{scribe.fatal(e)});
