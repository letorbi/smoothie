//
// This file is part of //\ Tarp.
//
// Copyright (C) 2013-2017 Torben Haase <https://pixelsvsbytes.com>
//
// Tarp is free software: you can redistribute it and/or modify it under the
// terms of the GNU Lesser General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option) any
// later version.
//
// Tarp is distributed in the hope that it will be useful, but WITHOUT ANY
// WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
// A PARTICULAR PURPOSE.  See the GNU Lesser General Public License for more
// details.You should have received a copy of the GNU Lesser General Public
// License along with Tarp.  If not, see <http://www.gnu.org/licenses/>.
//
////////////////////////////////////////////////////////////////////////////////

// NOTE The load parameter points to the function, which prepares the
//      environment for each module and runs its code. Scroll down to the end of
//      the file to see the function definition.
(function() { 'use strict';

// NOTE Mozilla still sets the wrong fileName property for errors that occur
//      inside an eval call (even with sourceURL). However, the stack
//      contains the correct source, so it can be used to re-threw the error
//      with the correct fileName property.
// WARN Re-throwing an error object will mess up the stack trace and the
//      column number.
if (typeof (new Error()).fileName == "string") {
  self.addEventListener("error", function(evt) {
    if (evt.error instanceof Error) {
      var m = evt.error.stack.match(/^[^\n@]*@([^\n]+):\d+:\d+/);
      if (m && evt.error.fileName != m[1]) {
        evt.preventDefault();
        throw new evt.error.constructor(evt.error.message, m[1], evt.error.lineNumber);
      }
    }
  }, false);
}

// INFO Module root
//      Module identifiers starting with neither '/' nor '.' are resolved
//      from the module root. The module root can be changed at any time
//      by setting require.root. Already loaded modules won't be affected
//      from the change. Relative and absolute root paths are accepted, the
//      default value is the URI of the document that loaded require.

// INFO Module cache
//      Contains getter functions for the exports objects of all the loaded
//      modules. As long as a module has not been loaded the getter is either
//      undefined or contains the module code as a string (in case the
//      module has been pre-loaded in a bundle).

var Object_create = Object.create, requests = Object_create(null),
    cache = Object_create(null), promises = Object_create(null);

// INFO Module getter
//      Takes a module identifier, resolves it and gets the module code via an
//      AJAX request from the module URI. If this was successful the code and
//      some environment variables are passed to the load function. The return
//      value is the module's `exports` object. If the cache already
//      contains an object for the module id, this object is returned directly.
// NOTE If a callback function has been passed, the AJAX request is asynchronous
//      and the mpdule exports are passed to the callback function after the
//      module has been loaded.

function factory(parent) {
  function require(id, async) {
    var noLoad, url, href, promise, request, module;

    noLoad = this == require ? 1 : 0;
    // NOTE Matches [[.]/path/to/][file][.js]
    id = id.match(/^((\.)?.*\/|)(.[^\.]*|)(\..*|)$/);
    href = (url = new URL(
      id[1] + id[3] + (id[3] && (id[4] || ".js")),
      new URL(id[2] ? (parent ? parent.uri : "") : self.require.root, location.href)
    )).href;
    promise = (promises[href] || (promises[href] = {}))[noLoad];
    if (!promise) 
      promise = promises[href][noLoad] = new Promise(resolver);
    else if (!async) 
      resolver();

    function resolver(resolve) {
      request = requests[href];
      if (!request) {
        request = requests[href] = new XMLHttpRequest();
        request.open('GET', href, async);
        request.addEventListener("load", loader);
        request.send();
      }
      else if (!request.status) {
        if (resolve)
          request.addEventListener("load", loader);
        if (!async)
          request.abort();
          request.open('GET', href);
          request.send();
      }
      else {
        loader();
      }

      function loader() {
        if (request.status != 200)
          throw new Error(href + " " + request.status + " " + request.statusText);
        if (!noLoad && !cache[href]) {
          module = cache[href] = {
            id: url.pathname,
            uri: href,
            filename: href,
            children: new Array(),
            loaded: false,
            parent: parent
          };
          if (parent)
            parent.children.push(module);
          module.require = factory(module);
          if (request.getResponseHeader("Content-Type") == "application/json")
            module.exports = JSON.parse(request.response);
          else
            (new Function("exports,require,module,__filename,__dirname", request.responseText + "\n//# sourceURL=" + href))(
              module.exports = Object_create(null), module.require, module, href, href.match(/.*\//)[0]
            );
          module.loaded = true;
        }
        if (resolve)
          resolve(noLoad ? href : cache[href].exports);
      }
    }

    return async ? promise : (noLoad ? href : cache[href].exports);
  }

  require.resolve = require;
  require.cache = cache;
  return require;
}

// NOTE Add the global require to the global namespace (if possible)
if (self.require)
  console.warn("'self.require' already exists");

// NOTE Create the global require function and set the default root
(self.require = factory(null)).root = "./node_modules/";

})();
