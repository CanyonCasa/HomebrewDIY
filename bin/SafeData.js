/*
  Implements a module for Safe JSON data filtering ...
  (c) 2019 Enchanted Engineering, MIT license

  The SafeData.js library provides a reusable utility set of routines for 
  filtering user input data provided as JSON objects. It includes easily 
  customized pre-defined filter patterns.

  Exports include...
    rexSafe:        Basic regular expression filtering method
    scalarSafe:     Basic scalar data filtering method, including HTML
    jsonSafe:       Recursive JSON filtering method, including HTML fields
*/

///************************************************************
///  Dependencies...
///************************************************************
require("./Extensions2JS"); // dependency on Date stylings

// simple regular expression pattern test ...
function rexSafe(data,pattern,dflt) {
  var m=data.match(pattern);
  return (m) ? m[0] : dflt!==undefined ? dflt : undefined;
};

// scalarSafe scrubs scalar data using specified filter defined as pattern (string or RegExp) or [pattern,default], 
//   where pattern defines the regular expression or keyword match pattern, including...
//     undefined, null, '', '*', boolean, numeric, integer, date, or RegExp
//   dflt represents default value when no data is present or date modifier (i.e. date style format)    
//   Note: regex backslashes must be escaped!!!, e.g. \\t for tab
function scalarSafe(data,filter){
  var [pat,dflt] = (Array.isArray(filter)) ? filter : [filter];
  // if no data, except for date, return default
  if ((data===undefined || data==='') && pat!='date') { return dflt!==undefined ? dflt : data; };
  if (pat==='*') return data; // bypass, no filtering
  // begin checking data...
  // explicitly test pattern and data... 
  switch (pat) {
    case 'undefined': return undefined; break;  // only returns undefined 
    case 'null': return null; break;            // only returns null
    case '': return dflt||''; break;            // returns '' or a forced value from default
    case 'boolean':                             // returns only true or false
      return (data===true||data===false) ? data : (dflt==true); break;
    case 'integer':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseInt(dflt||0) : parseInt(data); break; // "exceptions" to isNaN previously screened
    case 'numeric':                             // returns a valid number or default or 0
      return (isNaN(data)) ? parseFloat(dflt||0) : parseFloat(data); break; // "exceptions" to isNaN previously screened
    case 'date':                                // returns a valid date, per 'dflt' format or iso
      return (isNaN(Date.parse(data)) ? new Date() : new Date(data)).style(dflt||'iso'); break;
    case 'choice':                              // value must be one of a list (dflt), default to first item
      if (typeof dflt == 'string') dflt = dflt.split(',');  // dflt may be comma delimited string or array
      return (dflt.indexOf(data)==-1) ? dflt[0] : data;
    default:
      let re = (x) => new RegExp(x.slice(1,x.lastIndexOf('/')),x.slice(x.lastIndexOf('/')+1));
      pat = pat=='id' ? /^[a-z0-9_-]+/i : pat=='text' ? /^[^\/<>]+/ :
            ((typeof pat=='string') && pat.startsWith('/')) ? re(pat) : undefined;
      if (typeof data!=='string' || !(pat instanceof RegExp)) return dflt||''; // only string data and regex pattern should remain...
      return rexSafe(data,pat,dflt); 
  };
};

// recursive JSON filter. Expects a filter with structure matching JSON data, jx
function jsonSafe(jx,filter) {
  if (filter==='*') return jx;
  if (typeof jx!='object') {
    // scalar input...
    return scalarSafe(jx,filter);
  } else if (Array.isArray(jx)) {
    // array input... note filter should be an array of [pattern,dflt] arrays
    var jxa = [];
    if (filter.length==1) {
      // shortcut filter definition supported for arrays; if only 1 element, use same filter[0] for all jx checks
      for (var i=0;i<jx.length;i++) jxa.push(jsonSafe(jx[i],filter[0]));
    } else {
      // longhand - only filter elements defined in filter
      for (var i=0;i<filter.length;i++) jxa.push(jsonSafe(jx[i],filter[i]));
    }
    return jxa;
  }
  else {
    if (jx==null) return jx;  // null never filtered
    // assume object input...
    // use keys of respective filter item for checks, extra jx keys not in filter are removed!
    var jxo = {};
    for (var k in filter) jxo[k] = jsonSafe(jx[k],filter[k]);
    return jxo;    
  };
};

module.exports = {
  rexSafe: rexSafe,
  scalarSafe: scalarSafe,
  jsonSafe: jsonSafe
  };
