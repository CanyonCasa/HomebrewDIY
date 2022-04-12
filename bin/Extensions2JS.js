/**
 * @module Extensions2JS
 * 
 * Personal JavaScript language extensions...
 * (c) 2020 Enchanted Engineering, MIT license
 * All code in this module directly modifies JavaScript primitives, as such, the module has no exports
 * This module only needs loaded once per application
 * 
 * @example
 *     require('./Extensions2JS');
 */


///*************************************************************
/// Date Style Extension ...
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DSTYLE = /Y(?:YYY|Y)?|S[MDZ]|0?([MDNhms])\1?|[aexz]|(['"])(.*?)\2/g;  // Date.prototpye.style parsing pattern
if (!Date.prototype.style) 
/**
 * @lends Date#
 * @function style extends Date object defining a function for creating formated date strings
 * @param {string|'iso'|'form'} format - output format
 *  format string meta-characters...
 *  Y:          4 digit year, i.e. 2016
 *  M:          month, i.e. 2
 *  D:          day of month, i.e. 4
 *  N:          day of the week, i.e. 0-6
 *  SM:         long month name string, i.e. February
 *  SD:         long day name string, i.e. Sunday
 *  LY:         leap year flag, true/false (not usable in format)
 *  h:          hour of the day, 12 hour format, unpadded, i.e. 9
 *  hh:         hour of the day, 24 hour format, padded, i.e. 09
 *  m:          minutes part hour, i.e. 7
 *  s:          seconds past minute, i.e. 5
 *  x:          milliseconds, i.e. 234
 *  a:          short meridiem flag, i.e. A or P
 *  z:          short time zone, i.e. MST
 *  e:          Unix epoch, seconds past midnight Jan 1, 1970
 *  dst:        Daylight Savings Time flag, true/false (not usable in format)
 *  ofs:        Local time offset (not usable in format)
 *  'text':     quoted text preserved, as well as non-meta characters such as spaces
 *  defined format keywords ...
 *    'form':   ["YYYY-MM-DD","hh:mm:ss"], needed by form inputs for date and time (defaults to local realm)
 *    'http':   HTTP Date header format, per RFC7231
 *    'iso':    "YYYY-MM-DD'T'hh:mm:ssZ", JavaScript standard
 *    'stamp:   filespec safe timestamp string, '20161207T21-22-11Z'
 *  notes:
 *    1. Add a leading 0 or duplicate field character to pad result as 2 character field [MDNhms], i.e. 0M or MM
 *    2. Use Y or YYYY for 4 year or YY for 2 year
 *    3. An undefined or empty format returns an object of all fields
 * @param {'local'|'utc'} realm - flag to adjust input time to local or UTC time before styling
 *    'local':  treats input as UTC time and adjusts to local time before styling (default)
 *    'utc':    treats input as local time and adjusts to UTC before styling
 *    undefined:    leaves time unchanged, unless frmt = 'form', which assumes local
 * @return {string} - date string formatted as specified
 * 
 * @example...
 *    d = new Date();      // 2016-12-07T21:22:11.262Z
 *    d.style();           // { Y: 2016, M: 12, D: 7, h: 21, m: 22, s: 11, x: 262, z: 'MST', e:1481145731.262, a:'PM', N:3, 
 *                              SM: 'December', SD: 'Wednesday', SZ: 'Mountain Daylight Time', LY:true, dst:false, ofs: -420 }
 *    d.style().e;         // 1481145731.262
 *    d.style("MM/DD/YY"); // '12/07/16'
 *    d.style('hh:mm:ss','local')  // '14:22:11', adjusts UTC input time (d) to local time (e.g. h = 22 - 7 = 14 )
 *    d.style('hh:mm:ss','utc')    // '04:22:11', treats input time as local and adjusts to UTC (e.g. h = 21+7 % 24 = 4)
 *    d.style('SD, DD SM YYYY hh:mm:ss "GMT"').replace(/[a-z]{4,}/gi,($0)=>$0.slice(0,3))   
 *      // HTTP header date, RFC7231: 'Wed, 07 Dec 2016 21:22:11 GMT'
 *          
 */
Date.prototype.style = function(frmt,realm) {
    let sign = (realm || frmt=='form') ? (String(realm).toLowerCase()=='utc' ? -1 : 1) : 0; // to utc, to local, or no change
    let dx = sign ? new Date(this-sign*this.getTimezoneOffset()*60*1000) : this;
    let zone = dx.toString().split('(')[1].replace(')','');
    let zx = zone.replace(/[a-z ]/g,'');
    let base = dx.toISOString();
    switch (frmt||'') {
        case 'form': return dx.style('YYYY-MM-DD hh:mm').split(' ');            // values for form inputs
        case 'http': return dx.style('SD, DD SM YYYY hh:mm:ss "GMT"').replace(/([a-z]{3})[a-z]+/gi,'$1');
        case 'iso': return (realm && sign==1) ? base.replace(/z/i,zx) : base;   // ISO (Zulu time) or ISO-like localtime
        case 'stamp': return dx.style(`YMMDDThh-mm-ss${(realm && sign==1)?'z':'Z'}`);   // filespec safe timestamp
        case '':  // object of date field values
            let [Y,M,D,h,m,s,ms] = base.split(/[\-:\.TZ]/);
            return { Y:+Y, M:+M, D:+D, h:+h, m:+m, s:+s, x:+ms, z:zx, e:dx.valueOf()*0.001, a:h<12 ?"AM":"PM", N:dx.getDay(),
                SM: MONTHS[M-1], SD: DAYS[dx.getDay()], SZ:zone, LY: Y%4==0&&(Y%100==Y%400), ofs: -dx.getTimezoneOffset(),
                dst: !!(new Date(1970,1,1).getTimezoneOffset()-dx.getTimezoneOffset()), iso: dx.toISOString() };
        default:  // any format string
            let pad = (s) => ('0'+s).slice(-2);
            let tkn = dx.style(); tkn['YYYY']=tkn.Y; tkn['hh']=('0'+tkn['h']).substr(-2); if (tkn['h']>12) tkn['h']%=12;
            return (frmt).replace(DSTYLE,$0=>$0 in tkn ? tkn[$0] : $0.slice(1) in tkn ? pad(tkn[$0.slice(1)]) : $0.slice(1,-1));
    };
};

///*************************************************************
/// Object Extensions...
/**
 * @function filterByKey object equivalent of Array.prototype.filter - calls user function with value, key, and source object
 * @memberof Object
 * @param {function} f - function called for each object field
 * @return {{}} - Modified object (does not mutate input unless filterFunc does)
 * @info result will reference source object if value is an object
  */
 if (!Object.filterByKey) Object.defineProperty(Object.prototype,'filterByKey', {
    value: 
        function(f) {
            let [ obj, tmp ] = [ this, {} ];
            for (let key in obj) if (f(obj[key],key,obj)) tmp[key] = obj[key];
            return tmp;
        },
    enumerable: false
});

/**
 * @function mapByKey object equivalent of Array.prototype.map - calls user function with value, key, and source object
 * @memberof Object
 * @param {function} f - function called for each object field
 * @return {{}} - Modified object (does not mutate input unless mapFunc does)
 * @info result will reference source object if value is an object
  */
 if (!Object.mapByKey) Object.defineProperty(Object.prototype,'mapByKey', {
    value: 
        function(f) {
            let [ obj, tmp ] = [ this, {} ];
            for (let key in obj) tmp[key] = f(obj[key],key,obj);
            return tmp;
        },
    enumerable: false
});

/**
 * @function mergekeys recursively merge keys of an object into an existing object with merged object having precedence
 * @param {{}} merged - object merged into source object, MUST NOT BE CIRCULAR!
 * @return {{}} - object representing merger of source and merged (mutates source, but has no reference to merged) 
 */ 
if (!Object.mergekeys) Object.defineProperty(Object.prototype,'mergekeys', {
    value: 
        function(merged={},except=[]) {
            const isObj = (obj) => (typeof obj==='object') && (obj!==null) && !(obj instanceof RegExp);
            if (isObj(merged)) {
                Object.keys(merged).filter(k=>!except.includes(k)).forEach(key=>{
                    if (isObj(merged[key])) {
                        this[key] = this[key] || (merged[key] instanceof Array ? [] : {}); // init new object if doesn't exist
                        this[key].mergekeys(merged[key]); // new object so recursively merge keys
                    } else {
                        this[key] = merged[key];          // just replace with or insert merged key, even if null
                    };
                });
            };
        return this; 
    },
    enumerable: false
});
