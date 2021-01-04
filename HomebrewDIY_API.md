# HomebrewDIY Users Manual

#### Keywords:  HomebrewDIY, User's Manual, manual, API, configuration

**_By Dave Campbell_**

### Abstract

The _HomebrewDIY_ server implements a "full-JSON" application programming interface (API) making interfacing with browsers easy. That is, all requests default to accepting JSON and responding with JSON objects.

The _HomebrewDIY_ API uses "recipe-based" endpoints for retrieval of data, actions, and information. The API routes trigger on single mneumonic characters '$' (data), '@' (actions), and '!' for server internal info. For example,

    https://example.net/$snowfall   Recipe driven database query/modify
    https://example.net/@text       Specific actions such as sending text
    https://example.net/!iot        Server/Client (internal) information

<span style="color:red"># FILE NOT EDITED BEYOND THIS POINT - CONTENTS COPIED FROM PRIOR WORK</span>

## HomebrewDIY API
The _HomebrewDIY_ server edcosystem assumes the complete use of JavaScript Object Notation (JSON) for requests and responses. While the server can respond with static content and other data formats, by default 


_HomebrewDIY_ implements a "full-JSON" application programming interface (API) making interfacing with browsers easy. That is, all requests default to accepting JSON and responding with JSON objects.

The _HomebrewDIY_ API uses "recipe-based" endpoints for retrieval of data, actions, and information. The API routes trigger on single mneumonic characters '$' (data), '@' (actions), and '!' for server internal info. For example,

    https://example.net/$snowfall   Recipe driven database query/modify
    https://example.net/@text       Specific actions such as sending text
    https://example.net/!iot        Server/Client (internal) information


## HomebrewDIY Content Management System (CMS)

_HomebrewDIY_ CMS provides a supporting content management system.



## HomebrewDIY Middleware

The _hbLiteApp_ includes more "builtin" fuunctions than prior work but overall represents a more easily configured application than before as most things simply default as needed for most any site.

### Initialization

This function performs internal actions and requires no configuration. It ...

- Logs site requests
- Writes defined response headers
- Initializes the hb (i.e. Homebrew) namespace and attaches it to all requests.

### Authentication

The builtin auth function parses the HTTP Authorization header and performs authentication for all requests, if the header exists. 

_HomebrewDIY_ supports the _Basic_ HTTP Authorization header for login requests defined as:

>>**Authorization: Basic base64_encoded(user:password)** <sup>1,2</sup>

Failed authentication attempts (i.e. invalid username/password or JWT return an error object. Upon successful authentication, the server returns a **JSON Web Token** (_JWT_) via a return Authorization header. The _base64Url_ encoded JWT payoad includes the user identification, including group membership for client side use. Further server authentications can then simply echo the JWT as a bearer authorization header defined as:

>>**Authorization: Bearer *base64Url_encoded_jwt_string* **<sup>3</sup>

#### Authentication Notes: 
 
  1. <span style="color:red">_HomebrewDIY_ uses _Basic_ authentication, which passes clear text credentials in the request header. Therefore, it requires use of _https_ access (instead of _http_) for credentials security.</span>
  
  2. <span style="color:red">Note: This represents _authentication_, the act of validating the user is who they say they are, although the standard defines the _Authorization_ header. Actual authorization occurs after a user is authenticated based on group membership for particular services or access. 
  
  3. Where *base64Url_encoded_jwt_string* represents the base64Url encoded contents of the JSON web token in the form _header.payload.signature_.

### User Management and Login

The user management function supports several endpoints for various user functions:

    GET (or POST) /login
      Requested with a valid Authorization header, the login endpoint returns a JSON object with either an 'error' key or 'jwt', the payload of which contains the base64Url encoded user profile without credentials.

    GET /user/code/<username>/bymail
      Creates an account activation/access code for the specified user and returns it by SMS text (default) or email if optional 'bymail' flag is specified.

    GET /user/emails/[<username>]
      Returns a object for a specific user or each user containing their email address indexed by username. Requires 'admin' or 'managers' authorization.

    GET /user/id/[<username>]
      Returns a object for a specific user or each user containing their identification info (i.e. fullname and other fields) indexed by username, if no username is specified or only a specific user. Requires 'admin' or 'users' authorization.

    GET /user/groups
      Returns a array listing name and description for defined membership groups.

    GET /user/list/[<username>]
      Returns the account profile for the specified username or a list of all users if no username is specified. Requires 'admin' authorization for list of users and "self" authentication to return a user's own profile

    GET /user/phones/[<username>]
      Returns a object for a specific user or each user containing their phone number indexed by username. Requires 'admin' or 'managers' authorization.

    POST /user/code/<username>/<code>
      Validates the code sent by the request and activates the respective user acount. No authorization required.  

    POST /user/change/[<username>]
      Change (i.e. create, update, or delete) one or more user profiles, where the request body contains an array of users in the form [{ref: <username>, record:<user_data>},...] or [[<username>,<user_data>],...]. Request requires "self" authentication to change ones own profile or 'admin/manager' authorization to change other accounts. Non-admin authorization changes limited and exclude membership and status changes. Null <user_data> will delete the entry.

    POST /user/groups
      Change (i.e. create, update, or delete) one or more user membership groups, where the request body contains an array of groups in the form [{ref: <name>, record:<group_data>},...] or [[<name>,<group_data>],...]. Request requires 'admin' authorization. Null <group_data> will delete the entry.

#### User Groups 

User groups define membership permissions of users to perform specific actions. Any number of groups may be defined using the POST /user/groups endpoint. _HomebrewDIY_ defines the following groups for dedicated use:

- "admin": "Administrative superuser authorization"
- "manager": "Administrative delegate authorization"
- "users": "Authenticated users"
- "mail": "Authorization to email users"
- "text": "Authorization to text users"
- "renew": "Authorization to update the secure server certificate/key"
- "reload: "Authorization to reload a site or server database"
- "grant: "Authorization to grant users temporary access"
- "scribe: "Authorization to change the transcription mask"
- "stats: "Authorization to acquire server statistics"
- "info": "Authorization to view server internal info"

_Note: Only admin and users required._

### URL Mapping

This builtin can be used to redirect requests, where the configuration defines an list of name:value pairs where name specifies the source URL and value specifies the redirect URL. A list of rewrite rules can also be specified to reroute the present URL to a new endpoint.

### Terminate and Error Handling

The terminate block performs two operations. If the secureRedirect option is defined (for an http endpoint) it will redirect the request to a secure endpoint based on the defined secureRedirect regular expression substitution. Otherwise, it will throw a 404 error to guarantee termination of the request by the error handler.

The follow-up error handler provides a uniform JSON error response for all server errors in the form { error: true, code: _http_status_code_, msg: _server_error_message_ }}.

### Homebrew Handlers

Backend handlers perform specific server tasks or terminate specific endpoints. _HomebrewDIY_ includes base basic handlers for support of data and file operations as well as specific server actions and information processing. The handler configuration defines an array as order of handlers matters in most cases.

If a site configuration defines a **"root"** property, an internal _express.static_ handler loads for the root folder before any other handlers. Additional, static handlers may be loaded by declaring a handler configuration as

    { tag: 'static', root: <local_path_to_static_files> }

The tag should always be static regardless of the number of handlers. _Note: the definition uses 'root', not route._

_HomebrewDIY_ defines some builtin handlers and default routes. These can be configured simple by using the (case sensitive) names LiteData, LifeFile, LiteAction, and LiteInfo, respectively. See the descriptions of each handler below for details. Multiple, instances of the builtin handlers, as well as any custom handlers, may be declared by providing an object definition similar to the following:

    {
      tag: "alt_data",    // 8 chars max
      code: "./LiteData", // handler module
      route: "/data/:recipe/:opt1?/:opt2?/:opt3?/:op4?/:opt5?"  // route,  not root!
    }

_NOTE: A definition for a custom middleware handler may include other handler specific properties._

 The default routing for the builtin handlers follows a consistent format as:

    /<prefix_character><keyword>/opt1/opt2/opt3/op4/opt5
    
Where the defined _prefix_character_ convention is $, @, ~, or ! for database queries, server actions, file handling, or server information, respectively. The use of a _prefix_character_ simply represents a Homebrew convention (default) and depends on the actual route defined. 

The 'keyword', also referenced as _recipe_, _action_, or _info_ refers to a lookup value for the specific request. This means that the server ONLY responds to  request endpoints defined by a specified recipe. This prevents open-ended server requests from breaching security. The fields opt1-opt5 represent optional request specific parameters.


### LiteData

The LiteData handler server database queries in the (default) form, for example,

    GET /$measurement/rainfall/2019-06-01/2019-06-03

Where the actual retrieved data depends on the "recipe" definition for _measurement_. Query recipes contain the following:

    {
      name: <recipe_name>,
      expression: <jsonata_expression_for_data_retrieval>,
      auth: <array_of_groups_authorized_access>
    }

Similarly, data can be posted, for example, by

    POST /$measurement

Where the body contains the data in the form of an array of objects or and array of arrays, where each record consists of a reference to key the record, and the actual data record, such as,

    [
      {ref:'rainfall', record:{name:'rainfall', value: ...},
      ...
    ]

or

    [
      ['rainfall',{name:'rainfall', value: ...}],
      ...
    ]

A data save recipe contains the following:

    {
      name: <recipe_name>,
      collection: <collection_name>,
      xjson: <filespec_for_extensible_JSON_file>
      reference: <jsonata_expression_for_determining_the_index_for_updates>,
      filter: <JSON_filter_tree_mimicing_data>,
      auth: <array_of_groups_authorized_access>
    }

Either colection or xjson is required. See the following subsection for additional details. Both query and save recipes can be combined as long as auth permissions are the same for both.

#### LiteData Cofiguration

The LiteData module requires minimal configuration when customized, as outlined below. The 'tag' property represents the transcripting reference, the 'code' refers to the module required, and the 'route' defines the Express route directing traffic to the module instance.

    {
      tag: 'data',
      code: './LiteData',
      route: '/\\$:recipe(\\w+)/:opt1?/:opt2?/:opt3?/:opt4?/:opt5?'
    }

#### Extensible JSON

TBD

#### SafeData Filter

TBD

### LiteAction

The LiteAction module performs a number of hardcoded operations for the server. It has the following endpoints:

    GET /@grant/<user_list>/[<exp>]
    GET /@grant?user=<user_list>&exp=<exp>
      Grants temporary access to a comma-delimited list of users that expires after 'exp' minutes, maximum of 7 days (i.e. 60*24*7), default 10 minutes. Requires 'admin' or 'grant' permissions.

    GET /@scribe/<level>/
    GET /@scribe?level=<level>
      Dynamically changes to level of transcripting for debug to trace, debug, log, info, warn, error, or fatal. Requires 'admin' or 'scribe' permissions.

    GET /@stats/[<tag>/[<key>]]
      Reports server statistics (i.e. hits, errors, ...). The optional 'tag' and 'key' parameters can narrow the result scope. Requires 'admin' or 'stats' permissions.

    POST /@mail
      Sends an email to one or more recipients. The body contains the message data in the form:

        {
          to: <usernames_or_email_addresses>,
          cc: <usernames_or_email_addresses>,
          bcc: <usernames_or_email_addresses>,
          from: <usernames_or_email_addresses>,
          subject: <subject>,
          id: <optional_message_id_such_as_domain_name>,
          time: <optional_boolean_flag_to_timestamp_message_header>,
          hdr: <optional_message_hdr>,
          text: <message content>,
        }    

      Requires configuration of an email server. Requires  'admin' or 'mail' permissions. Admins receive a detailed report, while other receive a simple message response.

    POST /@reload/<db>
      Tells the server to reload a site or server specific database. Requires  'admin' or 'reload' permissions.

    POST /@renew
      Tells the server to reload the site security certificate and private key files. Requires  'admin' or 'renew' permissions.

    POST /@text
      Sends an SMS text message to one or more recipients. The body contains the message data in the form:

      {
        to: <usernames_or_10-digit_phone_numbers>,
        cc: <usernames_or_10-digit_phone_numbers>,
        bcc: <usernames_or_10-digit_phone_numbers>,
        from: <usernames_or_10-digit_phone_numbers>,
        subject: <subject>,
        id: <optional_message_id_such_as_domain_name>,
        time: <optional_boolean_flag_to_timestamp_message_header>,
        hdr: <optional_message_hdr>,
        text: <message content>,
      }    

      Requires configuration of a Twilio service account. Requires  'admin' or 'text' permissions. Admins receive a detailed report, while other receive a simple message response.

#### LiteAction Cofiguration

The LiteAction module requires minimal configuration when customized, as outlined below. The 'tag' property represents the transcripting reference, the 'code' refers to the module required, and the 'route' defines the Express route directing traffic to the module instance.

    {
      tag: 'info',
      code: './LiteInfo',
      route: '/\\!:info(\\w+)'
    }

### LiteFile

The LiteFile module supports file upload and download via JSON. Binary files use base64 encoding to send as JSON strings.

    GET /~<recipe>?spec=<filespec>
      This endpoint downloads files from the server, perhaps not normally accessible by a direct link. The recipe specifies variables relative to the transfer. The filespec specifies the file location and name relative to a folder specified by the recipe.
      
      { 
        name: <recipe_name>,
        folder: <absolute_path_to_file_save_location>,
        list: <true|false>, // flag to enable listing directory, default false
        send: <raw | base64 | JSON>
      }
      
      If send is defined as 'raw', the return file is sent as a nnormal file download, otherwise it returns as a JSON object:
      
      { 
        name: <file_spec>,
        contents: <base64|JSON>,
        encoding: <'base64'|'none'>
      }
      
      Directory listings return an array of file system objects, subdirectories and files, with associated stats.

    POST /~<recipe>
      The endpoint uploads files as JSON content to a location specified by the recipe. Binary files transfer as base64 encoded strings. The body contains an array of file uploads in the form:
      
      [
        {
          name: <file_spec>,              // can reference a subfolder, but not //
          folder: <root_folder>           // location under root
          backup: <file_spec_for_backup>, // optional, backup first if exists
          encoding: base64 | utf8,        // utf8 default
          contents: <file_contents>       // JSON (i.e. JSON or string as valid JSON) or base64 encoded binary.
          append: true | false            // optional write mode
        },
        ... // multiple files optional
      ]

#### LiteFile Cofiguration

The LiteFile module requires minimal configuration when customized, as outlined below. The 'tag' property represents the transcripting reference, the 'code' refers to the module required, and the 'route' defines the Express route directing traffic to the module instance.

    {
      tag: 'file',
      code: './LiteFile',
      route: '/\\~:recipe(\\w+)/:opt?'
    }

### LiteInfo

The _LiteInfo_ module provides access to server specific information. It has the following endpoints:

    GET /!ip
      Returns an object with various IP address values for the remote client.

    GET /!ip4
      Returns an object with only the IP address value for the remote client, useful for simple IP address discovery.

    GET /!time
      Returns the current Unix epoch useful for time synchronization of IoT devices.

    GET /!date
      Returns a date/time object with a number of fields useful for IoT devices un formulating formated date/time strings.

    GET /!rqst
      Returns detailed information about the client request for debug. Requires 'admin' or 'info' group membership, otherwise it returns an authorization error message.

    GET /!stats/<tag>/<key>
      Returns information about server statistics for monitoring and debug. Requires 'admin' or 'info' group membership, otherwise it returns an authorization error message. May include optional 'tag' and 'key' parameters to limit scope.

    GET /!<label>
      The label 'info' or any other label returns an object containing all the above information.  Requires 'admin' or 'info' group membership, otherwise it returns an authorization error message.

#### LiteInfo Cofiguration

The LiteInfo module requires minimal configuration when customized, as outlined below. The 'tag' property represents the transcripting reference, the 'code' refers to the module required, and the 'route' defines the Express route directing traffic to the module instance.

    {
      tag: 'info',
      code: './LiteInfo',
      route: '/\\!:info(\\w+)'
    }

## Other Information

#### Cross Origin Requests (CORS)

## HomebrewDIY Databases

Databases for _HomebrewDIY_ and associated modules assume the use of the jxjDB module that loads small native JSON databases into memory for fast immediate access. Database queries utilize 'recipes' that define fixed queries, authorization, and other processing details. See the Extensible JSON database section for more information. 

Operation normally requires the definition of two specific databases: 'users' and 'site'.

### Recipes

Recipes represent predefined instructions for storing and retrieving database entries. They implement base API database operations and therefore understanding recipes becomes central to understanding database queires. Recipes can have the following fields, where + denotes required and ? denotes optional for query (sync read), modify (sync write), inquire (async read), and cache (async write) requests as denoted by QMIC columns, respectively:

  Q M I C
  + + + + name:       recipe reference used by url, required
    +     collection: JSONATA collection name reference when altering database, not required when xjson specified
  ? ? ? ? auth:       a comma delimited list of group memebership authorized access to the database, not checked if undefined
  ? ? ?   defaults:   default values for fields for new records or value returned for a null query result, default {}
  +   +   expression: JSONATA expression for data retrieval, required for queires
    +   + filter:     JSON filter tree mimicing data tree structure
  ?   ?   header:     header field included as entry 0 with query, if defined
  ?   ?   limit:      limit for maximum number of records returned; positive value refences from beginning of data, negative references from end
    +     reference:  JSONATA expression for determining the "matching" index for update or existing data
    ?     unique:     JSONATA expression to determine a unique field and value, for exxample {key:'id' value:'5'}, for indexing new records
      + + xdata:      defines extensible data type: 'isArrayofArrays' or 'isArrayofTrueObjects'
      + + xjson:      filespec for extensible JSON file, overrides in memory databases, see the Extensible JSON database section for more information 

Note, extensible JSON databases perform only sequential operations, therefore they can only reference a single collection and caching cannot define unique references for new entries. Suggest using a timestamp as part of reference instead.

Other fields may be defined for specific reference by other functions, for example, the file upload recipes define folders for allowed destinations.

### Extensible JSON database

An extensible JSON database defines a file where each single-line entry represents a valid JSON object or array, modeled after CSV files. Thus it can be extended by appending additional fields. This has utility for IoT data collection where each data entry, such as a sensor time/value pairs, can simply be appended to a data file and queired by the API. Data fields can be simple JS objects or arrays form more compact storage that doesn't replicate keys. For the latter, the first record may be defined as a header of keys for data fields, similar to CSV files.

### Users Database

The users database as the name suggests holds user identification and credentials. A user entry should contain the following minimum information organized as shown.

    {
        "username": "",
        "credentials": {
          "hash": "",
          "code": {}
        },
        "member": [
          "users"
        ],
        "fullname": "",
        "phone": "",
        "email": "",
        "other": {},
        "status": "PENDING"
      }

All critical security information should be organized under 'credentials'. The server never shares this field to clients. The 'code' field holds login/activation codes and expirations defined on demand. The 'members' key holds a list authorized group memberships.

The 'other' key holds site/app specific info as desired. The status is optional but will be used if defined. Values are PENDING (before activation), ACTIVE, and INACTIVE for disabled accounts.

In addition to the defined user data, the users database holds groups descriptions and recipes required for user management. See the example 'users' database in the restricted folder for a baseline.

#### User Security

<span style="color:red">IMPORTANT: The 'users' database should always be a separate and independent database accessible only by internal server actions so that it is not comprised by other data accesses.

### Site Database

The so called 'site' can be referenced by any "tag" (identifier of 8 characters or less) as long as it's defined. The hbLiteApp simply requires a database to store recipes for some basic operations. See the example 'site' database in the restricted folder for a baseline.


## Changes

- Initial release 2020-06-02

### To Do

- More examples
- Web sockets
- CORS
- Extensible JSON
- SafeData Filter