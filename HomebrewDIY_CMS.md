# HomebrewDIY Content Management System (CMS)

#### Keywords:	Content Management System, CMS, JavaScript, Homebrew, blog,  NodeJS, JSON

**_By Dave Campbell_**

<span style="color:red"># FILE NOT EDITED BEYOND THIS POINT - CONTENTS COPIED FROM PRIOR WORK</span>

### Abstract

_HomebrewCMS_ implements a super-simple, web-oriented, JSON-based content management system for basic website applications, without the overwhelming overkill and learning curve of larger, full-featured systems. _HomebrewCMS_ supports  dynamically-generated data-driven template-based static pages, and serial/sequential postings, such as a blog.

In short, with _HomebrewCMS_, "skilled" users define data structures called schemas. "Unskilled" users can populate those structures with site sepcific data as a "fill in the blanks" activity. Any server can present the data to clients in the form of JSON files. That's all -- a glorified JSON editor! While large scale tools, such as Wordpress, offer many powerful features and dumb-down website creation for novices, their deeply complex and convoluted code can make altering themes and particularly templates extremely painful.

_HomebrewCMS_ centers on a modern approach for constructing content using JavaScript and HTML templates built with tools such as VueJS or Angular. It uses just a server-side "database emulation" API, written in  JavaScript (for modern NodeJS servers), compatible with any other API capable servers.

## HomebrewCMS Operation
_HomebrewCMS_ assumes use of HTML templates built with VueJS, Angular, or other client-side templating framework served as simple static web pages, such as _/index.html_. These templates "consume" data to build (i.e. render) essentially dynamic page content on the fly, directly on the client device (i.e. in the browser), lowering server demand making it ideal for platforms such as the Raspberry Pi. These templates request data from respective JSON files on the server. The description of HTML templates exceeds the scope of this work, but _HomebrewCMS_ can work with any site framework that simply requests JSON data and supports equivalent upload.

The _HomebrewCMS_ content management tool, _cms.html_, operates in two modes, developer and author. In **Developer** mode, the user builds JSON schema files that define a structure reflecting the required data object of the respective template. Schema files define the structure of the data used by the respective HTML template, not the data! As such, building schema files requires intimate knowledge of the respective template and needed data. This suggests some required degree of technical expertise. In **Author** mode, users populate the data structures by "filling in the blanks", requiring little if any technical knowledge. This largely mimics behavior of tools like WordPress, where _novices_ simply select predefined templates (or themes) created by _experts_ and customize them according, but with significantly less overhead and complexity.

> By convention, I name schema and page data after the template. For example, the _/about.html_ file would use the schema file _/schema/about.json_ and data from _/data/about.json_. For a clearer novice user experience, I name homepage (_/ i.e. /index.html_) files _/schema/home.json_ and _/data/home.json_, which represents better known names for novice users.

#### Client-Server API Communications

Client and server request and response communications essentially occur via JSON objects. The content management tools upload ALL data -- schema and data files, images, documents, etc -- as JSON POST requests. Templates request all data files as JSON files and other content by standard static content delivery methods. Therefore, the content-type for upload requests should be specified as _application/json_ and will be defined the same on responses. Images, documents, and any other binary files get Base-64 encoded and defined as part of a JSON object on upload and converted back before storage.

<span style="color:blue">See the [HomebrewDIY API](./HomebrewDIY_API.md) file for API details.</span>

#### Authentication

_HomebrewCMS_ authentication uses the _Basic HTTP Authentication_ header for requests defined as 

>>**Authentication: Basic base64_encoded(user:password)** <sup>1,2</sup>

<span style="color:red">TBD</span>
>>Each GET/POST request _recipe_ specifies required authentication (See examples for more details on implementing and appropriate REST interface.)

Authentication supports two forms: multi-user (i.e. shared token) and single-user (i.e. user specific credentials), with individual permissions possible in both cases. Verification first trys to match the user specific password. On failure of the user password, it will try to match the _authAs_ password (i.e. token by default), if specified in the cfg.json file (discussed below). <sup>3</sup>

##### Authentication Notes: 
 
  1. <span style="color:red">NOTE: _HomebrewCMS_ uses the _Basic_ authentication method, which passes clear text credentials in the request header. Therefore, it requires use of _https_ access (instead of _http_) for credentials security.</span>
  
  2. <span style="color:red">NOTE: _HomebrewCMS_ assumes and requires client and server support for **Bcrypt** password encryption to authenticate developer and author uploads.</span>

  3. <span style="color:red">NOTE: When multi-user mode is enabled, single-user mode does not ensure absolute security as it does not prevent a user from "spoofing someone else"! It is intended for easy management of a small group of trusted users, such as a family or small business employees.</span>

#### Cross Origin Requests (CORS)

_HomebrewCMS_ assumes the use of two websites, the actual "live" site and an alternate "preview" site. The tool automatically handles cross-origin requests between the two defined site locations specified in the _cfg.json_ file.

#### Error Responses

A successful authentication will POST the requested source (unless an error occurs). A failed authentication will have a status code 200, OK, but will return a JSON **error** object containing a code and message in the form _{"error": {"code": 401,"msg": "Unauthorized"}, "details":"optional_diagnostic_info"}_. As shown, the _error object_ may include an additional _details_ field for diagnostics. Note, the _fetch_ promise response includes an _jxOK_ value that can test the validity of responses and the response _jx_ field contains the recovered JSON output.

####  Special Server Operations

<span style="color:red">TBD</span>
The server-side "data emulation script", **recipe.php** or **cms.js**, exercises a few special operations.

### HomebrewCMS Files and Folders Description

_HomebrewCMS_ involves only a few required files for easy management and learning curve. It assumes all these reside in the same directory on the server, **/cms** by default, unless otherwise specified.

- **cms.html**: A VueJS HTML template for the content management tool, i.e. the user interface. This tempate directly depends on VueJS 2.x and the following modules.<sup>1,2</sup>
- **cmsVueModel.js**: Module of JavaScript code that declares the Vue Instance referenced in _cms.html_ and its top-level methods and properties.
- **cmsVueLib.js**: A JavaScript library to modularize the CMS Vue components to cleanup the _cms.html_ and _cmsVueModel.js_ files.
- **VueFetchWrapper.js**: A Vue plugin that adds the "fetch" method directly to Vue, optimized for JSON communication with built-in preprocessing of responses.
- **VueStorageWrapper.js**: A Vue plugin that adds HTML5 session and local storage directly to Vue with _save_ and _recall_ functions for direct handling of JSON objects.
- **Extensions2Client.js**: A library of JavaScript extensions used throughout the other JavaScript code.
- **cfgAndSchemaDefs.js**: Script to define base configuration and root schema definitions. Only used by the cms.html file, loaded by a script reference in the head of that file.
- **cms.css**: Stylesheet for the _cms.html_ file.
- **recipe.php** (Apache) or **cms.js** (NodeJS): Server-side recipe-based database emulation script to upload and manage data, image, and schema files. See _Special Server Operations_ for function details.

Additionally, operation involves site-specific content files, including:

- **cfg.json**: Data file used to override configuration defaults for site specific customization. See _example_cfg.json_ for configuration details. Place this file in the _/cms_ folder.
- **credentials.json**: User credentials file in JSON format. <span style="color:red">NOTE: FOR SECURITY, DO NOT place this file under the document root, which includes the _/cms_ folder.</span> The server application assumes this file exists in the _restricted_ folder configured in _cfg.json_ 
- **text.html**: Template file used for _"auto generated"_ text output (i.e. HTML output from Markdown text elements). In should be configured to reference the site-specific style definitions for more accurate _"preview"_ simulation.
- **HTML templates**: HTML files built with a client-side templating framework such as VueJS or Angular for site pages. The master _index.html_ file should be placed in the document root folder, but others may be organized as appropriate.
- **JSON _schema_ and _data_ files**: Site specific content structure definition and data files in JSON format for the respective templates. HomebrewCMS manages these files in the _/schema_ and _/data_ folders respectively as defined in the _cfg.json_ file.

_HomebrewCMS_ assumes the following server directory structure for files, which may be overridden using the _cfg.json_ file:<sup>3,4,5</sup>

### Site Folder Map

#### Folders ...
- **cms**: Recommended folder for content management files, to not clutter root folder. (Blocked from uploads for security.)
- **data**: Folder of JSON data files that define content for individual pages and page sections, referenced by cms.html, recipe.php or _cms.js_ script, and respective HTML templates.
- **docs**: Folder where uploaded documents get stored, referenced by cms.html, recipe.php or _cms.js_ script, and respective HTML templates.
- **images**: Folder where uploaded images get stored, referenced by cms.html, recipe.php or _cms.js_ script, and respective HTML templates.
- **scripts**: Folder of scripts referenced by site pages, if desired. Note: the CMS scripts noted above should always reside in the _/cms_ folder.  (Blocked from uploads for security.)
- **schema**: Folder of "database" schema referenced only by _cms.html_ and _recipe.php_ or _cms.js_ script.
- **styles**: Folder of site CSS stylesheets for site.

#### Locations ...
- **live**: Real active website at domain of choice.
- **preview**: Testing preview only website. May be publically exposed, such as a subdomain, but not directly visible.
- **restricted**: A server folder location outside of the document root for holding restricted access information, such as credentials and closed data files.

##### Files and Folders Notes

  1. The CMS has external dependencies for VueJS 2.x, referenced by a link in head section of _cms.html_, as well as the **Font Awesome 5 Free** library for icons, also referenced by a link in _cms.html_.
  
  2. For local server development, a static copy of the external dependencites resides in the _cdn_ folder that may be referenced instead of the external paths.
  
  3. All uploads to these folders using _HomebrewCMS_ require authentication, as noted above.
  
  4. For security, _HomebrewCMS_ only uploads files to "configured" folders, not to configured locations.
  
  5. Any of these folders may be renamed or moved as desired, using the _cfg.json_ file. Any hardcoded references in templates and data files must be changed, respectively.

### Changes

- Initial release.
- Second release. Schema not compatible with prior release.
- Third release. Redefined serial page structure breaking into two schema.

### To Do

- Develop cms.js NodeJS middleware
- Example (barebones) site schema and templates.
- User management support.
- keywords and indexing (JXV) file definition.
- Minimization support.
- Session support.
- Define and document HomebrewAPI
