/*

jxDB.js: Simple JSON based database using JSONata query tool
(c) 2020 Enchanted Engineering, Tijeras NM.; created 20200512 by CanyonCasa

usage:
  const jxDB = require('./jxDB');
  var db = new jxDB(def,data);

configuration object properties...
  file:         Database file name, default '_memory_'
  delay:        Cache delay time for saving changes to file, default 1000ms
  format:       'tabular' (default), 'pretty' or undefined
  readonly:     Flag to prevent writing to database.
  tag:          reference tag for transcript messages
data...
  {...}       Optional object to populate database. 
                Primary keys represent collections (tables)
                Records (rows) consist of objects or arrays

NOTES:
  1.  Database is always an object; speicifically, an array of objects or arrays.
  2.  When the configuration does not define a file, the database exists only in memory.
  3.  Assumes sanitized data, that is, data sanitizing handled externally
  4.  Collections may be arrays of objects or arrays of arrays.
  6.  Intended for small memory-based (synchronous) responses such as small number of users accounts.

*/

require('./Extensions2JS');
const fs = require('fs');
const fsp = fs.promises;
const jsonata = require('jsonata');
const { jxCopy, jxTo, printObj, verifyThat } = require('./helpers');
const { Scribe } = require('./workers');

function jxDB(def={},data) {
    let dd = {'_':{}, recipes:{}}.mergekeys(data || {});        // default database definition; '_' collection hold cfg...
    dd['_'].format = def.format || dd['_'].format || 'tabular'; // database storage format: pretty, tabular, undefined
    dd['_'].delay = def.delay || dd['_'].delay || 1000;         // database write delay

    var privateDB = dd;     // "private" data container to hide db from direct access
    var writeable = true;
    this.file = def.file || '_memory_';                         // JSON DB filespec
    this.readOnly = (enable) => { if (enable!==undefined) writeable = !enable; return writeable; };
    this.readOnly(def.readOnly);
    this.timex = null;                                          // saves delay timeout timer reference
    this.scribble = Scribe(def.scribe||def.tag||'db');          // transcripting reference

    if ((this.file!=='_memory_') && !data) {
        try {
            let source = fs.readFileSync(this.file,'utf8');
            privateDB = jxTo(source,privateDB);
        } catch (e) { throw `ERROR loading database ${this.file}: ${e}`};
        this.watchDB(def.watch!==false);
    };

    // private database interface... (assumes valid args based on internal only calls!)
    this.db = function(collection, index, value) {
        if (collection===undefined) return privateDB;           // getter
        console.log('collection:',collection);
        if (collection && collection instanceof Object) { 
            if ('source' in collection) {                       // setter
                privateDB = collection.source;
            } else {
                privateDB.mergekeys(collection);                // set/add a collection
            };
        return privateDB;
        };
        
        // single entry change
        if (index===null) {
            privateDB[collection].push(value);      // new entry
        } else if (value===undefined) {
            privateDB[collection].splice(index,1);    // empty record, delete entry
        } else {
            privateDB[collection][index] = value;     // update entry
        };
        return privateDB[collection][index];
    };

    this.scribble.debug(`Database ${def.tag} successfully initialized...`)
};

// re-load database file into memory.
jxDB.prototype.reload = async function reload() {
    try {    
        let source = await fsp.readFile(this.file,'utf8');
        this.db({source: jxTo(source)});
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
    function tabulate(db) { // formats db in a tabular layout of 1 row per object 
        let tables = Object.keys(db);
        let tArray = (n) => db[n] instanceof Array;  // table is Array
        let leader = (n) => `  "${n}": ${tArray(n) ? '[':'{'}\n`;
        let trailer = (n) => `  ${tArray(n) ? ']':'}'},\n`;
        let jx = '{\n';
        tables.forEach(n=>{
            jx += leader(n);
            if (tArray(n)) {
                let items = db[n].map(i=>`    ${JSON.stringify(i)}`);
                jx += items.join(',\n') + '\n';
            } else {
                let rows = Object.keys(db[n]).map(k=>`    "${k}": ${JSON.stringify(db[n][k])}`);
                jx += rows.join(',\n') + '\n';
            };
            jx += trailer(n);
        });
        return jx.slice(0,-2) + '\n}';
    };
    if ((this.file=='_memory_') || this.readOnly()) return;
    this.watchInhibited = true;
    let frmt = this.db()['_'].format;
    var data = frmt=='tabular' ? tabulate(this.db()) : JSON.stringify(this.db(),null,frmt=='pretty'?2:undefined);
    fsp.writeFile(this.file,data)
        .then(x=>{ this.scribble.trace(`jxDB.save successful: ${this.file}`); this.watchInhibited = false; })
        .catch(e=>{ this.scribble.error(`jxDB.save failed: ${this.file} --> ${e.toString()}`); });
};

// queue the database to be saved...
jxDB.prototype.changed = function changed() {
    clearTimeout(this.timex);
    this.timex = setTimeout(()=>{this.save();},this.db()['_'].delay);
};

// set or return schema
jxDB.prototype.schema = function schema(s) { if (s) this.db()['_'] = s; return Object.assign({},this.db()['_']); };

// returns a list of currently defined collection names...
jxDB.prototype.collections = function collections() { return Object.keys(this.db()).filter(k=>k!='_'); };

// lookup a recipe by name
jxDB.prototype.lookup = function lookup(recipeName) {
    return Object.assign({},jsonata(`recipes[name="${recipeName}"]`).evaluate(this.db())||{});
};

// simple database query...
// recipeSpec defines recipe.name or actual recipe object
// bindings represent optional recipe expression substitutions or null
// returns data or undefined (no recipe) or null, but never error condition...
jxDB.prototype.query = function query(recipeSpec, bindings=null) {
    let recipe = typeof recipeSpec=='string' ? this.lookup(recipeSpec) : recipeSpec; // pass recipe object or name
    let dflt = recipe.defaults!==undefined ? recipe.defaults : {};
    if (!recipe.expression) {   // precheck verifies required recipe fields...
        this.scribble.trace("jxDB.query ERROR: bad recipe precheck -- no expression!:",printObj(recipeSpec)); 
        return dflt;      
    };
    try {
        let tmp = jsonata(recipe.expression).evaluate(this.db(),bindings);
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
    this.scribble.trace(`MODIFY: ${JSON.stringify(recipe)}`);
    if (!recipe.collection || !this.db()[recipe.collection]) {  // precheck verifies required recipe fields...
        this.scribble.log("jxDB.modify ERROR: bad recipe precheck -- no collection defined!:",printObj(recipeSpec)); 
        return results;      
    };
    if (!verifyThat(data,'isArrayOfAnyObjects')) {
        this.scribble.trace(`ERROR: modify expects an array of objects: ${printObj(data)}`);
        return results;
    };
    try {
        let defaults = recipe.defaults || {};
        for (let d of data) {
            let ref = d.ref || d[0] || null;
            let record = d.record || d[1] || null;
            this.scribble.trace(`ref: ${ref}, record: ${printObj(record)}, type: ${typeof record}`);
            if (ref===null && record===null) {      // bad request if no ref AND no record
                results.push(["bad",null,null]);   
            } else {                                // new, update, or delete request
                let existing = ((ref!==null) && recipe.reference && jsonata(recipe.reference).evaluate(this.db(),{ref:ref})) || 
                  {index: null, record: defaults};
                this.scribble.trace(`existing: ${printObj(existing)}`);
                if (record) {
                    // a new entry--assumes unique record that does not exist since no reference to lookup 
                    let newRecord = jxCopy(defaults).mergekeys(existing.record).mergekeys(record);
                    if (existing.index===null) {    // add new record
                        // unique should return a unique index value for collection and key it applies to such as id, tag, 0
                        let unique = recipe.unique ? jsonata(recipe.unique).evaluate(this.db()) : {};
                        if ('key' in unique) newRecord[unique.key] = unique.value;
                        this.scribble.trace(`new record: ${printObj(newRecord)}`);
                        this.db(recipe.collection,null,newRecord);
                        results.push(["add",unique.value||null,this.db()[recipe.collection].length-1]);
                    } else {  // change existing record
                        this.db(recipe.collection,existing.index,newRecord);
                        this.scribble.trace(`change record: ${printObj(newRecord)}`);
                        results.push(["change",ref,existing.index]);
                    };
                } else {    // no record, so delete index
                    if (existing.index!==null) {    // existing record was found
                        this.db(recipe.collection,existing.index); // delete record
                        this.scribble.trace(`delete record: ${existing.index}`);
                        results.push(["delete",ref,existing.index]);
                    } else {
                        this.scribble.trace(`nop: ${ref}`);
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
