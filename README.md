# HomebrewDIY Guide

#### Keywords:  HomebrewDIY, HomebrewAPI, HomebrewCMS, Homebrew, RAspberry Pi

**_By Dave Campbell_**

### Abstract

The _HomebrewDIY_ implements a complete NodeJS HTTP/S web server ecosystem with reverse proxy frontend, including a complementatary Content Management System (CMS), and recipe-based application programming interface (API). The design requires minimal resources making it ideal for implementing on a Raspberry Pi

## HomebrewDIY Design 

### Introduction
_HomebrewDIY_ represents a scratch-built NodeJS-based web server for small multi-domain/multihosts (~1-5) sites with a complimentary small set of users offering a flexible and full featured platform. It features site-specific custom apps, for websites, blogs, sockets, etc., similar to other Homebrew projects with a simpler code base, flexible configuration, and asynchronous middleware. This version has no framework dependencies, and minimal library dependencies for encryption, proxies, and parsing operations.

### HomebrewDIY Design Features

- NodeJS-based JavaScript server
- Minimal resporces targeting Raspberry Pi installations
- No framework dependency
- Fully JSON-based API
- Flexible configuration
- Native JSON databases
- Reverse Proxy support for multiple domains or hosts
- Support of async middleware for easier synchronous-like code flow
- Optional integrated SMS messaging _(Requires inexpensive Twilio account)_
- Optional email service _(Requires free SendGrid account)_
- Complementary Conctent Management System (CMS)
- A "recipe" based API 

## Installation
_The following instructions assume installation on a Raspberry Pi 3B or greater running Raspian, although it will perform reasonably on a Raspberry Pi 2B, as well as on other systems with mimimal changes, paricularly on Debian based systems._
### 1. DIY User
I recommend creating a dedicated normal user, withoput any admin or sudo privileges. With recommended configuration the server does not require any special or root permissions, which reduces its security vulnerability. The following assumes creation of user _diy_, but any name can be used.

    sudo adduser diy

Answer the appropirate information. Then add the user to the webs groups

    sudo adduser diy webs

### 2. NodeJS

As superuser, install the latest NodeJS Long Term Support (LTS) Version )14.5.3 as of this date) for your appropriate hardware (armv71 for RPi4).

    cd /usr/local/lib
    mkdir nodejs
    cd nodejs
    VERSION=v14.15.3
    DISTRO=linux-armv71
    wget https://nodejs.org/dist/$VERSION/node-$VERSION-$DISTRO.tar.xz
    tar -xJvf node-$VERSION-$DISTRO.tar.xz
    export PATH=/usr/local/lib/nodejs/node-$VERSION-$DISTRO/bin:$PATH
    . ~/.profile
    ln -s /usr/local/lib/nodejs/node-$VERSION-$DISTRO/bin/node /usr/bin/node
    ln -s /usr/local/lib/nodejs/node-$VERSION-$DISTRO/bin/npm /usr/bin/npm
    ln -s /usr/local/lib/nodejs/node-$VERSION-$DISTRO/bin/npx /usr/bin/npx

### 3. Clone Git Repository

Clone a local copy of the GitHub repository to the user home account to get the code and folder layout.

#### Install Node Dependencies

    npm install bcryptjs
    npm install http-proxy
    npm install jsonata
    npm install path-to-regexp

### 4. Utilites

#### TMUX
The Terminal Multiplexer, not requires, offers a convenient way to setup the server to run continously without an active user login as well as running headless. Appendix D of the [Home-Office-Server Documentation](https://github.com/CanyonCasa/Home-Office-Server) provides details.

#### Forever
The NodeJS forever module provides robust operation for the server enabling automatic restart in the event of a crash.

### 5. Define Configuration
The [HomebrewDIY.md](https://github.com/CanyonCasa/HomebrewDIY/blob/master/README.md) document defines server configuration details.

### 6. Build Users Database
The [HomebrewDIY_Auth.md](https://github.com/CanyonCasa/HomebrewDIY/blob/master/README.md) document defines user database details.

## Other Information
See the other Homebrew documents for more details on particular subjects, including

-[Homebrew Overview Documentation](https://github.com/CanyonCasa/HomebrewDIY/blob/master/Homebrew.md)
-[Homebrew API Documentation](https://github.com/CanyonCasa/HomebrewDIY/blob/master/Homebrew_API.md)
-[Homebrew Authentication and Authorization Documentation](https://github.com/CanyonCasa/HomebrewDIY/blob/master/Homebrew_Auth.md)
-[Homebrew Content Management System Documentation](https://github.com/CanyonCasa/HomebrewDIY/blob/master/Homebrew_CMS.md)

## Changes

- Initial release 2021-01-01

### To Do

- Documentation
- More examples
- Web sockets