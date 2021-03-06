var async = require('async');
var _ = require('underscore');
var extend = require('extend');
var snippets = require('apostrophe-snippets');
var util = require('util');
var moment = require('moment');
var passwordHash = require('password-hash');
var pwgen = require('xkcd-pwgen');

// Creating an instance of the people module is easy:
// var people = require('apostrophe-people')(options, callback);
//
// If you want to access the constructor function for use in the
// constructor of a module that extends this one, consider:
//
// var people = require('apostrophe-people');
// ... Inside the constructor for the new object ...
// people.People.call(this, options, null);
//
// In fact, this module does exactly that to extend the snippets module
// (see below). Something similar happens on the browser side in
// main.js.

module.exports = people;

function people(options, callback) {
  return new people.People(options, callback);
}

people.People = function(options, callback) {
  var self = this;
  _.defaults(options, {
    instance: 'person',
    name: options.name || 'people',
    label: options.name || 'People',
    icon: options.icon || 'people',
    // The default would be aposPeoplePostMenu, this is more natural
    menuName: 'aposPeopleMenu'
  });

  // The groups module provides an enhanced Directory widget that
  // also covers displaying people
  _.defaults(options, { widget: false });

  options.modules = (options.modules || []).concat([ { dir: __dirname, name: 'people' } ]);

  // TODO this is kinda ridiculous. We need to have a way to call a function that
  // adds some routes before the static route is added. Maybe the static route should
  // be moved so it can't conflict with anything.
  if (!options.addRoutes) {
    options.addRoutes = addRoutes;
  } else {
    var superAddRoutes = options.addRoutes;
    options.addRoutes = function() {
      addRoutes();
      superAddRoutes();
    };
  }

  function addRoutes() {
    self._app.post(self._action + '/username-unique', function(req, res) {
      self._apos.permissions(req, 'edit-people', null, function(err) {
        if (err) {
          res.statusCode = 404;
          return res.send('notfound');
        }
        return generate();
      });

      function generate() {
        var username = req.body.username;
        var done = false;
        async.until(function() { return done; }, attempt, after);
        function attempt(callback) {
          var users = self.get(req, { username: username }, {}, function(err, results) {
            if (err) {
              return callback(err);
            }
            if (results.snippets.length) {
              username += Math.floor(Math.random() * 10);
              return callback(null);
            }
            done = true;
            return callback(null);
          });
        }
        function after(err) {
          if (err) {
            res.statusCode = 500;
            return res.send('error');
          }
          return res.send({ username: username });
        }
      }
    });

    self._app.post(self._action + '/generate-password', function(req, res) {
      self._apos.permissions(req, 'edit-profile', null, function(err) {
        if (err) {
          res.statusCode = 404;
          return res.send('notfound');
        }
        return generate();
      });
      function generate() {
        return res.send({ password: pwgen.generatePassword() });
      }
    });
  }

  // Call the base class constructor. Don't pass the callback, we want to invoke it
  // ourselves after constructing more stuff
  snippets.Snippets.call(this, options, null);

  self.getAutocompleteTitle = function(snippet) {
    var title = snippet.title;
    // Disambiguate
    if (snippet.login) {
      title += ' (' + snippet.username + ')';
    } else {
      title += ' (' + snippet.slug + ')';
    }
    return title;
  };

  // I bet you want some extra fields available along with the title to go with
  // your custom getAutocompleteTitle. Override this to retrieve more stuff.
  // We keep it to a minimum for performance.
  self.getAutocompleteFields = function() {
    return { title: 1, firstName: 1, lastName: 1, _id: 1, login: 1, username: 1, slug: 1 };
  };

  // Attach the groups module to this module, has to be done after initialization
  // because we initialize the users module first. We need access to the groups module
  // in order to perform joins properly. This is not how groups are
  // attached to individual people, note the groupIds property on persons.

  self.setGroups = function(groupsArg) {
    self._groups = groupsArg;
  };

  var superGet = self.get;

  // Adjust sort order, accept the 'login' boolean criteria,
  // join with groups, delete the password field before returning

  self.get = function(req, userCriteria, optionsArg, callback) {
    var options = {};
    var filterCriteria = {};

    // "Why copy the object like this?" If we don't, we're modifying the
    // object that was passed to us, which could lead to side effects
    extend(options, optionsArg || {}, true);

    self._apos.convertBooleanFilterCriteria('login', options, filterCriteria);

    if (options.letter) {
      filterCriteria.lastName = RegExp("^" + RegExp.quote(options.letter), 'i');
    }

    var getGroups = true;
    if (options.getGroups === false) {
      getGroups = false;
    }

    if (!options.sort) {
      options.sort = { lastName: 1, firstName: 1 };
    }

    var criteria = {
      $and: [
        userCriteria,
        filterCriteria
      ]
    };

    return superGet.call(self, req, criteria, options, function(err, results) {
      if (err) {
        return callback(err);
      }
      _.each(results.snippets, function(snippet) {
        // Read access to the password is strictly via Appy's local strategy, anything else
        // must consider it write-only
        delete snippet.password;
      });
      if (getGroups) {
        // Avoid infinite recursion by passing getPeople: false
        // Let the groups permalink to their own best directory pages
        return self._apos.joinByArray(req, results.snippets, 'groupIds', '_groups', { get: self._groups.get, getOptions: { getPeople: false, permalink: true } }, function(err) {
          if (err) {
            return callback(err);
          }
          return callback(null, results);
        });
      } else {
        return callback(null, results);
      }
    });
  };

  // The page needs to be a directory page, served by the groups
  // module

  self.permalink = function(req, snippet, page, callback) {
    snippet.url = page.slug + '/' + snippet.slug;
    return callback(null);
  };

  function appendExtraFields(data, snippet, callback) {
    return callback(null);
  }

  self.beforeSave = function(req, data, snippet, callback) {
    snippet.firstName = self._apos.sanitizeString(data.firstName, 'Jane');
    snippet.lastName = self._apos.sanitizeString(data.lastName, 'Public');

    snippet.login = self._apos.sanitizeBoolean(data.login);
    snippet.username = self._apos.sanitizeString(data.username);

    // Leading _ is a mnemonic reminding me to NOT store plaintext passwords directly!
    var _password = self._apos.sanitizeString(data.password, null);

    if ((!snippet.password) || (_password !== null)) {
      if (_password === null) {
        _password = self._apos.generateId();
      }
      // password-hash npm module generates a lovely string formatted:
      //
      // algorithmname:salt:hash
      //
      // With a newly generated salt. So before you ask, yes, a salt is being used here
      snippet.password = passwordHash.generate(_password);
    }

    snippet.email = self._apos.sanitizeString(data.email);
    snippet.phone = self._apos.sanitizeString(data.phone);
    return callback(null);
  };

  var superAddApiCriteria = self.addApiCriteria;
  self.addApiCriteria = function(query, criteria, options) {
    superAddApiCriteria.call(self, query, criteria, options);
    options.login = 'any';
  };

  // The best engine page for a person is the best engine page
  // for their first group: the directory page that suits their
  // first group. TODO: think about the fact that groups don't
  // maintain a guaranteed pecking order right now. Possibly we
  // should guarantee that a user's groups can be ordered

  self.findBestPage = function(req, snippet, callback) {
    if (!req.aposBestPageByGroupId) {
      req.aposBestPageByGroupId = {};
    }
    var groupId = snippet.groupIds ? snippet.groupIds[0] : undefined;
    if (groupId === undefined) {
      // The best engine page for a user with no groups is a general
      // purpose one, best matched by asking for a page for a group
      // with an id no real page will be locked down to.
      return self._groups.findBestPage(req, { _id: 'dummy', type: 'group' }, callback);
    }
    var group;
    var page;
    // Cache for performance
    if (req.aposBestPageByGroupId[groupId]) {
      return callback(null, req.aposBestPageByGroupId[groupId]);
    }
    async.series([ getFirstGroup, findBest ], function(err) {
      if (err) {
        return callback(err);
      }
      req.aposBestPageByGroupId[group._id] = page;
      return callback(null, page);
    });
    function getFirstGroup(callback) {
      if (snippet._groups) {
        group = snippet._groups[0];
        return callback(null);
      }
      return self._groups.getOne(req, { _id: { $in: snippet._groupIds || [] } }, {}, function(err, groupArg) {
        if (err) {
          return callback(err);
        }
        group = groupArg;
        return callback(null);
      });
    }
    function findBest(callback) {
      // The best engine page for a user with no groups is the
      // best engine page for a nonexistent group
      if (!group) {
        group = { _id: 'dummy', type: 'group' };
      }
      return self._groups.findBestPage(req, group, function(err, pageArg) {
        page = pageArg;
        return callback(err);
      });
    }
  };

  // Use a permissions event handler to put the kibosh on
  // any editing of people by non-admins for now. Later we'll have
  // ways to do that safely without access to the login checkbox
  // in certain situations

  self._apos.on('permissions', function(req, action, result) {
    if (action.match(/\-people$/) && (action !== 'view-people')) {
      if (!(req.user && req.user.permissions.admin)) {
        result.response = 'Forbidden';
      }
    }
  });

  var superDispatch = self.dispatch;
  self.dispatch = function(req, callback) {
    console.log('DEPRECATED: the people module should no longer be used to create staff directory pages. Instead use the groups module which is designed to serve up directories using data from both people and groups.');
    return superDispatch.call(this, req, callback);
  };

  if (callback) {
    // Invoke callback on next tick so that the people object
    // is returned first and can be assigned to a variable for
    // use in whatever our callback is invoking
    process.nextTick(function() { return callback(null); });
  }
};

