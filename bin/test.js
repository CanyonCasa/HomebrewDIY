require('./Extensions2JS');
const cfg = require('../restricted/config');
const helpers = require('./helpers');
const workers = require('./workers')(cfg.workers);
const scribe = workers.Scribe('test');

var a = helpers.makeArrayOf(10,0);
var b = helpers.makeArrayOf(10,((v,i)=>5*i));
console.log("hello world",a,b,new Date().style('iso'),helpers.verifyThat(b,'isArray'));

const u = workers.Scribe();
const s = workers.Scribe('main');
const t = workers.Scribe('test');
let world = 'earth';
s.log('%s %s', 'hello', world);
t.warn('goodbye world', 'again!');
u.log('default');

workers.statistics.inc('test','first');
console.log(workers.statistics.get())

console.log(workers.sms);
//workers.sms({text:'My test message'}).catch(e=>{ console.log(e); });

workers.Scribe('me').info('This is my story!');

console.log(workers.httpErrorMsg(401));
console.log(workers.httpErrorMsg(4000));
console.log(workers.httpErrorMsg({code:401,msg:'test'}));
try {
    throw('a new error');
} catch(e) { console.log(workers.httpErrorMsg(e)); };
scribe.dump('dump');
scribe.trace('trace it');
scribe.debug('debugger');
scribe.log('log things');
scribe.info('extra info');
scribe.warn('warn me');
scribe.error('to error');
scribe.fatal('fatal');
