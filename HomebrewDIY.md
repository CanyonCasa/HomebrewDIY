# HomebrewDIY Guide

#### Keywords:  HomebrewDIY, configuration

**_By Dave Campbell_**

<span style="color:red; font-weight: bold">

### UPDATE

While this document and others referenced below may cotain useful information, the series of PowerPoint Presentations in this folder now represent the primary documentation. 

</span>

### Abstract

This document provides operational details for the _HomebrewDIY_ server, including configuration, database setups, and builtin middleware.

## HomebrewDIY Design 

### Introduction
_HomebrewDIY_ represents a scratch NodeJS-based web server for small multi-domain/multihosts (~1-5) sites with a complimentary small set of users offering a flexible and full featured platform. It features site-specific custom apps, for websites, blogs, sockets, etc., similar to other Homebrew projects with a simpler code base, flexible configuration, and asynchronous middleware. This version has no framework dependencies, and minimal dependencies for encryption, proxies, and parsing operations.

#### HomebrewDIY Design Features
- NodeJS-based JavaScript server
- No framework dependency
- Fully JSON-based API
- Flexible configuration
- Native JSON databases
- Reverse Proxy support for multiple domains or hosts
- Support of async middleware for easier synchronous-like code flow
- Optional integrated SMS messaging _(Requires inexpensive Twilio account)_
- Optional email service _(Requires free SendGrid account)_

### Assumed Server Folder structure

_HomebrewDIY_ assumes the following folder structure for code, although with proper configuration any organized structure should work.

- **bin**: Node scripts and modules, representing the _HomebrewDIY_ codebase
- **logs**: Used for output log files (alternately, tmp folder could be used)
- **restricted**: Contains configuration files, databases, and security
certificates independent of content folders to restrict site access. **NOTE: For site security, NEVER point to the restricted folder from site roots**
  - **<domain>**: Per domain storage of site certificates.
- **sites**: Folder for individual site roots
  - **<site>**: Independent folder per site
- **tmp**: Temporary storage for uploaded files

#### NodeJS Scripts (i.e. bin Folder)

The following provides a brief description of each file in the bin folder, listed in order of heirarchy.

- **node_modules**: folder of installed node dependencies
  - **bcryptjs**: Password and JSON web token (JWT) encryption module (Many dependencies)
  - **http-proxy**: Node module support for proxies
  - **jsonata**: JSON query language
  - **path-to-regexp**: Express-like URL path parser
- **diy.js**: Entry point script that sets up proxies, site services, and shared objects
- **app.js**: A configurable basic site app that supports most capabilites 
- **proxyware.js**: Code for operating the reverse proxies
- **serverware.js**: Methods for defining the server started in app.js
- **nativeware.js**: Built-in middleware functions
- **apiware.js**: Middleware for implementing the HomebrewDIY API
- **customware.js**: Optional middleware, precedence over apiware.js and nativeware.js
- **workers.js**: Compex objects and methods that support higher level code
- **helpers.js**: Low-level support methods
- **jxDB.js**: Implements the JSON database 
- **caching.js**: Static content cache support
- **streams.js**: Wrapper module for stream transforms and functions
- **SafeData.js**: A JSON sanitizer
- **colorStyles.js**: ANSI color support for transcript logging
- **Extensions2JS.js**: Primitive JavaScript add-ons; import only once, first
- **package.json**: Defines project decription and dependencies
- **package-lock.json**: Locks project dependencies to specific versions

### HomebrewDIY Ecosystem
_HomebrewDIY_ encompasses more than a static web server, including a reverse-proxy front-end, user authentication, built-in configurable middleware, complimentary content management system tool, and a flexible supporting API.

#### Homebrew Proxy
Integrated into the _HomebrewDIY_ the diy.js wrapper script handles simple setup of both http and https proxy frontends differentiated by hostnames, allowing multiple backend servers to operate from a single IP address transparently other than configuration.

#### User Authentication
_HomebrewDIY_ supports Basic Authentication as well as JSON web tokens for reoccurring validation. It supports per-resource authorization using group membership. The [HomebrewDIY_Auth.md](https://github.com/CanyonCasa/HomebrewDIY/blob/master/README.md) document defines authentication and user database details.

#### HomebrewDIY App and Middleware
The App (app.js) implements a basic structure of operation to handle suitable for 95% or more of small web sites. The **_serverware_** module defines the structural middleware functions for creating the actual server of App. These functions resond to each server request, process that request to prepare a context object (ctx) used by downstream processing, then generates the server's response, and handles any errors. The **_nativeware_** module includes additional built-in, hence homebrew native, configurable middleware functions offering the simplest server customization. The **_apiware_** module defines functions for implementing the HomebrewDIT API. Users may define a customware module that has has presidence over most of the other-ware modules, allowing near full customization. The following subsections identify middleware handlers:

<span style="color:red">##### CORS Handler</span>

<span style="color:red">##### TBD...</span>

#### HomebrewDIY Content Management System
The _HomebrewDIY_ Content Management System (CMS) implements a web-based JSON editor for defining data files and content for websites using the HomebrewDIY server. See the [HomebrewDIY CMS](./HomebrewDIY_CMS.md) document for details.

#### HomebrewDIY API
The _HomebrewDIY_ server implements a "full-JSON" application programming interface (API) making interfacing with browsers easy. That is, all requests default to accepting JSON and responding with JSON objects. It uses "recipe-based" endpoints for predefined retrieval of data, actions, and information. The API routes trigger on single mneumonic characters '$' (data), '@' (actions), and '!' (for server internal info). For example,

    https://example.net/$snowfall   Recipe driven database query/modify
    https://example.net/@text       Specific actions such as sending text
    https://example.net/!iot        Server/Client (internal) information

See [HomebrewDIY API](./HomebrewDIY_API.md) document for details.


## HomebrewDIY Configuration

A JavaScript or JSON configuration file defines all the setup for a _HomebrewDIY_ server. A JSON file requires no knowledge of JavaScript programming, only an understanding of the JSON data format, but a JavaScript (JS) based configuration file offers much more flexibility, such as including comments, with minimal knowledge of programming and less "picky" overall syntax. Example skeleton configuration files, in the restricted folder make this even easier. Additionally, using a JS format allows **_private_** information to be saved separately and imported into the configuration.

_HomebrewDIY_ configuration consists of two parts: server, sometimes referred to as global or shared setup and site specific setups, with most configuration optional.

#### Notes:
  1. _Configuration examples utilize two separate files, defaults: **restricted/config.js** and **restricted/private.js**. This allows importing private data into the configuration to simplify sanitizing files for publication. This data is represented in the config file by reference to the imported module, as in **private.secret**._

  2. _Unless otherwise noted valves shown below represent defaults and to not require configuration. 
 
### HomebrewDIY Server Configuration
Server setup involves configuration of features that apply across all backends and includes the following sections:

#### Workers
This section defines properties needed by various workers of the workers module.

The auth definition provides various parameters for generated activation and login codes as well as JSON Web Token (JWT) options. The definition shown identifies all parameters and thier defaults.

The scribe definition configures the internal transcripting for the server. By default, the server defines a single scribe instance wrapped (i.e. closures) for module or site sepcific references. Each closure may be assigned a unique tag to identify transcript messages. The "mask" level, default _log_, defines the level of detail and can be set to _trace, debug, log, info, warn, error, or fatal_. The transscript defines the filename, buffer size, and log-roll file size for output.

HomebrewDIY defines a minimal set of commonly used mime types. Additional application specific types may be defined under workers mimeDefs that merge with the default definitions.

The _sendgrid_ and _twilio_ keys define paramaters needed by the respective backend services if used. Since these properties contain sensitive information they should reference the private definitions module. See _Private Configuration_ section for details.

    workers: {
      auth: {                       // authentication parameters, null to default
        activation: {               // sets activation codes size, base, and expiration (in minutes), defaults given 
          size: 6,
          base: 10,
          expiration: 10
        },
        jwt: {
          expiration: 60*24*7,      // sets JWT expiration in minutes, default 7 days
          renewal: false,           // defines whether JWT may be renew itself on /login call 
          secret: private.secret,   // encrypting key, randomized at start if undefined; define for repeatable runs
        },
        login: {                    // sets size, base, and expiration (in minutes) of login (grant) codes, defaults given
          size: 7,
          base: 36,
          expiration: 10
        },
    },
    scribe: {                       // transcripting/logging parameters
        tag: 'DIY',                 // default tag used by transcript messages
        mask: 'log',                // determines level of reporting detail
        transcript: {               // transcript parameters
            file: '../logs/diy.log',// log file location and name
            bsize: 10000,           // buffer size before output to reduce disk writes
            fsize: 250000           // file size before transcript rollover
        }
    },
    mimeDefs: mimeDefs,             // optional list of additional Mimetypes declared above
    sendgrid: private.sendgrid,     // optional SendGrid account configuration from private.js
    twilio: private.twilio,         // optional Twilio account configuration from private.js
    }

#### Proxies
The proxies section configures backend reverse proxy servers and would normally include one http and one https proxy, as each may serve multiple domains or hosts. Let's Encrypt Certbot requires an http site for domain ownership validation, normally its only use in a secure-by-design configuration. Using an https proxy allows use of simple http servers for backends. Most of the proxy configuration passes to the http-proxy module or define the http(s) server used by the proxy.

The 'sites' definition defines a list of backend sites (i.e. configured backends) routed by the proxy. The 'verbose' flag turns on diagnostics reporting for local IP addresses, normally ignored. 

    proxies: {                      // reverse proxies, "tags" do not differentiate http vs https servers, just representative
        http: {                     // Certbot authentication proxy, default reference "tag", 
            options: {              // defaults passed to proxy server, see http-proxy for details
                ws: false,
                hostnameOnly: true,
                xfwd: true
            },
            port: 8000,             // proxy server port (NO DEFAULT!)
            sites:['acme'],         // sites served by this proxy, must match site configurations below...
            verbose: false          // verbose reporting and logging
        },
        https: {                    // https used for all backend site traffic, default "tag"
            options: {
                ws: true,
                hostnameOnly: true,
                xfwd: true
            },
            port: 8400,             // proxy server port (NO DEFAULT!)
            ssl: private.ssl,       // secure sockets files that defines an HTTPS server - site certificate and private key files
            sites:['iot'],
            verbose: true
        }
    }

Notes:
 1. Port value must be specified, no default.
 2. ssl definition determines server configuration as HTTPS.
 3. sites definition must match tags in site configuration.

#### Shared
The shared section defines resources shared across some or all backend apps.
 
 Databases defined at the server level, optional, not required, share access and a single connection to all backend sites. This can be useful for instance in providing consistent user authentication across multiple domains or subdomains. Each database definition uses a key for reference with the keys '_users_' and '_site_' having special meaning. The database definition value must include at least a valid file spec and may include other paramaters defined in the jxDB module. At least one server or site 'users' database must be defined in support of authentcation and the _apiware_ module assumes the '_site_' database.

The optional headers object defines global header _name:value_ pairs sent by all backends. _HomebrewDIY_ code (i.e. diy.js) defines a default _x-powered-by_ header that may be overriden here or by individual sites or defined as '' to omit altogether. 

    shared: {
        databases: {                // databases defined here available to all backends
            users: { file: '../restricted/users.json' }
        },
        headers: {                  // defines headers passed to all server backends, included in all responses.
            // "x-powered-by" header defined internally, may be overridden here
            admin: private.contact
        }
    }

#### Server Version
An optional '$VERSION' key may be defined. It defaults to the _HomebrewDIY_ file (_diy.js_) timestamp. It is used only in transcripting at startup and the default _x-powered-by_ header.

### HomebrewDIY Sites Configuration
These definitions while all following the same pattern but uniquely define site specific configuration for each backend app. You can define as many backends as desired and hardware affords. _NOTE: The following assumes use of the app.js module for the backend. Configuration for other modules may vary._

The _key_ name for each site represents its default "tag" used in trascripting and internal references, which may be overridden. The 'alias' key defines hostname routes directed to the backend by the respective proxy. By default, backends use _app_, but the 'app' key may be used to define an alternative. 

Each site, regardless of app, requires a _host_ and _port_ definition identifying its backend app location for the reverse proxy router.

Databases defined at the site level override databases with the same tag defined at the server level and follow the same object definition or tag reference string.

Site optional _headers_ object defines site-specific headers that override or extend the server level headers.

The _root_ defintion, if present defines the root folder of a basic default static content server.

The _options_ object defines _app_ specific options. The dafault (undefined) enables a basic full featured site with authentication, CORS, etc. Defining options as null creates a minimal application with no functionality, typically used with a root definition to simply serve static content. (Useful for the Certbot Acme response handling.) Similarly, individual sections may be defined as null to disable default behavior. Definitions under each option merge with defaults. A CORS definition, if not null, requires a list of accepted origins, probably your secure sites.

Handlers perform app-specific backend processing. Handlers load (i.e. route requests) in sequential order, as defined. _HomebrewDIY_ defined _handlers_ include built-in _nativeware_ and _apiware_.See each for their specific configuration. Specific handlers may be used repeatedly, for example, you may specify multiple _content_ handlers with different root folders and permissions.

#### Acme (Certbot) and IoT Examples
    acme: {     // Let's Encrypt / Certbot service
      aliases: ['certbot',<your_other_domain_names_here>],
      headers: { 
        site: 'Certbot Server'
      },
      host: 'localhost',                // backend server name for route
      options: null,                    // options: null for basic server; undefined or {} for full defaults; or explicit
      port: 8079,                     // backend server port for route
      root: '/home/js/sites/acme'     // place certbot files in site 'acme', .well-known folder
    },
    iot: {      // Home IoT service
      aliases: ['home'],
      databases: {  // site specific databases, available to all handlers, override server level
        site: { file: '../restricted/tc.json' }
      },
      handlers: [
        {
            auth: 'server',
            code: 'api',
            method: 'any',
            route: '/:prefix([$@!]):recipe/:opts*',
            tag: 'api'
        },
        {
          auth: '|site',
          cache: { header: 'private, max-age=600' },
          code: 'content',
          compress: 'css,csv,hex,html,htm,js,json,pdf,txt',
          indexing: true,
          method: 'any',
          root: '/home/iot/sites/diy',
          route: '',
          tag: 'root'
        }
      ],
      host: 'home',
      options: {
          cors: {
              origins: ['https://sedillocanyon.net','https://talkingcoyotes.net']
          },
          limits: {
              request: '16K',
              upload: '10M'
          },
          //redirect: [/^http:\/\/home:8000/,'https:\/\/talkingcoyotes.net'],   // redirect 404 to (secure) host
          temp: '../tmp'
      },
      port: 8399,
  }

Notes: 
 1. No defaults. All information must be defined site-specific.
 2. _aliases_ list defines proxy routes to this backend, i.e. http://certbot -> http://localhost:8079, but this does not resolve DNS addresses, which must be defined for local network. In other words, aliases enable routing multiple hosts to individual backends.
 3. Defining _options_ as _null_ disables all optional app settings, primarily creating a barebones server without authentication.
 4. See _Site Handlers_ section below for futher details on options.
 5. _root_ represents a simplified alternative to defining a static content handler, defaults only.

### Native Handler

### API Handler

### Configuration Special Considerations
### A Word About Defining Ports
The operation of HomebrewDIY assumes a network host, via _iptables_, or network router configuration forwards requests to the _'privileged'_ ports 80 and 443 (default http and https ports, respectively) to proxy ports 8080 and 8443, respectively, or other non-privileged ports. This enables HomebrewDIY to run as a normal user that does not require admin or root permissions. By convention, it is recommended that app ports be defined nominally in reference to these ports. For example, backends for the http proxy might be numbered 8079, 8078, ..., while backends for the https proxy get numbered 8442, 8441, ... as this serves as a mental reference for unprotected and protected services respectively.

Normally, the defined _port_ for each site would not be exposed (i.e. port-forwarding) to external Internet access, but accessed via proxy. As a reverse proxy, multiple hostnames (aliases) can be routed to/from individual backend apps. This means you only expose ports 80 and 443 regardless of how many or what type of backends you define.






### Databases




## Changes

- Initial release 2021-01-01

### To Do

- 