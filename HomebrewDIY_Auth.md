# HomebrewDIY Authentication and Authorization

#### Keywords:  HomebrewDIY, authentication, authorization

**_By Dave Campbell_**

<style>
.highlight { color: #0066cc; }
.no-bullet { list-style-type:none; }
.indent { margin-left: 2em; }
</style>

### Abstract

The _HomebrewDIY_ server supports basic authentication as well as the use of JSON Web Tokens (JWT) for continuous returning authorization. Additionally, it provides optional two factor authentication (TFA) with Twilio SMS text messaging or SendGrid email. With Twilo it also supports short duration passcode logins.

<div class="highlight">
Authentication vs Authorization:

- **Authentication**: _Authentication involves validing a known user, normally through the use of username and password login credentials (to be who they  present themselves as)._
- **Authorization**: _Equates to granting access to specific resources, which may simply involve authenticating the user or more complex notions as granting such access on the basis of permissions, such as having a specific group membership._

The HTTP _basic authentication_ protocol complicates this by using the _Authorization_ header. Thoughout this document the proper terms will be used with this exception.
</div>

## Configuration
Authentication can be disabled on a site-by-site basis (for simple http sites) by setting auth=null in the site.options sectionm, otherwise, authentication is assumed. Disabling authentication is recommended only for simple static sites such as needed by the Certbot Acme server. Disabling authentication automatically removes the **/user** and **/login** routes from App as defined below and negates the requirement for a **users** database.

## Authentication
For each request, the serverware authenticate function looks for an HTTP _Authorization_ header, accepting _basic_ and _bearer_ forms as,

<div class="indent">
Authorization: Basic base64_encoded(user:password) <sup>1</sup>

Authorization: Bearer *base64Url_encoded_jwt_string* <sup>1,2</sup>

Notes: 
 
  1. _HomebrewDIY_ uses _Basic_ authentication, which passes clear text credentials in the request header. Therefore, it requires use of _https_ access (instead of _http_) for credentials security.
  
  2. Where *base64Url_encoded_jwt_string* represents the previously returned JSON web token. Note that the client only needs to return information previously sent by the server as a result of a successful login.
</div>

If an authorization header does not exist, processing procedes with no authentication attempt. If it finds a _Basic Authentication_ header definition,the function authenticates the user based on standard login username and password credentials. If it finds a _Bearer Authentication_ header definition, it assumes this to contain a returned JWT and authenticates the user based on it. In either case, a failed authentication returns an HTTP 401 error message response.

A successful authentication adds several definitions to the request context, including:

- **user**: The validated user's database record (without credentials)
- **authenticated**: Flag indicating a successful authentication, defined as _basic_ or _bearer_, otherwise _false_.
- *authorize*: A callback function for downstream middleware, which allows verifying the user's group membership, otherwise a function that always returns false.

### Login
With authentication enabled the server implements a login endpoint, defined below. This endpoint must be requested prior to any other authentication request as it generates the JWT. Subsequent requests can simply return a valid non-expired JWT in a _Bearer Authorization_ header.

    GET (or POST) /login
      Requested with a valid _Basic Authorization_ header, the login endpoint returns a JSON object with a 'jwt' key, and for convenience, keys for each of the 'header', 'payload', and 'signiture' fields of the JWT. It also returns the full JWT in a return _Authorization_ header for simplfying future requests.

      For a valid _Bearer Authorization_ header, the login endpoint will renew the token, if so configured.
      
      If an error occurs in either case, it returns a JSON object with an 'error' key and 'msg' key with the reason for the failure.

    GET (or POST) /logout
    Returns an empty JSON object. Actual logout requires the client to destoy the existing JWT and Authorization header containing the JWT.

NOTE: Individual server requests can simply include a valid Authorization header alone without the need to actually login.

### User Management
The server _account_ nativeware function implements several endpoints for user accounts and groups management of the users database:

    GET /user/code/<username>/[bymail]
      Creates an account activation/access code for the specified username and returns it by SMS text (default) or email if optional 'bymail' flag is specified.

    GET /user/contacts/[<username>]
      Returns an object for a specific user identified by username or all (active) users containing their full name, email address, and phone indexed by username. Requires 'admin' or 'managers' authorization.

    GET /user/groups
      Returns a array of objects listing name and description for defined membership groups.

    GET /user/list/[<username>]
      Returns the account profile (without credentials) for the specified username or a list of all users if no username is specified. Requires 'admin' authorization for list of users and "self" authentication to return a user's own profile

    POST /user/code/<username>/<code>
      Validates the code sent by the request and activates the respective user acount. No authorization required.  

    POST /user/change/[<username>]
      Change (i.e. create, update, or delete) one or more user profiles, where the request body contains an array of user objects in the form [{ref: <username>, record:<user_data>},...] or [[<username>,<user_data>],...]. Request requires "self" authentication to change one's own profile or 'admin' or 'manager' authorization to change other accounts. Non-admin authorization limits changes, excluding membership and status changes. Null <user_data> will delete the entry, which requires authorization.

    POST /user/groups
      Change (i.e. create, update, or delete) one or more user membership groups, where the request body contains an array of groups in the form [{ref: <name>, record:<group_data>},...] or [[<name>,<group_data>],...]. Null <group_data> will delete the entry. All requests require 'admin' authorization.

#### User Groups 
User groups define membership permissions of users to perform specific actions. Any number of groups may be defined using the POST /user/groups endpoint. _HomebrewDIY_ defines the following groups for dedicated use:

- "admin": "Administrative superuser authorization"
- "manager": "Limitted administrative delegated authorization"
- "users": "Authenticated users"
- "mail": "Authorization to email users"
- "text": "Authorization to text users"
- "grant: "Authorization to grant users temporary access"
- "server: "Authorization to see/change server information"

_Note: Only admin and users required. Admins automatically have all other permissions. New users default to users access only._ 

## Users Database
Authentication and authorization require a users database. The server uses a JSON database format easily editted by hand or through the user endpoints.

The example_users.json database provided in the restricted folders provides a starting point including a 'root' admin user and base group definitions. The default 'root' password is 'pa$$W0rd'. I suggest deleting this account after successfully creating your own admin account.

See [HomebrewDIY.md](https://github.com/CanyonCasa/HomebrewDIY/blob/master/Homebrew_API.md) file for database details.

## Changes

- Initial release 2021-01-01

### To Do

- 