/*

jxDB.js: Simple JSON based database using JSONata query tool
(c) 2020 Enchanted Engineering, Tijeras NM.; created 20200512 by CanyonCasa

usage:
  const jxDB = require('./jxDB');
  var db = new jxDB(def,data);

configuration object properties...
  file:         Database file name, default '_memory_'
  delay:        Cache delay time for saving changes to file, default 1000ms
  format:       'pretty' or undefined
  readonly:     Flag to prevent writing to database.
  tag:          reference tag for transcript messages
data...
  {...}       Optional object to populate database. 
                Primary keys represent collections (tables)
                Records (rows) consist of objects or arrays

NOTES:
  1.  Database is always an object.
  2.  When the configuration does not define a file, the database exists only in memory.
  3.  Assumes sanitized data, that is, data sanitizing handled externally
  4.  Collections may be arrays of objects or arrays of arrays.
  6.  Intended for small memory-based (synchronous) responses such as small number of users accounts.

*/

require('./Extensions2JS');
const fs = require('fs');
const fsp = fs.promises;
const jsonata = require('jsonata');
const { jxCopy, jxFrom, jxTo, jxSafe, verifyThat } = require('./helpers');
const { Scribe } = require('./workers');

function jxDB(def={},data) {
    this.file = def.file || '_memory_';         // JSON DB filespec
    this.inMemory = this.file == '_memory_';    // memory base database flag
    this.format = def.format;                   // pretty or undefined
    this.readOnly = !!def.readOnly;             // flag for inhibiting saves
    this.delay = def.delay || 1000;             // save delay
    this.timex = null;                          // save delay timeout timer reference
    this.scribble = Scribe(def.tag||'db');      // transcripting reference
    if (this.file && !this.inMemory && !data) {
        try {
            this.db = JSON.parse(fs.readFileSync(this.file,'utf8'));
        } catch (e) { throw `ERROR loading database ${this.file}`};
        for (let k of ['format','readOnly','delay']) this[k] = this.db['_'].cfg[k]; // restore saved db cfg to locals
        this.watchDB(def.watch!==false);
    } else {
        this.db = data || {'_':{cfg: {}, recipes:{}}};
        for (let x of ['format','readOnly','delay']) this.db['_'].cfg[x] = this.db['_'].cfg[x] || this[x];  // copy cfg to db
    };
    this.scribble.debug(`Database ${def.tag} successfully initialized...`)
};

// re-load database file into memory.
jxDB.prototype.reload = async function reload() {
    try {    
        let source = await fsp.readFile(this.file,'utf8');
        this.db = jxTo(source);
        for (let k of ['format','readOnly','delay']) this[k] = this.db['_'].cfg[k];     // restore saved db cfg to locals
        this.scribble.info(`jxDB.load successful: ${this.file}`);
    } catch (e) { this.scribble.warn(`jxDB.load failed: ${this.file} --> ${e.toString()}`) };
};

// watch for external changes
jxDB.prototype.watchDB = function watchDB(enable) {
    this.watchInhibited = false;
    if (!enable) return this.watcher ? this.watcher.close() : null;
    let self = this;
    let watchWait = null;
    this.watcher = fs.watch(this.file,evt=>{
        if (self.watchInhibited) return;
        if (evt=='change') {
            clearTimeout(watchWait);
            watchWait = setTimeout(function(){self.reload().then(x=>{ self.watchInhibited = false; }).catch(e=>{});}, 500);
        };
    });
};

// save the database 
jxDB.prototype.save = function save() {
    if (this.inMemory || this.readOnly) return;
    this.watchInhibited = true;
    var data = JSON.stringify(this.db,null,this.format=='pretty'?2:undefined);
    fsp.writeFile(this.file,data)
        .then(x=>{ this.scribble.trace(`jxDB.save successful: ${this.file}`); this.watchInhibited = false; })
        .catch(e=>{ this.scribble.error(`jxDB.save failed: ${this.file} --> ${e.toString()}`); });
};

// queue the database to be saved...
jxDB.prototype.changed = function changed() {
    clearTimeout(this.timex);
    this.timex = setTimeout(()=>{this.save();},this.delay);
};

// set or return schema
jxDB.prototype.schema = function schema(s) { if (s) this.db['_'] = s; return Object.assign({},this.db['_']); };

// returns a list of currently defined collection names...
jxDB.prototype.collections = function collections() { return Object.keys(this.db).filter(k=>k!='_'); };

// lookup a recipe by name
jxDB.prototype.lookup = function lookup(recipeName) {
    return Object.assign({},jsonata(`_.recipes[name="${recipeName}"]`).evaluate(this.db)||{});
};

// simple database query...
// recipeSpec defines recipe.name or actual recipe object
// bindings represent optional recipe expression substitutions or null
// returns data or undefined (no recipe) or null, but never error condition...
jxDB.prototype.query = function query(recipeSpec, bindings=null) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    let dflt = recipe.defaults!==undefined ? recipe.defaults : {};
    if (!recipe.expression) {   // precheck verifies required recipe fields...
        this.scribble.trace("jxDB.query ERROR: bad recipe, failed precheck -- no expression!:",recipeSpec); 
        return dflt;      
    };
    try {
        let tmp = jsonata(recipe.expression).evaluate(this.db,bindings);
        if (verifyThat(tmp,'isNotDefined')) return dflt;
        tmp = jxCopy(tmp);  // workaround -> returns by reference without this!
        if (tmp instanceof Array) {
            let lmt = recipe.limit || 0;
            if (lmt && (tmp.length>Math.abs(lmt))) tmp = (lmt<0) ? tmp.slice(lmt) : tmp.slice(0,lmt);
            if (recipe.header) tmp.unshift(recipe.header);
        };
        return tmp;
    } catch (e) {
        this.scribble.log(`jxDB.query ERROR: ${typeof e=='object'?e.message:e.toString()}`); 
        return dflt;
    };
};

// simple database edit...
// recipeSpec defines recipe.name or actual recipe object
// data defines an array of objects/arrays in form 
//   [{ref:<value>, record:<record_object>},...] or [[<value>,<record_object>],...], where
//   ref refers to unique matching value for an existing entry based on recipe 'unique' lookup; null for new entry
//   record refers to data to be saved, undefined/null to delete record; 
//   note: update performs a full record replacement after merge with defaults and existing record,
// returns array of acctions taken for each entry...
jxDB.prototype.modify = function modify(recipeSpec, data) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    let results = []; // always an array
    if (!recipe.collection || !recipe.reference) {  // precheck verifies required recipe fields...
        this.scribble.log("jxDB.modify ERROR: bad recipe, failed precheck -- no collection or reference!:",recipeSpec); 
        return results;      
    };
    if (!verifyThat(data,'isArrayOfAnyObjects')) return results;
    try {
        let defaults = recipe.defaults || {};
        for (let d of data) {
            let ref = d.ref || d[0] || null;
            let record = d.record || d[1] || null; 
            if (ref===null && record===null) {      // bad request if no ref AND no record
                results.push(["bad",null,null]);   
            } else {                                // new, update, or delete request
                let existing = (ref!==null) && jsonata(recipe.reference).evaluate(this.db,{ref:ref}) || {index: null, record: {}};
                if (record) {
                    // a new entry--assumes unique record that does not exist since no reference to lookup 
                    let newRecord = jxCopy(defaults).mergekeys(existing.record).mergekeys(record);
                    if (existing.index===null) {    // add new record
                        // unique should return a unique index value for collection and key it applies to such as id, tag, 0
                        let unique = recipe.unique ? jsonata(recipe.unique).evaluate(this.db) : {};
                        if ('key' in unique) newRecord[unique.key] = unique.value;
                        this.db[recipe.collection].push(newRecord);
                        results.push(["add",unique.value||null,this.db[recipe.collection].length-1]);
                    } else {  // change existing record
                        this.db[recipe.collection][existing.index] = newRecord;
                        results.push(["change",ref,existing.index]);
                    };
                } else {    // no record, so delete index
                    if (existing.index!==null) {    // existing record was found
                        this.db[recipe.collection].splice(existing.index,1); // delete record
                        results.push(["delete",ref,existing.index]);
                    } else {
                        results.push(["nop",ref,null]);   // delete non-existing record?
                        continue;
                    };
                };
                this.changed(); // flag changes for save
            };
        };
    } catch(e) { 
        let msg = typeof e=='object' ? e.message:e.toString(); 
        this.scribble.error("jxDB.modify ERROR: ",msg); 
        results.push(['error',ref,msg])
    };
    return results; // array of actions and references for each data record.
};


module.exports = jxDB;
